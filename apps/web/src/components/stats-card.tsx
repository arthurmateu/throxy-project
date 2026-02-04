"use client";

import { useQuery } from "@tanstack/react-query";
import { DollarSign, UserCheck, Users, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionId } from "@/utils/session";
import { useTRPC } from "@/utils/trpc";

function formatCost(cost: number): string {
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(2)}`;
}

function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
}

export function StatsCards() {
	const trpc = useTRPC();
	const sessionId = getSessionId();
	const { data: stats, isLoading } = useQuery(
		trpc.leads.stats.queryOptions({ sessionId }),
	);

	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton cards never reorder
					<Card key={`skeleton-${i}`}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-4" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-8 w-16" />
							<Skeleton className="mt-1 h-3 w-32" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (!stats) return null;

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Leads</CardTitle>
					<Users className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{stats.totalLeads}</div>
					<p className="text-muted-foreground text-xs">
						{stats.rankedLeads} ranked
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Relevant Leads</CardTitle>
					<UserCheck className="h-4 w-4 text-green-500" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{stats.relevantLeads}</div>
					<p className="text-muted-foreground text-xs">
						{stats.irrelevantLeads} irrelevant (
						{stats.rankedLeads > 0
							? Math.round((stats.relevantLeads / stats.rankedLeads) * 100)
							: 0}
						% relevance rate)
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						AI Cost (Session)
					</CardTitle>
					<DollarSign className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{formatCost(stats.aiCalls.totalCost)}
					</div>
					<p className="text-muted-foreground text-xs">
						{stats.aiCalls.totalCalls} API calls
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						Tokens Used (Session)
					</CardTitle>
					<Zap className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{formatNumber(
							stats.aiCalls.totalInputTokens + stats.aiCalls.totalOutputTokens,
						)}
					</div>
					<p className="text-muted-foreground text-xs">
						{formatNumber(stats.aiCalls.totalInputTokens)} in /{" "}
						{formatNumber(stats.aiCalls.totalOutputTokens)} out
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
