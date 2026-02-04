import { describe, expect, mock, test } from "bun:test";

const setupMockDb = () => {
	const deleted: unknown[] = [];
	const deleteFn = async (table: unknown) => {
		deleted.push(table);
	};
	const db = {
		transaction: async (
			callback: (tx: { delete: typeof deleteFn }) => void,
		) => {
			await callback({ delete: deleteFn });
		},
	};

	mock.module("@throxy-interview/db", () => ({ db }));
	mock.module("@throxy-interview/db/schema", () => ({
		aiCallLogs: "aiCallLogs",
		rankings: "rankings",
		leads: "leads",
		prompts: "prompts",
	}));

	return { deleted };
};

describe("clearAllData", () => {
	test("clears AI logs, rankings, leads, and prompts", async () => {
		const { deleted } = setupMockDb();
		const { clearAllData } = await import("./clear-data");

		await clearAllData();

		expect(deleted).toEqual(["aiCallLogs", "rankings", "leads", "prompts"]);
	});
});
