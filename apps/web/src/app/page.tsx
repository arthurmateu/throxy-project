"use client";

import { useQuery } from "@tanstack/react-query";
import { DataImport } from "@/components/data-import";
import { ExportButton } from "@/components/export-button";
import { LeadsTable } from "@/components/leads-table";
import { LeadsViewProvider } from "@/components/leads-view-context";
import { RankingControls } from "@/components/ranking-controls";
import { StatsCards } from "@/components/stats-card";
import { useTRPC } from "@/utils/trpc";

export default function Home() {
	const trpc = useTRPC();
	const healthCheck = useQuery(trpc.healthCheck.queryOptions());

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8">
			<div className="space-y-8">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="font-bold text-3xl tracking-tight">
							Persona Ranker
						</h1>
						<p className="text-muted-foreground">
							AI-powered lead qualification and ranking system
						</p>
					</div>
					<div className="flex items-center gap-2">
						<div
							className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
						/>
						<span className="text-muted-foreground text-sm">
							{healthCheck.isLoading
								? "Checking..."
								: healthCheck.data
									? "API Connected"
									: "API Disconnected"}
						</span>
					</div>
				</div>

				{/* Stats Cards */}
				<StatsCards />

				{/* Data: Import CSV / Run test data */}
				<DataImport />

				{/* Ranking Controls */}
				<RankingControls />

				{/* Leads Table */}
				<LeadsViewProvider>
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-xl">Leads</h2>
							<ExportButton />
						</div>
						<LeadsTable />
					</div>
				</LeadsViewProvider>
			</div>
		</div>
	);
}
