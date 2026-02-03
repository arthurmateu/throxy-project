import { z } from "zod";
import { publicProcedure, router } from "../index";
import { env } from "@throxy-interview/env/server";
import {
  runRankingProcess,
  getRankingProgress,
  type RankingProgress,
} from "../services/ranking";
import { initAIProvider, type AIProvider } from "../services/ai-provider";

export const rankingRouter = router({
  start: publicProcedure
    .input(
      z.object({
        provider: z.enum(["openai", "anthropic"]).optional(),
      }).optional()
    )
    .mutation(async ({ input }) => {
      // Initialize AI provider with env keys
      initAIProvider(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);

      const provider: AIProvider = input?.provider ?? (env.AI_PROVIDER as AIProvider);
      const batchId = `batch_${Date.now()}`;

      // Start the ranking process in the background
      runRankingProcess(provider, batchId).catch((error) => {
        console.error("Ranking process failed:", error);
      });

      return {
        batchId,
        message: "Ranking process started",
      };
    }),

  progress: publicProcedure
    .input(
      z.object({
        batchId: z.string(),
      })
    )
    .query(async ({ input }): Promise<RankingProgress> => {
      return getRankingProgress(input.batchId);
    }),

  availableProviders: publicProcedure.query(async () => {
    const providers: AIProvider[] = [];
    if (env.OPENAI_API_KEY) providers.push("openai");
    if (env.ANTHROPIC_API_KEY) providers.push("anthropic");
    return {
      providers,
      defaultProvider: env.AI_PROVIDER as AIProvider,
    };
  }),
});
