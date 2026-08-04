#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Bundled skill sources live at <package root>/skills, a sibling of dist/
 * (see package.json "files": ["dist", "skills"]) — not inside dist/, since
 * they're static content, not compiled output.
 */
const SKILLS_SOURCE_ROOT = path.join(__dirname, "..", "skills");
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
/**
 * Copies the bundled `oh-my-peekly` skill into the user's PERSONAL skill
 * directory (`~/.claude/skills/oh-my-peekly/`), not a per-project one. This is
 * a one-time, install-once-use-everywhere setup: personal-scope skills
 * apply across all of the user's projects (personal scope also overrides
 * project scope, so this still wins even in a project that happens to
 * have its own `.claude/skills/oh-my-peekly`). Pass `--project` to install into
 * the current directory's `.claude/skills/oh-my-peekly/` instead, for the rare
 * case of a project-pinned override.
 */
function installSkill(args) {
    const skillName = "oh-my-peekly";
    const source = path.join(SKILLS_SOURCE_ROOT, skillName);
    if (!fs.existsSync(source)) {
        console.error(`Bundled skill not found at ${source}`);
        process.exitCode = 1;
        return;
    }
    const projectScope = args.includes("--project");
    const skillsRoot = projectScope
        ? path.join(process.cwd(), ".claude", "skills")
        : path.join(os.homedir(), ".claude", "skills");
    const targetDir = path.join(skillsRoot, skillName);
    copyDirRecursive(source, targetDir);
    console.log(`oh-my-peekly skill installed to ${targetDir}`);
    console.log(`If ${skillsRoot} didn't already exist, restart Claude Code (or start a new session) so it picks up the new directory, then use /oh-my-peekly.`);
}
function main() {
    const [command, ...rest] = process.argv.slice(2);
    switch (command) {
        case "install-skill":
            installSkill(rest);
            break;
        default:
            console.error(`Unknown command: ${command ?? "(none)"}\nUsage: peekly install-skill [--project]`);
            process.exitCode = 1;
    }
}
main();
//# sourceMappingURL=cli.js.map