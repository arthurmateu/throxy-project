import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

const { leads, rankings, aiCallLogs, prompts } = schema;
type NewRanking = schema.NewRanking;
type NewAiCallLog = schema.NewAiCallLog;
import { getAIProvider, type AIProvider, type AIResponse } from "./ai-provider";

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

// In-memory progress tracking
const progressMap = new Map<string, RankingProgress>();

export function getRankingProgress(batchId: string): RankingProgress {
  return (
    progressMap.get(batchId) || {
      total: 0,
      completed: 0,
      currentCompany: null,
      status: "idle",
    }
  );
}

function updateProgress(batchId: string, update: Partial<RankingProgress>) {
  const current = getRankingProgress(batchId);
  progressMap.set(batchId, { ...current, ...update });
}

export async function getActivePrompt(): Promise<string> {
  const activePrompt = await db
    .select()
    .from(prompts)
    .where(eq(prompts.isActive, true))
    .orderBy(desc(prompts.version))
    .limit(1);

  if (activePrompt.length === 0 || !activePrompt[0]) {
    throw new Error("No active prompt found. Please run the seed script.");
  }

  return activePrompt[0].content;
}

export async function getActivePromptVersion(): Promise<number> {
  const activePrompt = await db
    .select({ version: prompts.version })
    .from(prompts)
    .where(eq(prompts.isActive, true))
    .orderBy(desc(prompts.version))
    .limit(1);

  return activePrompt[0]?.version ?? 1;
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

function buildRankingPrompt(
  systemPrompt: string,
  companyLeads: LeadForRanking[]
): string {
  const company = companyLeads[0]!;
  const leadsInfo = companyLeads
    .map(
      (lead, idx) =>
        `${idx + 1}. ID: ${lead.id}
   Name: ${lead.firstName} ${lead.lastName}
   Title: ${lead.jobTitle}`
    )
    .join("\n\n");

  return `${systemPrompt}

---

Now rank the following leads from ${company.accountName} (${company.employeeRange || "Unknown size"} employees, Industry: ${company.industry || "Unknown"}):

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
}

function parseRankingResponse(
  response: string,
  leadIds: string[]
): RankingResult[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const results: RankingResult[] = [];

    if (Array.isArray(parsed.rankings)) {
      for (const item of parsed.rankings) {
        if (leadIds.includes(item.leadId)) {
          results.push({
            leadId: item.leadId,
            rank: item.rank === null ? null : Number(item.rank),
            reasoning: String(item.reasoning || ""),
          });
        }
      }
    }

    // Add missing leads with error state
    for (const id of leadIds) {
      if (!results.find((r) => r.leadId === id)) {
        results.push({
          leadId: id,
          rank: null,
          reasoning: "Failed to parse ranking from AI response",
        });
      }
    }

    return results;
  } catch (error) {
    // Return all leads as failed
    return leadIds.map((id) => ({
      leadId: id,
      rank: null,
      reasoning: `Parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }));
  }
}

export async function rankLeadsBatch(
  companyLeads: LeadForRanking[],
  systemPrompt: string,
  provider: AIProvider,
  batchId: string,
  promptVersion: number
): Promise<{ results: RankingResult[]; aiResponse: AIResponse }> {
  const ai = getAIProvider();
  const userPrompt = buildRankingPrompt(systemPrompt, companyLeads);

  const aiResponse = await ai.chat(provider, [
    { role: "user", content: userPrompt },
  ], {
    jsonMode: true,
    temperature: 0.2,
  });

  // Log the AI call
  const logEntry: NewAiCallLog = {
    provider,
    model: aiResponse.model,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    cost: aiResponse.cost,
    durationMs: aiResponse.durationMs,
    promptVersion,
    batchId,
  };
  await db.insert(aiCallLogs).values(logEntry);

  const leadIds = companyLeads.map((l) => l.id);
  const results = parseRankingResponse(aiResponse.content, leadIds);

  return { results, aiResponse };
}

export async function runRankingProcess(
  provider: AIProvider,
  batchId: string
): Promise<void> {
  try {
    // Get all leads grouped by company
    const allLeads = await db
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

    // Group by company
    const companiesMap = new Map<string, LeadForRanking[]>();
    for (const lead of allLeads) {
      const existing = companiesMap.get(lead.accountName) || [];
      existing.push(lead);
      companiesMap.set(lead.accountName, existing);
    }

    const companies = Array.from(companiesMap.entries());
    const totalLeads = allLeads.length;

    updateProgress(batchId, {
      total: totalLeads,
      completed: 0,
      status: "running",
    });

    // Get active prompt
    const systemPrompt = await getActivePrompt();
    const promptVersion = await getActivePromptVersion();

    // Clear existing rankings for fresh run
    await db.delete(rankings);

    let completedLeads = 0;

    // Process each company
    for (const [companyName, companyLeads] of companies) {
      updateProgress(batchId, { currentCompany: companyName });

      try {
        const { results } = await rankLeadsBatch(
          companyLeads,
          systemPrompt,
          provider,
          batchId,
          promptVersion
        );

        // Save rankings to database
        const rankingsToInsert: NewRanking[] = results.map((r) => ({
          leadId: r.leadId,
          rank: r.rank,
          relevanceScore: r.rank !== null ? (11 - r.rank) / 10 : 0,
          reasoning: r.reasoning,
          promptVersion,
        }));

        await db.insert(rankings).values(rankingsToInsert);

        completedLeads += companyLeads.length;
        updateProgress(batchId, { completed: completedLeads });
      } catch (error) {
        console.error(`Error ranking company ${companyName}:`, error);
        // Continue with next company
        completedLeads += companyLeads.length;
        updateProgress(batchId, { completed: completedLeads });
      }
    }

    updateProgress(batchId, {
      status: "completed",
      currentCompany: null,
    });
  } catch (error) {
    updateProgress(batchId, {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function getLeadsWithRankings(options: {
  page?: number;
  pageSize?: number;
  sortBy?: "rank" | "name" | "company";
  sortOrder?: "asc" | "desc";
  showIrrelevant?: boolean;
}) {
  const {
    page = 1,
    pageSize = 50,
    sortBy = "rank",
    sortOrder = "asc",
    showIrrelevant = true,
  } = options;

  const offset = (page - 1) * pageSize;

  // Build the query with left join to include leads without rankings
  let query = db
    .select({
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
    })
    .from(leads)
    .leftJoin(rankings, eq(leads.id, rankings.leadId));

  // Filter irrelevant if needed
  if (!showIrrelevant) {
    query = query.where(
      and(
        sql`${rankings.rank} IS NOT NULL`
      )
    ) as typeof query;
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .leftJoin(rankings, eq(leads.id, rankings.leadId))
    .where(
      showIrrelevant
        ? undefined
        : sql`${rankings.rank} IS NOT NULL`
    );

  const totalCount = Number(countResult[0]?.count ?? 0);

  // Apply sorting - put nulls at the end for rank
  let orderedQuery;
  if (sortBy === "rank") {
    // For rank sorting, null ranks go to the end
    orderedQuery = query.orderBy(
      sortOrder === "asc"
        ? sql`COALESCE(${rankings.rank}, 999) ASC`
        : sql`COALESCE(${rankings.rank}, -1) DESC`
    );
  } else if (sortBy === "company") {
    orderedQuery = query.orderBy(
      sortOrder === "asc"
        ? sql`${leads.accountName} ASC`
        : sql`${leads.accountName} DESC`
    );
  } else {
    orderedQuery = query.orderBy(
      sortOrder === "asc"
        ? sql`${leads.lastName} ASC`
        : sql`${leads.lastName} DESC`
    );
  }

  const results = await orderedQuery.limit(pageSize).offset(offset);

  return {
    leads: results,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  };
}

export async function getRankingStats() {
  // Get total leads
  const totalLeadsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads);
  const totalLeads = Number(totalLeadsResult[0]?.count ?? 0);

  // Get ranked leads count
  const rankedResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(rankings);
  const rankedLeads = Number(rankedResult[0]?.count ?? 0);

  // Get relevant leads (non-null rank)
  const relevantResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(rankings)
    .where(sql`${rankings.rank} IS NOT NULL`);
  const relevantLeads = Number(relevantResult[0]?.count ?? 0);

  // Get AI call stats
  const aiStatsResult = await db
    .select({
      totalCalls: sql<number>`count(*)`,
      totalCost: sql<number>`COALESCE(sum(${aiCallLogs.cost}), 0)`,
      totalInputTokens: sql<number>`COALESCE(sum(${aiCallLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(sum(${aiCallLogs.outputTokens}), 0)`,
      avgDuration: sql<number>`COALESCE(avg(${aiCallLogs.durationMs}), 0)`,
    })
    .from(aiCallLogs);

  const aiStats = aiStatsResult[0];

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
}
