"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getSessionId } from "@/utils/session";
import { useTRPC } from "@/utils/trpc";

// ============================================================================
// Types
// ============================================================================

type AIProvider = "openai" | "anthropic" | "gemini";

interface ProviderButtonProps {
	provider: AIProvider;
	label: string;
	isRunning: boolean;
	isDisabled: boolean;
	isDefault?: boolean;
	onStart: (provider: AIProvider) => void;
}

interface ProgressBarProps {
	currentCompany: string | null;
	completed: number;
	total: number;
	percent: number;
}

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_LABELS: Record<AIProvider, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	gemini: "Gemini",
};

const POLL_INTERVAL_MS = 1000;

// ============================================================================
// Pure Components
// ============================================================================

const ProgressBar = ({
	currentCompany,
	completed,
	total,
	percent,
}: ProgressBarProps) => (
	<div className="space-y-2">
		<div className="flex justify-between text-sm">
			<span>
				{currentCompany ? `Processing: ${currentCompany}` : "Starting..."}
			</span>
			<span>
				{completed} / {total}
			</span>
		</div>
		<div className="h-2 w-full rounded-full bg-secondary">
			<div
				className="h-2 rounded-full bg-primary transition-all duration-300"
				style={{ width: `${percent}%` }}
			/>
		</div>
	</div>
);

const ProviderButton = ({
	provider,
	label,
	isRunning,
	isDisabled,
	isDefault = false,
	onStart,
}: ProviderButtonProps) => (
	<Button
		variant={isDefault ? "default" : "outline"}
		onClick={() => onStart(provider)}
		disabled={isDisabled}
	>
		{isRunning ? (
			<Loader2 className="mr-2 h-4 w-4 animate-spin" />
		) : (
			<Play className="mr-2 h-4 w-4" />
		)}
		Run with {label}
	</Button>
);

const NoProviderWarning = () => (
	<div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
		No AI provider configured. Please add OPENAI_API_KEY, ANTHROPIC_API_KEY, or
		GEMINI_API_KEY to your environment.
	</div>
);

// ============================================================================
// Pure Functions
// ============================================================================

const calculateProgressPercent = (completed: number, total: number): number =>
	total > 0 ? Math.round((completed / total) * 100) : 0;

const hasProviders = (providers: AIProvider[] | undefined): boolean =>
	(providers?.length ?? 0) > 0;

// ============================================================================
// Main Component
// ============================================================================

export function RankingControls() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sessionId = getSessionId();
	const [batchId, setBatchId] = useState<string | null>(null);
	const [isPolling, setIsPolling] = useState(false);

	// Get available providers
	const { data: providersData } = useQuery(
		trpc.ranking.availableProviders.queryOptions(),
	);

	// Get progress
	const { data: progress } = useQuery({
		...trpc.ranking.progress.queryOptions({ batchId: batchId ?? "" }),
		enabled: !!batchId && isPolling,
		refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
	});

	// Start ranking mutation
	const startRankingMutation = trpc.ranking.start.mutationOptions();
	const startRanking = useMutation({
		...startRankingMutation,
		onSuccess: (data) => {
			if (data) {
				setBatchId(data.batchId);
				setIsPolling(true);
				toast.info("Ranking process started", {
					description:
						"This may take a few minutes depending on the number of leads.",
				});
			}
		},
		onError: (error) => {
			toast.error("Failed to start ranking", {
				description: error.message,
			});
		},
	});

	// Handle completion/error status changes
	const handleStatusChange = useCallback(() => {
		if (progress?.status === "completed") {
			setIsPolling(false);
			queryClient.invalidateQueries({ queryKey: [["leads"]] });
			queryClient.invalidateQueries({ queryKey: [["leads", "stats"]] });
			toast.success("Ranking complete!", {
				description: `Ranked ${progress.completed} leads.`,
			});
		} else if (progress?.status === "error") {
			setIsPolling(false);
			toast.error("Ranking failed", {
				description: progress.error,
			});
		}
	}, [progress?.status, progress?.completed, progress?.error, queryClient]);

	useEffect(() => {
		handleStatusChange();
	}, [handleStatusChange]);

	// Derived state
	const isRunning = progress?.status === "running" || startRanking.isPending;
	const progressPercent = calculateProgressPercent(
		progress?.completed ?? 0,
		progress?.total ?? 0,
	);
	const hasProvider = hasProviders(providersData?.providers);
	const availableProviders = providersData?.providers ?? [];

	const handleStartRanking = useCallback(
		(provider: AIProvider) => startRanking.mutate({ provider, sessionId }),
		[startRanking, sessionId],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">AI Ranking</CardTitle>
				<CardDescription>
					Run the AI ranking process to score and rank all leads against the
					persona spec.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!hasProvider && <NoProviderWarning />}

				{isRunning && progress && (
					<ProgressBar
						currentCompany={progress.currentCompany}
						completed={progress.completed}
						total={progress.total}
						percent={progressPercent}
					/>
				)}

				<div className="flex gap-2">
					{availableProviders.map((provider, index) => (
						<ProviderButton
							key={provider}
							provider={provider}
							label={PROVIDER_LABELS[provider]}
							isRunning={isRunning}
							isDisabled={isRunning || !hasProvider}
							isDefault={index === 0}
							onStart={handleStartRanking}
						/>
					))}
					{availableProviders.length === 0 && (
						<Button disabled>
							<Play className="mr-2 h-4 w-4" />
							No Provider Available
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
