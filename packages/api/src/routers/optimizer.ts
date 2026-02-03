import { z } from "zod";
import { publicProcedure, router } from "../index";
import { env } from "@throxy-interview/env/server";
import { initAIProvider, type AIProvider } from "../services/ai-provider";
import {
  runPromptOptimization,
  getOptimizationProgress,
  getOptimizationHistory,
  activatePrompt,
  parseEvalSet,
  type OptimizationProgress,
} from "../services/prompt-optimizer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load eval set on startup
let evalSetCache: ReturnType<typeof parseEvalSet> | null = null;

function getEvalSet() {
  if (!evalSetCache) {
    try {
      // Try multiple paths to find eval_set.csv
      const paths = [
        resolve(process.cwd(), "eval_set.csv"),
        resolve(process.cwd(), "../../eval_set.csv"),
        resolve(process.cwd(), "../../../eval_set.csv"),
      ];
      
      for (const path of paths) {
        try {
          const content = readFileSync(path, "utf-8");
          evalSetCache = parseEvalSet(content);
          console.log(`Loaded ${evalSetCache.length} eval leads from ${path}`);
          break;
        } catch {
          continue;
        }
      }
      
      if (!evalSetCache) {
        throw new Error("eval_set.csv not found");
      }
    } catch (error) {
      console.error("Failed to load eval_set.csv:", error);
      evalSetCache = [];
    }
  }
  return evalSetCache;
}

export const optimizerRouter = router({
  start: publicProcedure
    .input(
      z.object({
        provider: z.enum(["openai", "anthropic"]).optional(),
        populationSize: z.number().min(3).max(20).default(6),
        generations: z.number().min(1).max(20).default(5),
        sampleSize: z.number().min(10).max(100).default(30),
      }).optional()
    )
    .mutation(async ({ input }) => {
      // Initialize AI provider
      initAIProvider(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);

      const provider: AIProvider = input?.provider ?? (env.AI_PROVIDER as AIProvider);
      const runId = `opt_${Date.now()}`;

      const evalLeads = getEvalSet();
      if (evalLeads.length === 0) {
        throw new Error("No evaluation data available. Please ensure eval_set.csv exists.");
      }

      // Start optimization in background
      runPromptOptimization(evalLeads, provider, runId, {
        populationSize: input?.populationSize ?? 6,
        generations: input?.generations ?? 5,
        sampleSize: input?.sampleSize ?? 30,
      }).catch((error) => {
        console.error("Optimization failed:", error);
      });

      return {
        runId,
        message: "Optimization started",
        evalLeadsCount: evalLeads.length,
      };
    }),

  progress: publicProcedure
    .input(
      z.object({
        runId: z.string(),
      })
    )
    .query(async ({ input }): Promise<OptimizationProgress> => {
      return getOptimizationProgress(input.runId);
    }),

  history: publicProcedure.query(async () => {
    return getOptimizationHistory();
  }),

  activate: publicProcedure
    .input(
      z.object({
        version: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await activatePrompt(input.version);
      return { success: true };
    }),

  evalSetInfo: publicProcedure.query(async () => {
    const evalLeads = getEvalSet();
    
    // Get statistics about the eval set
    const relevantCount = evalLeads.filter((l) => l.expectedRank !== null).length;
    const irrelevantCount = evalLeads.filter((l) => l.expectedRank === null).length;
    const companies = new Set(evalLeads.map((l) => l.company)).size;

    return {
      totalLeads: evalLeads.length,
      relevantLeads: relevantCount,
      irrelevantLeads: irrelevantCount,
      uniqueCompanies: companies,
    };
  }),
});
