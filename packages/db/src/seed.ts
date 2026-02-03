import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { leads, prompts } from "./schema";
import { DEFAULT_PROMPT, parseLeadsCSV } from "./seed-utils";

// Load environment variables from apps/server/.env
config({ path: resolve(__dirname, "../../../apps/server/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	throw new Error("DATABASE_URL environment variable is required");
}

const db = drizzle(DATABASE_URL);

async function seed() {
	console.log("🌱 Starting seed...");

	// Read and parse leads.csv
	const csvPath = resolve(__dirname, "../../../leads.csv");
	const csvContent = readFileSync(csvPath, "utf-8");
	const leadsToInsert = parseLeadsCSV(csvContent);

	console.log(`📊 Found ${leadsToInsert.length} leads in CSV`);

	// Clear existing data
	console.log("🗑️  Clearing existing data...");
	await db.delete(leads);
	await db.delete(prompts);

	// Insert leads
	console.log("📥 Inserting leads...");

	// Insert in batches of 50
	const batchSize = 50;
	for (let i = 0; i < leadsToInsert.length; i += batchSize) {
		const batch = leadsToInsert.slice(i, i + batchSize);
		await db.insert(leads).values(batch);
		console.log(
			`  Inserted ${Math.min(i + batchSize, leadsToInsert.length)}/${leadsToInsert.length} leads`,
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
