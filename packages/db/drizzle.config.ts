import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

const normalizeConnectionString = (connectionString: string) => {
	try {
		const parsedUrl = new URL(connectionString);
		const sslmode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
		const shouldStripSslmode = sslmode === "require";

		if (shouldStripSslmode) {
			parsedUrl.searchParams.delete("sslmode");
			return { connectionString: parsedUrl.toString(), sslmode };
		}

		return { connectionString, sslmode };
	} catch {
		return { connectionString, sslmode: undefined };
	}
};

const { connectionString, sslmode } = normalizeConnectionString(
	process.env.DATABASE_URL || "",
);
const shouldUseSsl = sslmode === "require";

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: connectionString,
		ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
	},
});
