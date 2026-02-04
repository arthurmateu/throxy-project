import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { DEFAULT_PROMPT } from "@throxy-interview/db/seed-utils";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type AIProvider, type AIResponse, getAIProvider } from "./ai-provider";
import {
	getSessionAiBatchIds,
	getSessionOptimizedPrompt,
	hasPendingOptimization,
	type RankingChange,
	registerSessionAiBatchId,
	setSessionRankingChanges,
} from "./session-store";

const { leads, rankings, aiCallLogs, prompts } = schema;
type NewRanking = schema.NewRanking;
type NewAiCallLog = schema.NewAiCallLog;

// ============================================================================
// Types
// ============================================================================

export interface RankingResult {
	leadId: string;
	rank: number | null;
	reasoning: string;
}

export interface RankingProgress {
	total: number;
	completed: number;
	currentCompany: string | null;
	status: "idle" | "running" | "completed" | "error";
	error?: string;
}

interface LeadForRanking {
	id: string;
	firstName: string;
	lastName: string;
	jobTitle: string;
	accountName: string;
	employeeRange: string | null;
	industry: string | null;
}

interface LeadsQueryOptions {
	page?: number;
	pageSize?: number;
	sortBy?: "rank" | "name" | "company";
	sortOrder?: "asc" | "desc";
	showIrrelevant?: boolean;
	/** When set, only return leads that are in the top N by rank within their company */
	topPerCompany?: number;
}

type LeadWithRanking = {
	id: string;
	firstName: string;
	lastName: string;
	jobTitle: string;
	accountName: string;
	accountDomain: string | null;
	employeeRange: string | null;
	industry: string | null;
	rank: number | null;
	reasoning: string | null;
	relevanceScore: number | null;
};

type RankMap = Map<string, number | null>;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROGRESS: RankingProgress = {
	total: 0,
	completed: 0,
	currentCompany: null,
	status: "idle",
};

const DEFAULT_QUERY_OPTIONS: Required<LeadsQueryOptions> = {
	page: 1,
	pageSize: 50,
	sortBy: "rank",
	sortOrder: "asc",
	showIrrelevant: true,
	topPerCompany: 0,
};

const normalizeRank = (rank: number | null | undefined): number | null =>
	typeof rank === "number" ? rank : null;

// ============================================================================
// Progress State Management (Functional Approach)
// ============================================================================

const progressMap = new Map<string, RankingProgress>();

/** Get progress for a batch (pure read) */
export const getRankingProgress = (batchId: string): RankingProgress =>
	progressMap.get(batchId) ?? { ...DEFAULT_PROGRESS };

/** Update progress immutably and store */
const updateProgress = (
	batchId: string,
	update: Partial<RankingProgress>,
): RankingProgress => {
	const current = getRankingProgress(batchId);
	const updated = { ...current, ...update };
	progressMap.set(batchId, updated);
	return updated;
};

// ============================================================================
// Pure Functions - Change Detection
// ============================================================================

export const buildRankingChanges = (
	oldRanks: RankMap,
	companyLeads: LeadForRanking[],
	results: RankingResult[],
): RankingChange[] => {
	const leadById = new Map(companyLeads.map((lead) => [lead.id, lead]));
	return results.flatMap((result) => {
		const lead = leadById.get(result.leadId);
		if (!lead) return [];
		const previousRank = normalizeRank(oldRanks.get(result.leadId));
		const nextRank = normalizeRank(result.rank);
		if (previousRank === nextRank) return [];
		return [
			{
				leadId: result.leadId,
				fullName: `${lead.firstName} ${lead.lastName}`,
				company: lead.accountName,
				oldRank: previousRank,
				newRank: nextRank,
			},
		];
	});
};

// ============================================================================
// Pure Functions - Prompt Building
// ============================================================================

/** Format a single lead for the prompt */
const formatLeadForPrompt = (lead: LeadForRanking, index: number): string =>
	`${index + 1}. ID: ${lead.id}
   Name: ${lead.firstName} ${lead.lastName}
   Title: ${lead.jobTitle}`;

/** Build the ranking prompt from system prompt and leads */
const buildRankingPrompt = (
	systemPrompt: string,
	companyLeads: LeadForRanking[],
): string => {
	const company = companyLeads[0];
	if (!company) throw new Error("No leads provided");

	const leadsInfo = companyLeads.map(formatLeadForPrompt).join("\n\n");
	const companySize = company.employeeRange ?? "Unknown size";
	const industry = company.industry ?? "Unknown";

	return `${systemPrompt}

---

Now rank the following leads from ${company.accountName} (${companySize} employees, Industry: ${industry}):

${leadsInfo}

Respond with a JSON object in this exact format:
{
  "rankings": [
    {
      "leadId": "<lead id>",
      "rank": <number 1-10 or null if irrelevant>,
      "reasoning": "<brief explanation>"
    }
  ]
}

Important:
- Use null for rank if the lead is in a hard exclusion category (HR, Finance, Engineering, etc.)
- Lower numbers = better fit (1 is the best)
- Consider company size when ranking - a CEO at a startup ranks differently than at an enterprise
- Be concise in your reasoning (1-2 sentences max)`;
};

// ============================================================================
// Pure Functions - Response Parsing
// ============================================================================

/** Extract JSON from a string response */
const extractJson = (response: string): object | null => {
	const jsonMatch = response.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[0]);
	} catch {
		return null;
	}
};

/** Create a failed ranking result */
const createFailedResult = (leadId: string, reason: string): RankingResult => ({
	leadId,
	rank: null,
	reasoning: reason,
});

/** Parse a single ranking item from the response */
const parseRankingItem = (item: {
	leadId?: string;
	rank?: number | null;
	reasoning?: string;
}): RankingResult | null => {
	if (!item.leadId) return null;
	return {
		leadId: item.leadId,
		rank: item.rank === null ? null : Number(item.rank),
		reasoning: String(item.reasoning ?? ""),
	};
};

/** Parse the ranking response into results */
export const parseRankingResponse = (
	response: string,
	leadIds: string[],
): RankingResult[] => {
	const parsed = extractJson(response);
	if (!parsed) {
		return leadIds.map((id) =>
			createFailedResult(id, "No JSON found in response"),
		);
	}

	const rankings = (parsed as { rankings?: unknown[] }).rankings;
	if (!Array.isArray(rankings)) {
		return leadIds.map((id) =>
			createFailedResult(id, "Invalid response format"),
		);
	}

	const results: RankingResult[] = [];
	const processedIds = new Set<string>();

	for (const item of rankings) {
		const result = parseRankingItem(
			item as { leadId?: string; rank?: number | null; reasoning?: string },
		);
		if (!result || !leadIds.includes(result.leadId)) {
			continue;
		}
		if (processedIds.has(result.leadId)) {
			continue;
		}
		results.push(result);
		processedIds.add(result.leadId);
	}

	// Add missing leads as failed
	for (const id of leadIds) {
		if (!processedIds.has(id)) {
			results.push(
				createFailedResult(id, "Failed to parse ranking from AI response"),
			);
		}
	}

	return results;
};

// ============================================================================
// Pure Functions - Data Transformation
// ============================================================================

/** Group leads by company name */
const groupLeadsByCompany = (
	allLeads: LeadForRanking[],
): Map<string, LeadForRanking[]> => {
	const grouped = new Map<string, LeadForRanking[]>();
	for (const lead of allLeads) {
		const existing = grouped.get(lead.accountName) ?? [];
		grouped.set(lead.accountName, [...existing, lead]);
	}
	return grouped;
};

/** Convert ranking result to database entry */
const toRankingEntry = (
	result: RankingResult,
	promptVersion: number,
): NewRanking => ({
	leadId: result.leadId,
	rank: result.rank,
	relevanceScore: result.rank !== null ? (11 - result.rank) / 10 : 0,
	reasoning: result.reasoning,
	promptVersion,
});

/** Convert AI response to log entry */
const toAiCallLogEntry = (
	aiResponse: AIResponse,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): NewAiCallLog => ({
	provider,
	model: aiResponse.model,
	inputTokens: aiResponse.inputTokens,
	outputTokens: aiResponse.outputTokens,
	cost: aiResponse.cost,
	durationMs: aiResponse.durationMs,
	promptVersion,
	batchId,
});

/** Calculate pagination info */
const calculatePagination = (
	page: number,
	pageSize: number,
	totalCount: number,
) => ({
	page,
	pageSize,
	totalCount,
	totalPages: Math.ceil(totalCount / pageSize),
});

// ============================================================================
// Database Operations
// ============================================================================

type ActivePrompt = { content: string; version: number };

export const selectPromptForRanking = (
	activePrompt: ActivePrompt,
	sessionPrompt?: string,
): ActivePrompt => ({
	content: sessionPrompt ?? activePrompt.content,
	version: activePrompt.version,
});

const fetchActivePromptRow = async (): Promise<ActivePrompt | null> => {
	const activePrompt = await db
		.select({ content: prompts.content, version: prompts.version })
		.from(prompts)
		.where(eq(prompts.isActive, true))
		.orderBy(desc(prompts.version))
		.limit(1);

	return activePrompt[0] ?? null;
};

const fetchLatestPromptVersion = async (): Promise<number> => {
	const latestPrompt = await db
		.select({ version: prompts.version })
		.from(prompts)
		.orderBy(desc(prompts.version))
		.limit(1);

	return latestPrompt[0]?.version ?? 0;
};

const createDefaultPrompt = async (): Promise<number> => {
	const nextVersion = (await fetchLatestPromptVersion()) + 1;
	await db.insert(prompts).values({
		version: nextVersion,
		content: DEFAULT_PROMPT,
		isActive: true,
		generation: 0,
	});
	return nextVersion;
};

const ensureActivePrompt = async (): Promise<ActivePrompt> => {
	const existing = await fetchActivePromptRow();
	if (existing) return existing;

	try {
		await createDefaultPrompt();
	} catch (error) {
		console.error("Failed to create default prompt", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	const activePrompt = await fetchActivePromptRow();
	if (!activePrompt) {
		throw new Error("No active prompt found. Default prompt creation failed.");
	}

	return activePrompt;
};

/** Fetch the active prompt from database */
export const getActivePrompt = async (): Promise<string> =>
	(await ensureActivePrompt()).content;

/** Fetch the active prompt version */
export const getActivePromptVersion = async (): Promise<number> =>
	(await ensureActivePrompt()).version;

/** Fetch the active prompt and version */
export const getActivePromptWithVersion = async (): Promise<ActivePrompt> =>
	ensureActivePrompt();

/** Fetch all leads for ranking */
const fetchAllLeads = async (): Promise<LeadForRanking[]> =>
	db
		.select({
			id: leads.id,
			firstName: leads.firstName,
			lastName: leads.lastName,
			jobTitle: leads.jobTitle,
			accountName: leads.accountName,
			employeeRange: leads.employeeRange,
			industry: leads.industry,
		})
		.from(leads);

const fetchLatestRanksByLeadId = async (): Promise<RankMap> => {
	const latestRankings = db
		.select({
			leadId: rankings.leadId,
			createdAt: sql`max(${rankings.createdAt})`.as("createdAt"),
		})
		.from(rankings)
		.groupBy(rankings.leadId)
		.as("latest_rankings");

	const rows = await db
		.select({ leadId: rankings.leadId, rank: rankings.rank })
		.from(rankings)
		.innerJoin(
			latestRankings,
			and(
				eq(rankings.leadId, latestRankings.leadId),
				eq(rankings.createdAt, latestRankings.createdAt),
			),
		);

	return new Map(rows.map((row) => [row.leadId, row.rank]));
};

/** Save rankings to database */
const saveRankings = async (rankingsToInsert: NewRanking[]): Promise<void> => {
	await db.insert(rankings).values(rankingsToInsert);
};

/** Log an AI call */
const logAiCall = async (logEntry: NewAiCallLog): Promise<void> => {
	await db.insert(aiCallLogs).values(logEntry);
};

/** Clear all rankings */
const clearAllRankings = async (): Promise<void> => {
	await db.delete(rankings);
};

// ============================================================================
// AI Operations
// ============================================================================

/** Rank a batch of leads from one company */
export const rankLeadsBatch = async (
	companyLeads: LeadForRanking[],
	systemPrompt: string,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): Promise<{ results: RankingResult[]; aiResponse: AIResponse }> => {
	const ai = getAIProvider();
	const userPrompt = buildRankingPrompt(systemPrompt, companyLeads);

	// Allow enough tokens for full reasoning per lead (~200 tokens each) so output is not cut off
	const maxTokens = Math.max(4096, 400 + companyLeads.length * 220);

	const aiResponse = await ai.chat(
		provider,
		[{ role: "user", content: userPrompt }],
		{
			jsonMode: true,
			temperature: 0.2,
			maxTokens,
		},
	);

	await logAiCall(
		toAiCallLogEntry(aiResponse, provider, batchId, promptVersion),
	);

	const leadIds = companyLeads.map((l) => l.id);
	const results = parseRankingResponse(aiResponse.content, leadIds);

	return { results, aiResponse };
};

// ============================================================================
// Main Ranking Process
// ============================================================================

/** Process a single company's leads */
const processCompany = async (
	companyName: string,
	companyLeads: LeadForRanking[],
	systemPrompt: string,
	provider: AIProvider,
	batchId: string,
	promptVersion: number,
): Promise<{ processed: number; results: RankingResult[] }> => {
	try {
		const { results } = await rankLeadsBatch(
			companyLeads,
			systemPrompt,
			provider,
			batchId,
			promptVersion,
		);
		const rankingsToInsert = results.map((r) =>
			toRankingEntry(r, promptVersion),
		);
		await saveRankings(rankingsToInsert);
		return { processed: companyLeads.length, results };
	} catch (error) {
		console.error(`Error ranking company ${companyName}:`, error);
		return { processed: companyLeads.length, results: [] }; // Continue with next company
	}
};

/** Run the full ranking process */
export const runRankingProcess = async (
	provider: AIProvider,
	batchId: string,
	sessionId?: string,
): Promise<void> => {
	try {
		const allLeads = await fetchAllLeads();
		const companiesMap = groupLeadsByCompany(allLeads);
		const companies = Array.from(companiesMap.entries());
		const shouldCaptureChanges = hasPendingOptimization(sessionId);
		const previousRanks = shouldCaptureChanges
			? await fetchLatestRanksByLeadId()
			: new Map();
		const rankingChanges: RankingChange[] = [];

		updateProgress(batchId, {
			total: allLeads.length,
			completed: 0,
			status: "running",
		});

		registerSessionAiBatchId(sessionId, batchId);

		const sessionPrompt = getSessionOptimizedPrompt(sessionId);
		const activePrompt = await getActivePromptWithVersion();
		const selectedPrompt = selectPromptForRanking(activePrompt, sessionPrompt);
		const systemPrompt = selectedPrompt.content;
		const promptVersion = selectedPrompt.version;

		await clearAllRankings();

		let completedLeads = 0;

		for (const [companyName, companyLeads] of companies) {
			updateProgress(batchId, { currentCompany: companyName });

			const { processed, results } = await processCompany(
				companyName,
				companyLeads,
				systemPrompt,
				provider,
				batchId,
				promptVersion,
			);

			if (shouldCaptureChanges && results.length > 0) {
				rankingChanges.push(
					...buildRankingChanges(previousRanks, companyLeads, results),
				);
			}

			completedLeads += processed;
			updateProgress(batchId, { completed: completedLeads });
		}

		updateProgress(batchId, { status: "completed", currentCompany: null });

		if (shouldCaptureChanges) {
			setSessionRankingChanges(sessionId, rankingChanges);
		}
	} catch (error) {
		updateProgress(batchId, {
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		throw error;
	}
};

// ============================================================================
// Query Operations
// ============================================================================

/** Primary sort expression for leads query */
const buildSortOrder = (sortBy: string, sortOrder: string) => {
	const direction = sortOrder === "asc" ? "ASC" : "DESC";
	const nullHandling = sortOrder === "asc" ? 999 : -1;

	switch (sortBy) {
		case "rank":
			return sql`COALESCE(${rankings.rank}, ${nullHandling}) ${sql.raw(direction)}`;
		case "company":
			return sql`${leads.accountName} ${sql.raw(direction)}`;
		default:
			return sql`${leads.lastName} ${sql.raw(direction)}`;
	}
};

/** Secondary sort: always by rank (best first) so e.g. company sort shows 1-1-7 not 1-7-1 */
const getRankSecondarySort = () => sql`COALESCE(${rankings.rank}, 999) ASC`;

const MAX_LEADS_FOR_TOP_N = 5000;

const logDbError = (
	label: string,
	error: unknown,
	context: Record<string, unknown>,
) => {
	const err = error instanceof Error ? error : new Error(String(error));
	const pgError = error as { code?: string; detail?: string; hint?: string };
	console.error(label, {
		message: err.message,
		code: pgError?.code,
		detail: pgError?.detail,
		hint: pgError?.hint,
		context,
	});
};

/** Filter to top N leads per company by rank (asc = best first), then sort and paginate in memory */
function filterTopPerCompanyAndPaginate<
	T extends { accountName: string; rank: number | null },
>(
	rows: T[],
	topN: number,
	sortBy: string,
	sortOrder: string,
	page: number,
	pageSize: number,
): { rows: T[]; totalCount: number } {
	const byCompany = new Map<string, T[]>();
	for (const row of rows) {
		const list = byCompany.get(row.accountName) ?? [];
		list.push(row);
		byCompany.set(row.accountName, list);
	}
	const filtered: T[] = [];
	for (const list of byCompany.values()) {
		const sorted = [...list].sort((a, b) => {
			const ar = a.rank ?? 999;
			const br = b.rank ?? 999;
			return ar - br;
		});
		filtered.push(...sorted.slice(0, topN));
	}
	// Apply requested sort with rank as secondary (best first within same group)
	const direction = sortOrder === "asc" ? 1 : -1;
	filtered.sort((a, b) => {
		let cmp = 0;
		if (sortBy === "rank") {
			const ar = (a as { rank: number | null }).rank ?? 999;
			const br = (b as { rank: number | null }).rank ?? 999;
			cmp = ar - br;
		} else if (sortBy === "company") {
			cmp = (a.accountName ?? "").localeCompare(b.accountName ?? "");
		} else {
			cmp =
				(a as { lastName?: string }).lastName?.localeCompare(
					(b as { lastName?: string }).lastName ?? "",
				) ?? 0;
		}
		if (cmp !== 0) return direction * cmp;
		// Tiebreaker: rank ascending (best first), e.g. 1-1-7 within same company
		const ar = (a as { rank: number | null }).rank ?? 999;
		const br = (b as { rank: number | null }).rank ?? 999;
		return ar - br;
	});
	const totalCount = filtered.length;
	const offset = (page - 1) * pageSize;
	const paginated = filtered.slice(offset, offset + pageSize);
	return { rows: paginated, totalCount };
}

/** Get leads with their rankings */
export const getLeadsWithRankings = async (options: LeadsQueryOptions = {}) => {
	const { page, pageSize, sortBy, sortOrder, showIrrelevant, topPerCompany } = {
		...DEFAULT_QUERY_OPTIONS,
		...options,
	};

	try {
		const latestRankings = db
			.select({
				leadId: rankings.leadId,
				createdAt: sql`max(${rankings.createdAt})`.as("createdAt"),
			})
			.from(rankings)
			.groupBy(rankings.leadId)
			.as("latest_rankings");

		const relevantFilter = showIrrelevant
			? undefined
			: sql`${rankings.rank} IS NOT NULL`;

		const baseSelect = {
			id: leads.id,
			firstName: leads.firstName,
			lastName: leads.lastName,
			jobTitle: leads.jobTitle,
			accountName: leads.accountName,
			accountDomain: leads.accountDomain,
			employeeRange: leads.employeeRange,
			industry: leads.industry,
			rank: rankings.rank,
			reasoning: rankings.reasoning,
			relevanceScore: rankings.relevanceScore,
		};

		let query = db
			.select(baseSelect)
			.from(leads)
			.leftJoin(latestRankings, eq(leads.id, latestRankings.leadId))
			.leftJoin(
				rankings,
				and(
					eq(rankings.leadId, latestRankings.leadId),
					eq(rankings.createdAt, latestRankings.createdAt),
				),
			);

		if (!showIrrelevant && relevantFilter) {
			query = query.where(and(relevantFilter)) as typeof query;
		}

		if (topPerCompany != null && topPerCompany > 0) {
			// Fetch all (up to limit), filter to top N per company in memory, then paginate
			const allRows = await query
				.orderBy(buildSortOrder("rank", "asc"), getRankSecondarySort())
				.limit(MAX_LEADS_FOR_TOP_N);
			const { rows, totalCount } = filterTopPerCompanyAndPaginate(
				allRows,
				topPerCompany,
				sortBy,
				sortOrder,
				page,
				pageSize,
			);
			return {
				leads: rows,
				pagination: calculatePagination(page, pageSize, totalCount),
			};
		}

		const offset = (page - 1) * pageSize;

		let countResult: { count: number }[];
		try {
			const countQuery = showIrrelevant
				? db.select({ count: sql<number>`count(*)` }).from(leads)
				: db
						.select({ count: sql<number>`count(*)` })
						.from(leads)
						.leftJoin(latestRankings, eq(leads.id, latestRankings.leadId))
						.leftJoin(
							rankings,
							and(
								eq(rankings.leadId, latestRankings.leadId),
								eq(rankings.createdAt, latestRankings.createdAt),
							),
						)
						.where(relevantFilter ?? sql`true`);
			countResult = await countQuery;
		} catch (error) {
			logDbError("Leads count query failed", error, {
				page,
				pageSize,
				sortBy,
				sortOrder,
				showIrrelevant,
				topPerCompany,
			});
			throw error;
		}

		const totalCount = Number(countResult[0]?.count ?? 0);

		let results: LeadWithRanking[];
		try {
			results = await query
				.orderBy(buildSortOrder(sortBy, sortOrder), getRankSecondarySort())
				.limit(pageSize)
				.offset(offset);
		} catch (error) {
			logDbError("Leads list query failed", error, {
				page,
				pageSize,
				sortBy,
				sortOrder,
				showIrrelevant,
				topPerCompany,
			});
			throw error;
		}

		return {
			leads: results,
			pagination: calculatePagination(page, pageSize, totalCount),
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error("Leads query failed", {
			error: err,
			options,
		});
		throw new Error("Failed to load leads", { cause: err });
	}
};

/** Get ranking statistics */
const EMPTY_AI_STATS = {
	totalCalls: 0,
	totalCost: 0,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	avgDuration: 0,
};

type AiLogRow = {
	cost: number;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
};

export const summarizeAiLogs = (logs: AiLogRow[]) => {
	if (logs.length === 0) return EMPTY_AI_STATS;
	const totals = logs.reduce(
		(acc, log) => ({
			totalCalls: acc.totalCalls + 1,
			totalCost: acc.totalCost + log.cost,
			totalInputTokens: acc.totalInputTokens + log.inputTokens,
			totalOutputTokens: acc.totalOutputTokens + log.outputTokens,
			avgDuration: acc.avgDuration + log.durationMs,
		}),
		{
			totalCalls: 0,
			totalCost: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			avgDuration: 0,
		},
	);

	return {
		...totals,
		avgDuration:
			totals.totalCalls > 0 ? totals.avgDuration / totals.totalCalls : 0,
	};
};

const fetchSessionAiLogs = async (batchIds: string[]): Promise<AiLogRow[]> => {
	if (batchIds.length === 0) return [];
	return db
		.select({
			cost: aiCallLogs.cost,
			inputTokens: aiCallLogs.inputTokens,
			outputTokens: aiCallLogs.outputTokens,
			durationMs: aiCallLogs.durationMs,
		})
		.from(aiCallLogs)
		.where(inArray(aiCallLogs.batchId, batchIds));
};

export const getRankingStats = async (sessionId?: string) => {
	const sessionBatchIds = getSessionAiBatchIds(sessionId);
	const aiStatsPromise = sessionId
		? fetchSessionAiLogs(sessionBatchIds).then(summarizeAiLogs)
		: db
				.select({
					totalCalls: sql<number>`count(*)`,
					totalCost: sql<number>`COALESCE(sum(${aiCallLogs.cost}), 0)`,
					totalInputTokens: sql<number>`COALESCE(sum(${aiCallLogs.inputTokens}), 0)`,
					totalOutputTokens: sql<number>`COALESCE(sum(${aiCallLogs.outputTokens}), 0)`,
					avgDuration: sql<number>`COALESCE(avg(${aiCallLogs.durationMs}), 0)`,
				})
				.from(aiCallLogs)
				.then((rows) => rows[0] ?? EMPTY_AI_STATS);

	const [totalLeadsResult, rankedResult, relevantResult, aiStats] =
		await Promise.all([
			db.select({ count: sql<number>`count(*)` }).from(leads),
			db.select({ count: sql<number>`count(*)` }).from(rankings),
			db
				.select({ count: sql<number>`count(*)` })
				.from(rankings)
				.where(sql`${rankings.rank} IS NOT NULL`),
			aiStatsPromise,
		]);

	const totalLeads = Number(totalLeadsResult[0]?.count ?? 0);
	const rankedLeads = Number(rankedResult[0]?.count ?? 0);
	const relevantLeads = Number(relevantResult[0]?.count ?? 0);
	return {
		totalLeads,
		rankedLeads,
		relevantLeads,
		irrelevantLeads: rankedLeads - relevantLeads,
		aiCalls: {
			totalCalls: Number(aiStats?.totalCalls ?? 0),
			totalCost: Number(aiStats?.totalCost ?? 0),
			totalInputTokens: Number(aiStats?.totalInputTokens ?? 0),
			totalOutputTokens: Number(aiStats?.totalOutputTokens ?? 0),
			avgDurationMs: Number(aiStats?.avgDuration ?? 0),
		},
	};
};
