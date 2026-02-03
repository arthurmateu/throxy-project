import { publicProcedure, router } from "../index";
import { leadsRouter } from "./leads";
import { rankingRouter } from "./ranking";
import { exportRouter } from "./export";
import { optimizerRouter } from "./optimizer";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  leads: leadsRouter,
  ranking: rankingRouter,
  export: exportRouter,
  optimizer: optimizerRouter,
});
export type AppRouter = typeof appRouter;
