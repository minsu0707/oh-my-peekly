import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getPythonCommand } from "../platform/python.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Resolved relative to this compiled file's own location (dist/tools/report.js
 * -> ../report/pptx_tool.py -> dist/report/pptx_tool.py), mirroring the same
 * relative layout in src/. The build script copies pptx_tool.py into
 * dist/report/ alongside the compiled JS (see package.json "build" script) —
 * tsc itself only compiles .ts files, so without that copy step this path
 * would exist in src/ but not in dist/.
 */
const PPTX_TOOL_SCRIPT = path.join(__dirname, "..", "report", "pptx_tool.py");
function textResult(payload, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError,
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * PROVISIONAL default output-path rule. The design doc / peekly-report-builder
 * agent charter describes a `템플릿이름_계정명_날짜` default filename, but this
 * tool is deliberately scoped to "one call = one account's report" and its
 * input schema (per this task's spec) has no required account concept beyond
 * the optional `accountName` used only here. When `accountName` is omitted,
 * the filename simply drops that segment. Not a confirmed spec — see
 * CONVENTIONS.md section 8.
 */
function defaultOutputPath(templatePath, accountName) {
    const dir = path.dirname(templatePath);
    const base = path.basename(templatePath, path.extname(templatePath));
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const parts = [base, accountName, date].filter((p) => typeof p === "string" && p.length > 0);
    return path.join(dir, `${parts.join("_")}.pptx`);
}
const problemAreaSchema = z
    .object({
    xFraction: z.number().min(0).max(1).describe("Left edge of the problem area, as a fraction (0-1) of the screenshot's width."),
    yFraction: z.number().min(0).max(1).describe("Top edge of the problem area, as a fraction (0-1) of the screenshot's height."),
    widthFraction: z.number().min(0).max(1).describe("Width of the problem area, as a fraction (0-1) of the screenshot's width."),
    heightFraction: z.number().min(0).max(1).describe("Height of the problem area, as a fraction (0-1) of the screenshot's height."),
})
    .describe("Optional bounding box marking exactly where the problem is on the screenshot, as fractions (0-1) of the " +
    "screenshot image's own width/height — NOT pixels, so it scales correctly regardless of how the " +
    "screenshot placeholder is sized on the slide. Typically computed from browser_bounding_box's pixel " +
    "box divided by browser_screenshot's width/height. When provided, a no-fill outlined rectangle is drawn " +
    "over the screenshot at this location; when omitted, no annotation is drawn.");
const issueSchema = z.object({
    breadcrumb: z.string().describe("Path breadcrumb text for this issue, e.g. 'Home > List > Detail'."),
    screenshotPath: z.string().describe("Absolute path to the screenshot image file for this issue."),
    problem: z.string().describe("Description of the problem found."),
    improvement: z.string().describe("Suggested improvement/fix."),
    problemArea: problemAreaSchema.optional(),
});
const generateReportInput = {
    templatePath: z
        .string()
        .describe("Absolute path to the .pptx template. Always treated as read-only — never opened for writing; a copy is " +
        "made at outputPath and only that copy is modified."),
    outputPath: z
        .string()
        .optional()
        .describe("Absolute path to write the generated .pptx to. If omitted, a PROVISIONAL default is derived from " +
        "templatePath (+ optional accountName) and today's date — see source comments."),
    accountName: z
        .string()
        .optional()
        .describe("Optional account label, used only to build the PROVISIONAL default outputPath when outputPath is " +
        "omitted. This tool always generates exactly one report for one account per call — to report on " +
        "multiple accounts, call this tool once per account rather than passing a mixed issues list."),
    issues: z
        .array(issueSchema)
        .describe("Issues to render, one slide each, in array order. Must already be filtered to confirmed issues only — " +
        "this tool does not judge which issues belong in the report (that filtering, e.g. excluding '정상 확인' " +
        "items, is the caller/workflow's responsibility, not this tool's)."),
};
const generateReportOutput = {
    success: z.boolean(),
    outputPath: z.string().optional(),
    slideCount: z.number().optional(),
    error: z.string().optional(),
};
function runPythonWorker(job) {
    return new Promise((resolve, reject) => {
        const child = spawn(getPythonCommand(), [PPTX_TOOL_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ stdout, stderr, code }));
        child.stdin.write(JSON.stringify(job));
        child.stdin.end();
    });
}
export function registerReportTools(server) {
    server.registerTool("generate_report", {
        title: "Generate PPT QA report",
        description: "Generate one .pptx QA report for one account from a read-only template by delegating to a Python " +
            "subprocess (python-pptx). Clones the template's issue-slide once per confirmed issue — PROVISIONAL " +
            "assumption: slide index 1 is the issue-slide template, after a cover slide at index 0 — substituting " +
            "{{breadcrumb}}/{{problem}}/{{improvement}} text tokens (auto-shrunk to fit their placeholder box, " +
            "never resized, so they don't grow to overlap the screenshot) and swapping the Picture shape named " +
            "'screenshot' for each issue's screenshot image (a missing 'screenshot' shape is a hard error, not a " +
            "silent skip). When an issue includes problemArea, a no-fill outlined rectangle is drawn over that " +
            "part of the screenshot to point out exactly where the problem is. The template file itself is never " +
            "opened for writing. Call once per account only.",
        inputSchema: generateReportInput,
        outputSchema: generateReportOutput,
    }, async ({ templatePath, outputPath, accountName, issues }) => {
        try {
            if (!fs.existsSync(templatePath)) {
                return textResult({ success: false, error: `template not found: ${templatePath}` }, true);
            }
            const resolvedOutputPath = outputPath ?? defaultOutputPath(templatePath, accountName);
            if (path.resolve(resolvedOutputPath) === path.resolve(templatePath)) {
                return textResult({
                    success: false,
                    error: "outputPath must not be the same file as templatePath — the template is always read-only; choose a different output filename.",
                }, true);
            }
            await fs.promises.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
            const job = { templatePath, outputPath: resolvedOutputPath, issues };
            const { stdout, stderr, code } = await runPythonWorker(job);
            const lastLine = stdout
                .trim()
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .pop();
            if (!lastLine) {
                return textResult({
                    success: false,
                    error: `pptx_tool.py produced no output (exit code ${code}).${stderr.trim() ? ` stderr: ${stderr.trim()}` : ""}`,
                }, true);
            }
            let parsed;
            try {
                parsed = JSON.parse(lastLine);
            }
            catch {
                return textResult({
                    success: false,
                    error: `pptx_tool.py produced non-JSON output: ${lastLine}.${stderr.trim() ? ` stderr: ${stderr.trim()}` : ""}`,
                }, true);
            }
            if (parsed.success !== true) {
                const baseError = typeof parsed.error === "string" ? parsed.error : "unknown error from pptx_tool.py";
                const error = stderr.trim() ? `${baseError} (stderr: ${stderr.trim()})` : baseError;
                return textResult({ success: false, error }, true);
            }
            return textResult(parsed);
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
}
//# sourceMappingURL=report.js.map