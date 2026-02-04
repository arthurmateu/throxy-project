import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	real,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// Leads - Imported from CSV
export const leads = pgTable("leads", {
	id: uuid("id").primaryKey().defaultRandom(),
	accountName: text("account_name").notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	jobTitle: text("job_title").notNull(),
	accountDomain: text("account_domain"),
	employeeRange: text("employee_range"),
	industry: text("industry"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rankings - AI-generated rankings per lead
export const rankings = pgTable("rankings", {
	id: uuid("id").primaryKey().defaultRandom(),
	leadId: uuid("lead_id")
		.notNull()
		.references(() => leads.id, { onDelete: "cascade" }),
	rank: integer("rank"), // 1-10 or null for irrelevant
	relevanceScore: real("relevance_score"), // 0-1 score
	reasoning: text("reasoning"),
	promptVersion: integer("prompt_version").default(1),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Call Logs - Track costs and usage
export const aiCallLogs = pgTable("ai_call_logs", {
	id: uuid("id").primaryKey().defaultRandom(),
	provider: text("provider").notNull(), // 'openai' | 'anthropic' | 'gemini'
	model: text("model").notNull(),
	inputTokens: integer("input_tokens").notNull(),
	outputTokens: integer("output_tokens").notNull(),
	cost: real("cost").notNull(), // in USD
	durationMs: integer("duration_ms").notNull(),
	promptVersion: integer("prompt_version").default(1),
	batchId: text("batch_id"), // to group calls for a ranking run
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Prompts - Store prompt versions for optimization
export const prompts = pgTable("prompts", {
	id: uuid("id").primaryKey().defaultRandom(),
	version: integer("version").notNull().unique(),
	content: text("content").notNull(),
	evalScore: real("eval_score"), // fitness score from optimization
	isActive: boolean("is_active").default(false),
	generation: integer("generation"), // genetic algorithm generation
	parentVersion: integer("parent_version"), // for tracking lineage
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const leadsRelations = relations(leads, ({ many }) => ({
	rankings: many(rankings),
}));

export const rankingsRelations = relations(rankings, ({ one }) => ({
	lead: one(leads, {
		fields: [rankings.leadId],
		references: [leads.id],
	}),
}));

// Type exports for use in application
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
export type AiCallLog = typeof aiCallLogs.$inferSelect;
export type NewAiCallLog = typeof aiCallLogs.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
