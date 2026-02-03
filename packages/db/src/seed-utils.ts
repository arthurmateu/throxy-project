/**
 * Shared utilities for seeding leads from CSV. Used by the CLI seed script
 * and by the API (import + run test data).
 */

export const DEFAULT_PROMPT = `You are a lead qualification expert for Throxy, an AI-powered sales company that books meetings in traditional industries.

Your task is to rank leads based on their fit with Throxy's ideal customer persona. Throxy's ideal customers are B2B companies that sell into complex verticals—manufacturing, education, and healthcare.

## Company Size Tiers and Target Contacts:

### Startups (1-50 employees / "2-10", "11-50"):
- Primary targets: Founder, Co-Founder, CEO, President, Owner, Managing Director, Head of Sales
- These are decision-makers who are operationally involved in sales

### SMB (51-200 employees):
- Primary targets: VP of Sales, Head of Sales, Sales Director, Director of Sales Development, CRO, Head of Revenue Operations, VP of Growth
- Sales leadership with budget authority

### Mid-Market (201-1000 employees / "201-500", "501-1000"):
- Primary targets: VP of Sales Development, VP of Sales, Head of Sales Development, Director of Sales Development, CRO, VP of Revenue Operations, VP of GTM
- Focus on sales development leadership

### Enterprise (1000+ employees / "1001-5000", "5001-10000", "10001+"):
- Primary targets: VP of Sales Development, VP of Inside Sales, Head of Sales Development, CRO, VP of Revenue Operations, Director of Sales Development
- CEOs are too removed; target VP and Director level

## Department Priority (High to Low):
1. Sales Development (5/5)
2. Sales (5/5)
3. Revenue Operations (4/5)
4. Business Development (4/5)
5. GTM / Growth (4/5)
6. Executive (5/5 for startups only, 1/5 for larger companies)

## Hard Exclusions (DO NOT rank, mark as irrelevant):
- HR / Human Resources
- Finance / CFO / Accounting
- CTO / Engineering / IT / Technical roles
- Legal / Compliance
- Customer Success / Support
- Product Management
- Marketing (unless specifically Growth/GTM focused)
- Operations (unless Sales Operations/Revenue Operations)
- Administrative roles (Assistants, Coordinators unless Sales related)
- Students / Interns
- Retired / Unemployed

## Soft Exclusions (Lower rank):
- BDRs / SDRs (not decision-makers, rank 7-9 if included)
- Account Executives (closers, not outbound owners, rank 6-8)
- Advisors / Board Members / Investors (no buying power)

## Ranking Scale (1-10):
- 1-2: Perfect fit - exact title match for company size, decision-maker
- 3-4: Strong fit - relevant title, good seniority for company size
- 5-6: Moderate fit - related role, may influence decisions
- 7-9: Weak fit - tangentially related, unlikely decision-maker
- null: Not relevant - hard exclusion, wrong department entirely

For each lead, return a JSON object with:
- rank: number 1-10 or null if irrelevant
- reasoning: brief explanation (1-2 sentences) of why this rank was assigned

Consider the lead's job title AND the company size when determining rank. A CEO at a 10,000+ employee company should be ranked lower than a VP of Sales Development, but a CEO at a 10-person startup should be ranked highly.`;

export interface LeadRow {
	accountName: string;
	firstName: string;
	lastName: string;
	jobTitle: string;
	accountDomain: string | null;
	employeeRange: string | null;
	industry: string | null;
}

/** Parse CSV content into generic row objects (header -> values) */
function parseCSV(content: string): Record<string, string>[] {
	const lines = content.trim().split("\n");
	if (lines.length === 0) return [];

	const headers = lines[0].split(",").map((h) => h.trim());
	const rows: Record<string, string>[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values: string[] = [];
		let current = "";
		let inQuotes = false;

		for (const char of lines[i]) {
			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === "," && !inQuotes) {
				values.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}
		values.push(current.trim());

		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			row[headers[j]] = values[j] ?? "";
		}
		rows.push(row);
	}

	return rows;
}

/** Map CSV column names (snake_case) to our lead row shape */
export function parseLeadsCSV(content: string): LeadRow[] {
	const rows = parseCSV(content);
	return rows.map((row) => ({
		accountName: row.account_name ?? "",
		firstName: row.lead_first_name ?? "",
		lastName: row.lead_last_name ?? "",
		jobTitle: row.lead_job_title ?? "",
		accountDomain: row.account_domain?.trim() || null,
		employeeRange: row.account_employee_range?.trim() || null,
		industry: row.account_industry?.trim() || null,
	}));
}
