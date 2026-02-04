"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const CSV_ACCEPT = ".csv,text/csv,text/plain";
const POLL_INTERVAL_MS = 1000;

export function AiOptimization() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sessionId = getSessionId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [runId, setRunId] = useState<string | null>(null);
	const [isPolling, setIsPolling] = useState(false);

	const startOptimization = useMutation(
		trpc.optimizer.startSession.mutationOptions(),
	);

	const { data: progress } = useQuery({
		...trpc.optimizer.progress.queryOptions({ runId: runId ?? "" }),
		enabled: !!runId && isPolling,
		refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
	});

	useEffect(() => {
		if (progress?.status === "completed") {
			setIsPolling(false);
			queryClient.invalidateQueries({ queryKey: [["leads", "stats"]] });
			toast.success("Optimization complete", {
				description: `Best fitness: ${progress.bestFitness.toFixed(3)}`,
			});
		} else if (progress?.status === "error") {
			setIsPolling(false);
			toast.error("Optimization failed", {
				description: progress.error,
			});
		}
	}, [progress, queryClient]);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const csv = reader.result as string;
			startOptimization.mutate(
				{ csv, sessionId },
				{
					onSuccess: (data) => {
						setRunId(data.runId);
						setIsPolling(true);
						toast.info("Optimization started", {
							description: "Using session-only pre-ranked data.",
						});
					},
					onError: (err) => {
						toast.error("Optimization failed", { description: err.message });
					},
				},
			);
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const isRunning =
		progress?.status === "running" || startOptimization.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					AI Optimization
					{isRunning && progress && (
						<span className="text-muted-foreground text-xs">
							{progress.percentComplete}%
						</span>
					)}
				</CardTitle>
				<CardDescription>
					Upload a pre-ranked eval CSV (Full Name, Title, Company, LI, Employee
					Range, Rank). Optimization is session-only and resets on refresh.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<input
					ref={fileInputRef}
					type="file"
					accept={CSV_ACCEPT}
					className="hidden"
					onChange={handleFileChange}
					aria-label="Select eval CSV file"
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={startOptimization.isPending}
				>
					<FileUp className="h-4 w-4" />
					<span className="ml-2">Upload eval .csv</span>
				</Button>

				{progress && (
					<div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
						<div className="flex items-center gap-2">
							<Sparkles className="h-4 w-4 text-muted-foreground" />
							<span>
								{progress.status === "running"
									? `Generation ${progress.currentGeneration}/${progress.totalGenerations}`
									: `Status: ${progress.status}`}
							</span>
						</div>
						<div className="mt-2 text-muted-foreground text-xs">
							Best fitness: {progress.bestFitness.toFixed(3)} · Evaluations:{" "}
							{progress.evaluationsRun}/{progress.evaluationsPlanned} ·{" "}
							{progress.percentComplete}%
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
