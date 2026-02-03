"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { LeadsTable } from "@/components/leads-table";
import { RankingControls } from "@/components/ranking-controls";
import { StatsCards } from "@/components/stats-card";
import { ExportButton } from "@/components/export-button";
import { PromptOptimizer } from "@/components/prompt-optimizer";

export default function Home() {
  const trpc = useTRPC();
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Persona Ranker</h1>
            <p className="text-muted-foreground">
              AI-powered lead qualification and ranking system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-sm text-muted-foreground">
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

        {/* Ranking Controls */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RankingControls />
          <PromptOptimizer />
        </div>

        {/* Leads Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Leads</h2>
            <ExportButton />
          </div>
          <LeadsTable />
        </div>
      </div>
    </div>
  );
}
