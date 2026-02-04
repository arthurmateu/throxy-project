import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { DEFAULT_PROMPT, parseLeadsCSV } from "@throxy-interview/db/seed-utils";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import { clearAllData } from "../services/clear-data";
import { getLeadsWithRankings, getRankingStats } from "../services/ranking";

const { leads, rankings, prompts } = schema;

const LEADS_CSV_PATHS = [
	resolve(process.cwd(), "leads.csv"),
	resolve(process.cwd(), "../../leads.csv"),
	resolve(process.cwd(), "../../../leads.csv"),
];

const readFileFromPaths = (
	paths: string[],
): { content: string; path: string } | null => {
	for (const path of paths) {
		try {
			const content = readFileSync(path, "utf-8");
			return { content, path };
		} catch {
			// continue
		}
	}
	return null;
};

const BATCH_SIZE = 50;

export const leadsRouter = router({
	list: publicProcedure
		.input(
			z
				.object({
					page: z.number().min(1).default(1),
					pageSize: z.number().min(1).max(100).default(50),
					sortBy: z.enum(["rank", "name", "company"]).default("rank"),
					sortOrder: z.enum(["asc", "desc"]).default("asc"),
					showIrrelevant: z.boolean().default(true),
					/** When set, only return top N leads per company (by rank) */
					topPerCompany: z.number().min(1).max(50).optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const options = input ?? {};
			return getLeadsWithRankings(options);
		}),

	stats: publicProcedure
		.input(z.object({ sessionId: z.string().min(1).optional() }).optional())
		.query(async ({ input }) => {
			return getRankingStats(input?.sessionId);
		}),

	/** Import leads from custom CSV (replaces existing leads). */
	importFromCsv: publicProcedure
		.input(z.object({ csv: z.string().min(1) }))
		.mutation(async ({ input }) => {
			const rows = parseLeadsCSV(input.csv);
			if (rows.length === 0) {
				throw new Error(
					"CSV has no data rows. Expected header: account_name, lead_first_name, lead_last_name, lead_job_title, account_domain, account_employee_range, account_industry",
				);
			}
			await db.delete(rankings);
			await db.delete(leads);
			for (let i = 0; i < rows.length; i += BATCH_SIZE) {
				const batch = rows.slice(i, i + BATCH_SIZE);
				await db.insert(leads).values(batch);
			}
			return { imported: rows.length };
		}),

	/** Load test data from leads.csv and default prompt (eval_set.csv is used by the optimizer when you run it). */
	runTestData: publicProcedure.mutation(async () => {
		const result = readFileFromPaths(LEADS_CSV_PATHS);
		if (!result) {
			throw new Error(
				"leads.csv not found. Run from repo root or ensure leads.csv is present.",
			);
		}
		const rows = parseLeadsCSV(result.content);
		await db.delete(rankings);
		await db.delete(leads);
		await db.delete(prompts);
		for (let i = 0; i < rows.length; i += BATCH_SIZE) {
			const batch = rows.slice(i, i + BATCH_SIZE);
			await db.insert(leads).values(batch);
		}
		await db.insert(prompts).values({
			version: 1,
			content: DEFAULT_PROMPT,
			isActive: true,
			generation: 0,
		});
		return {
			leadsLoaded: rows.length,
			message:
				"Test data loaded (leads + default prompt). Use Prompt Optimizer to run against eval_set.csv.",
		};
	}),

	/** Clear all data for testing (leads, rankings, prompts, AI logs). */
	clearAll: publicProcedure.mutation(async () => {
		await clearAllData();
		return { success: true };
	}),
});
