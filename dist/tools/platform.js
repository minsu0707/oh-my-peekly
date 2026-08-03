import { z } from "zod";
import { getCredentials, saveCredentials } from "../platform/credentials.js";
import { findLocalFile } from "../platform/fileSearch.js";
import { openInViewer } from "../platform/viewer.js";
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
const saveCredentialsInput = {
    serviceUrl: z
        .string()
        .describe("URL (or hostname) of the site the credentials belong to. Used as the cache key (normalized to origin)."),
    loginId: z.string().describe("Login ID to cache."),
    password: z.string().describe("Password to cache. Never echoed back in errors/logs."),
};
const saveCredentialsOutput = {
    success: z.boolean(),
    error: z.string().optional(),
};
const getCredentialsInput = {
    serviceUrl: z.string().describe("URL (or hostname) of the site to look up cached credentials for."),
};
const getCredentialsOutput = {
    success: z.boolean(),
    found: z.boolean().optional(),
    loginId: z.string().optional(),
    password: z.string().optional(),
    error: z.string().optional(),
};
const findLocalFileInput = {
    filename: z
        .string()
        .describe("Exact filename to search for (not a full path), e.g. 'template.pptx'."),
};
const findLocalFileOutput = {
    success: z.boolean(),
    found: z.boolean().optional(),
    path: z.string().optional(),
    matchCount: z.number().optional(),
    error: z.string().optional(),
};
const openInViewerInput = {
    filePath: z.string().describe("Absolute path to the file to open in the OS's default viewer/app."),
};
const openInViewerOutput = {
    success: z.boolean(),
    error: z.string().optional(),
};
export function registerPlatformTools(server) {
    server.registerTool("save_credentials", {
        title: "Save credentials",
        description: "Cache a login ID/password for a service URL in the OS credential store (Keychain on macOS, " +
            "Credential Manager on Windows, via keytar) so later calls don't need re-entry. The cache key is the " +
            "URL's origin, so different paths/queries on the same site share one cached entry.",
        inputSchema: saveCredentialsInput,
        outputSchema: saveCredentialsOutput,
    }, async ({ serviceUrl, loginId, password }) => {
        try {
            await saveCredentials(serviceUrl, loginId, password);
            return textResult({ success: true });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("get_credentials", {
        title: "Get cached credentials",
        description: "Look up a previously cached login ID/password for a service URL. Returns found: false (not an error) " +
            "when nothing is cached yet — the caller decides whether to prompt for credentials in that case.",
        inputSchema: getCredentialsInput,
        outputSchema: getCredentialsOutput,
    }, async ({ serviceUrl }) => {
        try {
            const stored = await getCredentials(serviceUrl);
            if (!stored) {
                return textResult({ success: true, found: false });
            }
            return textResult({
                success: true,
                found: true,
                loginId: stored.loginId,
                password: stored.password,
            });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("find_local_file", {
        title: "Find local file by name",
        description: "Search OS-appropriate fixed locations (Spotlight on macOS, a fixed set of recursively-searched " +
            "folders such as Downloads/Desktop/Documents on Windows) for a file matching an exact filename " +
            "(not a full path). Reports only whether/where it was found and how many matches existed — does " +
            "not judge which match is 'correct'.",
        inputSchema: findLocalFileInput,
        outputSchema: findLocalFileOutput,
    }, async ({ filename }) => {
        try {
            const result = await findLocalFile(filename);
            return textResult({ success: true, ...result });
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
    server.registerTool("open_in_viewer", {
        title: "Open file in default viewer",
        description: "Open a file (e.g. a screenshot) in the OS's default viewer/associated app (`open` on macOS, " +
            "`start` on Windows). Reports only success/failure of the open attempt.",
        inputSchema: openInViewerInput,
        outputSchema: openInViewerOutput,
    }, async ({ filePath }) => {
        try {
            const result = await openInViewer(filePath);
            return textResult({ success: result.success, error: result.error }, !result.success);
        }
        catch (error) {
            return textResult({ success: false, error: errorMessage(error) }, true);
        }
    });
}
//# sourceMappingURL=platform.js.map