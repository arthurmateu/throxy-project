import { z } from "zod";
import { publicProcedure, router } from "../index";
import {
  getLeadsWithRankings,
  getRankingStats,
} from "../services/ranking";

export const leadsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
        sortBy: z.enum(["rank", "name", "company"]).default("rank"),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
        showIrrelevant: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ input }) => {
      const options = input ?? {};
      return getLeadsWithRankings(options);
    }),

  stats: publicProcedure.query(async () => {
    return getRankingStats();
  }),
});
