#!/usr/bin/env python
"""Peekly PPT report generator — python-pptx subprocess worker.

Invoked by the Node MCP tool `generate_report` (see ../tools/report.ts) via
child_process. Reads one JSON job from stdin and writes one JSON result
line to stdout; never writes anything else to stdout (diagnostics, if any,
must go to stderr) so the caller can parse stdout as a single JSON value.

stdin:
  {
    "templatePath": "<absolute path to read-only .pptx template>",
    "outputPath": "<absolute path to write the generated .pptx to>",
    "issues": [
      {"breadcrumb": str, "screenshotPath": str, "problem": str, "improvement": str},
      ...
    ]
  }

stdout (exactly one line, success):
  {"success": true, "outputPath": "...", "slideCount": N}

stdout (exactly one line, failure):
  {"success": false, "error": "..."}

------------------------------------------------------------------------
PROVISIONAL / UNCONFIRMED — see CONVENTIONS.md section 8 and design doc
section 3.6. No real PPT template exists yet (the user will supply one
later). Until then this script assumes a placeholder-marker convention
invented for this MVP, which WILL need re-validation against the real
template:

  - Slide 0 of the template is the cover slide (untouched).
  - Slide index 1 is the "issue slide" template. It is cloned once per
    confirmed issue, then the original template slide is dropped, so the
    final deck is: cover + one slide per issue.
  - Text fields are substituted via literal token replacement inside text
    frames: {{breadcrumb}}, {{problem}}, {{improvement}}. Replacement only
    works if a whole token lives inside a single text run — if a real
    template's authoring tool splits "{{breadcrumb}}" across multiple runs
    (e.g. due to autocorrect/spell-check boundaries), the token will not
    be found. This is a known limitation of the run-level find/replace
    technique, not something this script works around.
  - The screenshot field is substituted by locating a Picture shape whose
    `shape.name == "screenshot"` on the issue-slide template and swapping
    its embedded image. If no such shape exists, this is treated as a hard
    error for that issue (never silently skipped) — a QA report silently
    missing a screenshot would be a serious, easy-to-miss defect.

None of the above should be treated as a confirmed spec; it is a best
guess to unblock the MVP pipeline pending the real template file.
------------------------------------------------------------------------

Slide-duplication technique: python-pptx has no native "duplicate slide"
API. This uses the well-known workaround of deep-copying the template
slide's shape XML onto a freshly added blank-layout slide, while also
copying (and rId-remapping) the template slide's non-layout relationships
— chiefly the image relationship backing its placeholder picture — so
that the copied shapes' r:embed/r:id references keep resolving correctly
in the new slide part.

Known limitation: dropping the original template slide from the slide
list (`_remove_slide_at`) removes it from the presentation's render order
but does not garbage-collect its now-unreferenced XML part from the
.pptx zip package. This is harmless (the file still opens fine in
PowerPoint; unused parts/relationships are valid per the OPC spec) but
leaves a small amount of dead weight in the output file. Acceptable for
this MVP.
"""
from __future__ import annotations

import copy
import json
import os
import shutil
import sys
from typing import Any

from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

# PROVISIONAL constants — see module docstring.
ISSUE_TEMPLATE_SLIDE_INDEX = 1
SCREENSHOT_SHAPE_NAME = "screenshot"

_R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_R_NS_PREFIX = "{%s}" % _R_NS


def _duplicate_slide(prs: Presentation, template_slide) -> Any:
    """Append a new slide that is a deep copy of `template_slide` (shapes +
    non-layout relationships) and return it."""
    layout = template_slide.slide_layout
    new_slide = prs.slides.add_slide(layout)

    # add_slide() auto-populates placeholder shapes from the layout; discard
    # them — we want an exact copy of the template slide's own shapes.
    for shape in list(new_slide.shapes):
        shape._element.getparent().remove(shape._element)

    # Copy relationships (images, hyperlinks, ...), excluding the slide's
    # link to its layout (add_slide() already established that one).
    # get_or_add()/get_or_add_ext_rel() mint a fresh rId in the new slide
    # part, so track an old->new map to rewrite references inside the
    # copied shape XML below.
    rid_remap: dict[str, str] = {}
    for rid, rel in template_slide.part.rels.items():
        if rel.reltype == RT.SLIDE_LAYOUT:
            continue
        if rel.is_external:
            new_rid = new_slide.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
        else:
            new_rid = new_slide.part.rels.get_or_add(rel.reltype, rel.target_part)
        if new_rid != rid:
            rid_remap[rid] = new_rid

    for shape in template_slide.shapes:
        new_el = copy.deepcopy(shape._element)
        if rid_remap:
            for el in new_el.iter():
                for attr_name, attr_val in list(el.attrib.items()):
                    if attr_name.startswith(_R_NS_PREFIX) and attr_val in rid_remap:
                        el.set(attr_name, rid_remap[attr_val])
        new_slide.shapes._spTree.insert_element_before(new_el, "p:extLst")

    return new_slide


def _remove_slide_at(prs: Presentation, index: int) -> None:
    """Drop the slide currently at `index` from the presentation's slide
    order. See module docstring for the known part-GC limitation."""
    id_list = prs.slides._sldIdLst
    sld_ids = list(id_list)
    id_list.remove(sld_ids[index])


def _replace_text_tokens(slide, mapping: dict[str, str]) -> None:
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                for token, value in mapping.items():
                    if token in run.text:
                        run.text = run.text.replace(token, value)


def _replace_screenshot(slide, image_path: str) -> None:
    shape = None
    for candidate in slide.shapes:
        if candidate.name == SCREENSHOT_SHAPE_NAME:
            shape = candidate
            break
    if shape is None:
        raise LookupError(
            f"no Picture shape named '{SCREENSHOT_SHAPE_NAME}' found on the issue-slide template "
            "(PROVISIONAL placeholder-marker convention — see this script's module docstring; "
            "re-validate against the real template)"
        )
    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    blip = shape._element.blipFill.blip
    if blip is None:
        raise LookupError(f"shape '{SCREENSHOT_SHAPE_NAME}' has no blip fill (not a picture shape?)")

    _, rid = slide.part.get_or_add_image_part(image_path)
    blip.set(qn("r:embed"), rid)


def _generate_report(job: dict[str, Any]) -> dict[str, Any]:
    template_path = job["templatePath"]
    output_path = job["outputPath"]
    issues = job.get("issues", [])

    if not os.path.isfile(template_path):
        return {"success": False, "error": f"template not found: {template_path}"}

    # Original template is always read-only: copy first, then only ever
    # open/modify/save the copy at output_path. Never open template_path
    # itself with Presentation() for editing.
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    shutil.copyfile(template_path, output_path)

    prs = Presentation(output_path)

    if len(prs.slides) <= ISSUE_TEMPLATE_SLIDE_INDEX:
        return {
            "success": False,
            "error": (
                f"template must have at least {ISSUE_TEMPLATE_SLIDE_INDEX + 1} slides "
                f"(cover + issue template expected at index {ISSUE_TEMPLATE_SLIDE_INDEX}), "
                f"found {len(prs.slides)}"
            ),
        }

    template_slide = prs.slides[ISSUE_TEMPLATE_SLIDE_INDEX]

    for i, issue in enumerate(issues):
        for field in ("breadcrumb", "screenshotPath", "problem", "improvement"):
            if field not in issue:
                return {"success": False, "error": f"issues[{i}] missing required field '{field}'"}

        new_slide = _duplicate_slide(prs, template_slide)
        _replace_text_tokens(
            new_slide,
            {
                "{{breadcrumb}}": issue["breadcrumb"],
                "{{problem}}": issue["problem"],
                "{{improvement}}": issue["improvement"],
            },
        )
        try:
            _replace_screenshot(new_slide, issue["screenshotPath"])
        except FileNotFoundError:
            return {"success": False, "error": f"issues[{i}]: screenshot file not found: {issue['screenshotPath']}"}
        except LookupError as e:
            return {"success": False, "error": f"issues[{i}]: {e}"}

    _remove_slide_at(prs, ISSUE_TEMPLATE_SLIDE_INDEX)

    slide_count = len(prs.slides)
    prs.save(output_path)

    return {"success": True, "outputPath": output_path, "slideCount": slide_count}


def main() -> int:
    try:
        # Read stdin as raw bytes and decode as UTF-8 explicitly — sys.stdin's
        # default text-mode encoding follows the OS locale (e.g. cp949 on
        # Korean Windows), which silently mangles the UTF-8 bytes Node writes
        # for non-ASCII (Korean) issue text into invalid lone surrogates.
        raw = sys.stdin.buffer.read().decode("utf-8")
        job = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"invalid JSON on stdin: {e}"}))
        return 1

    try:
        result = _generate_report(job)
    except Exception as e:  # top-level worker boundary: always report structured JSON, never a bare traceback on stdout
        print(json.dumps({"success": False, "error": f"{type(e).__name__}: {e}"}))
        return 1

    print(json.dumps(result))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
