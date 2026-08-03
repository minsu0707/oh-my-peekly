#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled skill sources live at <package root>/skills, a sibling of dist/
 * (see package.json "files": ["dist", "skills"]) — not inside dist/, since
 * they're static content, not compiled output.
 */
const SKILLS_SOURCE_ROOT = path.join(__dirname, "..", "skills");

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copies the bundled `peekly` skill into the current project's
 * `.claude/skills/peekly/`. PROVISIONAL: only installs at project scope
 * (cwd), not personal scope (~/.claude/skills) — the design doc doesn't
 * specify which, and project scope matches how this repo tests itself
 * (see CONVENTIONS.md section 8).
 */
function installSkill(): void {
  const skillName = "peekly";
  const source = path.join(SKILLS_SOURCE_ROOT, skillName);
  if (!fs.existsSync(source)) {
    console.error(`Bundled skill not found at ${source}`);
    process.exitCode = 1;
    return;
  }

  const targetDir = path.join(process.cwd(), ".claude", "skills", skillName);
  copyDirRecursive(source, targetDir);
  console.log(`Peekly skill installed to ${targetDir}`);
  console.log(
    "If .claude/skills/ didn't already exist in this project, restart Claude Code (or start a new session) so it picks up the new directory, then use /peekly."
  );
}

function main(): void {
  const command = process.argv[2];
  switch (command) {
    case "install-skill":
      installSkill();
      break;
    default:
      console.error(`Unknown command: ${command ?? "(none)"}\nUsage: peekly install-skill`);
      process.exitCode = 1;
  }
}

main();
