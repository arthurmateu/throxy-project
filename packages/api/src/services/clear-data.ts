import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";

export const clearAllData = async (): Promise<void> => {
	await db.transaction(async (tx) => {
		await tx.delete(schema.aiCallLogs);
		await tx.delete(schema.rankings);
		await tx.delete(schema.leads);
		await tx.delete(schema.prompts);
	});
};
