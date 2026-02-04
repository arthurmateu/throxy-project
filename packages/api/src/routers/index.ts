import { publicProcedure, router } from "../index";
import { exportRouter } from "./export";
import { leadsRouter } from "./leads";
import { optimizerRouter } from "./optimizer";
import { rankingRouter } from "./ranking";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	leads: leadsRouter,
	optimizer: optimizerRouter,
	ranking: rankingRouter,
	export: exportRouter,
});
export type AppRouter = typeof appRouter;
