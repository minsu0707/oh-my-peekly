import { z } from "zod";
/**
 * PROVISIONAL constants — design doc section 6 ("예상 비용 산출 공식") is an
 * open issue with no confirmed formula. These numbers are placeholder
 * assumptions only, named explicitly so they're easy to find and replace
 * once the formula is settled. Do not treat these as a confirmed spec
 * (see CONVENTIONS.md section 8).
 *
 * Rough reasoning behind the placeholders:
 * - Each checklist item on a screen is assumed to cost one LLM-driven check
 *   (navigate/observe/click/verify), each taking roughly this long.
 * - Each such check is assumed to cost roughly this much in LLM API usage.
 */
const MINUTES_PER_CHECKLIST_ITEM = 1.5;
const KRW_PER_CHECKLIST_ITEM = 50;
/**
 * PROVISIONAL default checklist-item count per screen, used only when the
 * caller doesn't supply one. The design doc's "기본 체크리스트" is also an
 * open issue (section 6), so this number is a placeholder, not a confirmed
 * default checklist size.
 */
const DEFAULT_CHECKLIST_ITEM_COUNT = 5;
function textResult(payload, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError,
    };
}
const estimateCostInput = {
    screenCount: z.number().int().nonnegative().describe("Number of screens to be tested."),
    checklistItemCount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Number of checklist items assumed per screen. Provisional default: ${DEFAULT_CHECKLIST_ITEM_COUNT} ` +
        "(design doc's default-checklist question is still open)."),
};
const estimateCostOutput = {
    success: z.boolean(),
    estimatedMinutes: z.number().optional(),
    estimatedCostKrw: z.number().optional(),
    assumptions: z
        .object({
        screenCount: z.number(),
        checklistItemCount: z.number(),
        minutesPerChecklistItem: z.number(),
        krwPerChecklistItem: z.number(),
    })
        .optional(),
    error: z.string().optional(),
};
export function registerCostTools(server) {
    server.registerTool("estimate_cost", {
        title: "Estimate test cost and time",
        description: "Given a screen count (typically from sitemap_crawl) and an optional checklist-item-per-screen count, " +
            "estimate the total test duration (minutes) and cost (KRW) using PROVISIONAL placeholder constants " +
            "(see source comments) — the formula in the design doc is not yet finalized. Returns the assumptions " +
            "used so the caller can present them to the user for confirmation before starting the actual test run.",
        inputSchema: estimateCostInput,
        outputSchema: estimateCostOutput,
    }, async ({ screenCount, checklistItemCount }) => {
        const items = checklistItemCount ?? DEFAULT_CHECKLIST_ITEM_COUNT;
        const totalChecks = screenCount * items;
        const estimatedMinutes = totalChecks * MINUTES_PER_CHECKLIST_ITEM;
        const estimatedCostKrw = totalChecks * KRW_PER_CHECKLIST_ITEM;
        return textResult({
            success: true,
            estimatedMinutes,
            estimatedCostKrw,
            assumptions: {
                screenCount,
                checklistItemCount: items,
                minutesPerChecklistItem: MINUTES_PER_CHECKLIST_ITEM,
                krwPerChecklistItem: KRW_PER_CHECKLIST_ITEM,
            },
        });
    });
}
//# sourceMappingURL=cost.js.map