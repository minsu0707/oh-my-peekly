import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Result shape shared by both OS implementations (design doc section 4:
 * "두 구현의 반환 인터페이스... 동일해야 한다"). `matchCount` is included even
 * when `found` is false (as 0) so callers can tell "searched, found nothing"
 * apart from a search that errored before completing.
 */
export interface FindLocalFileResult {
  found: boolean;
  path?: string;
  matchCount?: number;
}

/**
 * PROVISIONAL fixed folder list searched on Windows. Design doc section 4
 * names Downloads/Desktop as examples but doesn't finalize the full list;
 * Documents is added as a third common save location. Not a confirmed spec
 * — see CONVENTIONS.md section 8. Built with path.join/os.homedir() only,
 * never a hardcoded path string.
 */
function defaultSearchRoots(): string[] {
  const home = os.homedir();
  return [path.join(home, "Downloads"), path.join(home, "Desktop"), path.join(home, "Documents")];
}

/**
 * PROVISIONAL cap on directory entries visited during the Windows recursive
 * search, mirroring `DEFAULT_MAX_PAGES` in src/tools/crawler.ts: without a
 * ceiling, a very large folder tree (or an accidental symlink loop) could
 * make a single filename lookup run effectively forever. Not a confirmed
 * spec (CONVENTIONS.md section 8).
 */
const DEFAULT_MAX_VISITED_ENTRIES = 20000;

async function searchWindows(filename: string): Promise<FindLocalFileResult> {
  const matches: string[] = [];
  let visited = 0;

  async function walk(dir: string): Promise<void> {
    if (visited >= DEFAULT_MAX_VISITED_ENTRIES) {
      return;
    }
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Folder missing/unreadable (e.g. permission denied) — skip it rather
      // than failing the whole search.
      return;
    }

    for (const entry of entries) {
      if (visited >= DEFAULT_MAX_VISITED_ENTRIES) {
        return;
      }
      visited++;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === filename) {
        matches.push(fullPath);
      }
    }
  }

  for (const root of defaultSearchRoots()) {
    await walk(root);
  }

  const [first] = matches;
  return first !== undefined
    ? { found: true, path: first, matchCount: matches.length }
    : { found: false, matchCount: 0 };
}

/**
 * macOS implementation using Spotlight's `mdfind -name` (design doc section
 * 4). Not runnable/verifiable in this (Windows) environment — reviewed for
 * shape/correctness only, not executed.
 */
async function searchMac(filename: string): Promise<FindLocalFileResult> {
  return new Promise((resolve) => {
    const child = spawn("mdfind", ["-name", filename]);
    let stdout = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => {
      // mdfind unavailable or failed to spawn — report as "not found" rather
      // than throwing, consistent with the Windows branch's error handling.
      resolve({ found: false, matchCount: 0 });
    });
    child.on("close", () => {
      const lines = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const [first] = lines;
      resolve(
        first !== undefined
          ? { found: true, path: first, matchCount: lines.length }
          : { found: false, matchCount: 0 }
      );
    });
  });
}

/**
 * Finds a file by exact filename (not a full path) in OS-appropriate
 * locations: Spotlight on macOS, a fixed set of recursively-searched folders
 * on Windows. Both branches return the same shape; when multiple matches
 * exist, the first one is used but `matchCount` reports how many were found
 * so the caller can decide whether to disambiguate.
 */
export async function findLocalFile(filename: string): Promise<FindLocalFileResult> {
  return os.platform() === "win32" ? searchWindows(filename) : searchMac(filename);
}
