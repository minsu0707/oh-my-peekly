import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

export interface OpenInViewerResult {
  success: boolean;
  error?: string;
}

/**
 * Opens a file in the OS's default viewer/associated app: `open` on macOS,
 * `start` (via `cmd /c`) on Windows (design doc section 4).
 *
 * `start` is a cmd.exe built-in, not a standalone executable, so it can't be
 * spawned directly — it must be invoked through `cmd /c`. The path is always
 * passed as its own argv entry (never concatenated into a single shell
 * string), so spaces or special characters in the path can't be reinterpreted
 * by the shell. The empty string argument before the path is `start`'s
 * window-title slot: without it, `start` would treat a quoted path as the
 * title instead of the target to open.
 *
 * Existence is checked up front so a bad path fails fast with a plain error
 * instead of launching (or failing to launch) a real GUI viewer/showing an
 * OS error dialog.
 */
export async function openInViewer(filePath: string): Promise<OpenInViewerResult> {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `file not found: ${filePath}` };
  }

  const isWindows = os.platform() === "win32";
  const command = isWindows ? "cmd" : "open";
  const args = isWindows ? ["/c", "start", "", filePath] : [filePath];

  return new Promise((resolve) => {
    let settled = false;
    let child;
    try {
      child = spawn(command, args, { stdio: "ignore" });
    } catch (error) {
      resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ success: false, error: error.message });
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve({ success: true });
    });
  });
}
