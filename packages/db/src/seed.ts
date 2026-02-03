import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { leads, prompts } from "./schema";

// Load environment variables from apps/server/.env
config({ path: resolve(__dirname, "../../../apps/server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const db = drizzle(DATABASE_URL);

// Default ranking prompt
const DEFAULT_PROMPT = `You are a lead qualification expert for Throxy, an AI-powered sales company that books meetings in traditional industries.

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

async function parseCSV(content: string): Promise<Record<string, string>[]> {
  const lines = content.trim().split("\n");
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
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  return rows;
}

async function seed() {
  console.log("🌱 Starting seed...");

  // Read and parse leads.csv
  const csvPath = resolve(__dirname, "../../../leads.csv");
  const csvContent = readFileSync(csvPath, "utf-8");
  const rows = await parseCSV(csvContent);

  console.log(`📊 Found ${rows.length} leads in CSV`);

  // Clear existing data
  console.log("🗑️  Clearing existing data...");
  await db.delete(leads);
  await db.delete(prompts);

  // Insert leads
  console.log("📥 Inserting leads...");
  const leadsToInsert = rows.map((row) => ({
    accountName: row.account_name || "",
    firstName: row.lead_first_name || "",
    lastName: row.lead_last_name || "",
    jobTitle: row.lead_job_title || "",
    accountDomain: row.account_domain || null,
    employeeRange: row.account_employee_range || null,
    industry: row.account_industry || null,
  }));

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < leadsToInsert.length; i += batchSize) {
    const batch = leadsToInsert.slice(i, i + batchSize);
    await db.insert(leads).values(batch);
    console.log(
      `  Inserted ${Math.min(i + batchSize, leadsToInsert.length)}/${leadsToInsert.length} leads`
    );
  }

  // Insert default prompt
  console.log("📝 Inserting default prompt...");
  await db.insert(prompts).values({
    version: 1,
    content: DEFAULT_PROMPT,
    isActive: true,
    generation: 0,
  });

  console.log("✅ Seed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
