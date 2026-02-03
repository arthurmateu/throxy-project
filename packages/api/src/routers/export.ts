import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";

const { leads, rankings } = schema;

export const exportRouter = router({
	topLeadsPerCompany: publicProcedure
		.input(
			z
				.object({
					topN: z.number().min(1).max(50).default(5),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const topN = input?.topN ?? 5;

			// Get all leads with rankings, grouped by company
			const allLeads = await db
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
				})
				.from(leads)
				.leftJoin(rankings, eq(leads.id, rankings.leadId))
				.where(isNotNull(rankings.rank))
				.orderBy(asc(rankings.rank));

			// Group by company and take top N per company
			const companiesMap = new Map<string, typeof allLeads>();

			for (const lead of allLeads) {
				const existing = companiesMap.get(lead.accountName) || [];
				if (existing.length < topN) {
					existing.push(lead);
					companiesMap.set(lead.accountName, existing);
				}
			}

			// Flatten and format for CSV
			const exportData: Array<{
				company: string;
				firstName: string;
				lastName: string;
				jobTitle: string;
				rank: number;
				reasoning: string;
				employeeRange: string;
				industry: string;
				domain: string;
			}> = [];

			for (const [_company, companyLeads] of companiesMap.entries()) {
				for (const lead of companyLeads) {
					// rank is guaranteed to be non-null by the isNotNull(rankings.rank) filter
					if (lead.rank === null) continue;
					exportData.push({
						company: lead.accountName,
						firstName: lead.firstName,
						lastName: lead.lastName,
						jobTitle: lead.jobTitle,
						rank: lead.rank,
						reasoning: lead.reasoning || "",
						employeeRange: lead.employeeRange || "",
						industry: lead.industry || "",
						domain: lead.accountDomain || "",
					});
				}
			}

			// Sort by company then rank
			exportData.sort((a, b) => {
				const companyCompare = a.company.localeCompare(b.company);
				if (companyCompare !== 0) return companyCompare;
				return a.rank - b.rank;
			});

			return {
				data: exportData,
				totalCompanies: companiesMap.size,
				totalLeads: exportData.length,
			} as const;
		}),
});
