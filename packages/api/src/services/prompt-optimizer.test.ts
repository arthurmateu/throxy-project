import { describe, expect, mock, test } from "bun:test";

const setupMockDb = () => {
	mock.module("@throxy-interview/db", () => ({ db: {} }));
	mock.module("@throxy-interview/db/schema", () => ({
		prompts: {},
		aiCallLogs: {},
	}));
};

describe("parseEvalSet", () => {
	test("ignores extra columns in eval CSV", async () => {
		setupMockDb();
		const { parseEvalSet } = await import("./prompt-optimizer");
		const csv = [
			"Full Name,Title,Company,LI,Employee Range,Rank,Extra",
			"Jane Doe,CEO,Acme,https://linkedin.com/jane,1-10,1,ignored",
			"John Smith,Engineer,Acme,https://linkedin.com/john,1-10,-,ignored",
		].join("\n");

		const parsed = parseEvalSet(csv);

		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toEqual({
			fullName: "Jane Doe",
			title: "CEO",
			company: "Acme",
			linkedIn: "https://linkedin.com/jane",
			employeeRange: "1-10",
			expectedRank: 1,
		});
		expect(parsed[1]?.expectedRank).toBeNull();
	});
});
