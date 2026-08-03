import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
/**
 * Plain (non-secret) per-machine settings cache — separate from
 * credentials.ts, which uses keytar for actual secrets. Settings like
 * "review each issue individually or auto-include" aren't sensitive, so
 * a plain JSON file is simpler than routing them through the OS
 * credential store.
 */
const CONFIG_DIR = path.join(os.homedir(), ".peekly");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
function readSettingsFile() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
function writeSettingsFile(settings) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), "utf-8");
}
export function getSetting(key) {
    const settings = readSettingsFile();
    if (!Object.prototype.hasOwnProperty.call(settings, key)) {
        return { found: false };
    }
    return { found: true, value: settings[key] };
}
export function saveSetting(key, value) {
    const settings = readSettingsFile();
    settings[key] = value;
    writeSettingsFile(settings);
}
//# sourceMappingURL=settings.js.map