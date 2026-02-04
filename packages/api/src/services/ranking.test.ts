import { describe, expect, mock, test } from "bun:test";

type PromptRow = {
	version: number;
	content: string;
	isActive: boolean;
	generation?: number | null;
};

const createDbMock = (initialPrompts: PromptRow[]) => {
	const state = { prompts: [...initialPrompts] };

	const select = (fields?: Record<string, unknown>) => {
		const context = { fields, whereActive: false };
		const execute = async () => {
			let rows = [...state.prompts];
			if (context.whereActive) {
				rows = rows.filter((row) => row.isActive);
			}
			rows.sort((a, b) => b.version - a.version);
			const selected = rows.slice(0, 1).map((row) => {
				if (!context.fields) return row;
				const result: Record<string, unknown> = {};
				for (const key of Object.keys(context.fields)) {
					result[key] = row[key as keyof PromptRow];
				}
				return result;
			});
			return selected;
		};

		const query = {
			from: () => query,
			where: () => {
				context.whereActive = true;
				return query;
			},
			orderBy: () => ({ limit: execute }),
			limit: execute,
		};

		return query;
	};

	const insert = () => ({
		values: async (value: PromptRow) => {
			const exists = state.prompts.some((row) => row.version === value.version);
			if (exists) {
				const error = new Error(
					"duplicate key value violates unique constraint",
				);
				(error as { code?: string }).code = "23505";
				throw error;
			}
			state.prompts.push(value);
		},
	});

	return { db: { select, insert }, state };
};

mock.module("@throxy-interview/db/schema", () => ({
	prompts: { content: "content", version: "version", isActive: "isActive" },
	leads: { lastName: "lastName", accountName: "accountName" },
	rankings: {
		rank: "rank",
		reasoning: "reasoning",
		relevanceScore: "relevanceScore",
		leadId: "leadId",
	},
	aiCallLogs: {
		cost: "cost",
		inputTokens: "inputTokens",
		outputTokens: "outputTokens",
		durationMs: "durationMs",
		batchId: "batchId",
	},
}));

const setupMockDb = (initialPrompts: PromptRow[]) => {
	const { db, state } = createDbMock(initialPrompts);

	mock.module("@throxy-interview/db", () => ({ db }));

	return state;
};

describe("getActivePromptWithVersion", () => {
	test("inserts and returns default prompt when none exists", async () => {
		const state = setupMockDb([]);

		const { getActivePromptWithVersion } = await import("./ranking");
		const { DEFAULT_PROMPT } = await import("@throxy-interview/db/seed-utils");

		const prompt = await getActivePromptWithVersion();

		expect(prompt.content).toBe(DEFAULT_PROMPT);
		expect(prompt.version).toBe(1);
		expect(state.prompts).toHaveLength(1);
		expect(state.prompts[0]?.isActive).toBe(true);
	});
});

describe("selectPromptForRanking", () => {
	test("prefers session prompt when provided", async () => {
		setupMockDb([]);
		const { selectPromptForRanking } = await import("./ranking");

		const activePrompt = { content: "base prompt", version: 2 };
		const selected = selectPromptForRanking(activePrompt, "session prompt");

		expect(selected.content).toBe("session prompt");
		expect(selected.version).toBe(2);
	});
});

describe("parseRankingResponse", () => {
	test("dedupes duplicate lead IDs from AI response", async () => {
		setupMockDb([]);
		const { parseRankingResponse } = await import("./ranking");

		const response = JSON.stringify({
			rankings: [
				{ leadId: "lead-1", rank: 1, reasoning: "first" },
				{ leadId: "lead-1", rank: 2, reasoning: "duplicate" },
				{ leadId: "lead-2", rank: 3, reasoning: "second" },
			],
		});

		const results = parseRankingResponse(response, ["lead-1", "lead-2"]);

		expect(results).toHaveLength(2);
		expect(results.filter((r) => r.leadId === "lead-1")).toHaveLength(1);
	});
});
