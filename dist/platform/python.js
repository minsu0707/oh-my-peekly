import * as os from "node:os";
/**
 * Returns the OS-appropriate command name for invoking Python 3, so
 * callers outside this module never need to branch on `os.platform()`
 * themselves (CONVENTIONS.md section 4: OS branching lives only under
 * src/platform/).
 *
 * Windows has no `python3` alias by default, so `python` is used there;
 * macOS/Linux commonly alias `python` to Python 2 or nothing at all, so
 * `python3` is used there instead.
 */
export function getPythonCommand() {
    return os.platform() === "win32" ? "python" : "python3";
}
//# sourceMappingURL=python.js.map