"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function RankingControls() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Get available providers
  const { data: providersData } = useQuery(
    trpc.ranking.availableProviders.queryOptions()
  );

  // Get progress
  const { data: progress } = useQuery({
    ...trpc.ranking.progress.queryOptions({ batchId: batchId ?? "" }),
    enabled: !!batchId && isPolling,
    refetchInterval: isPolling ? 1000 : false,
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
          description: "This may take a few minutes depending on the number of leads.",
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to start ranking", {
        description: error.message,
      });
    },
  });

  // Monitor progress and stop polling when complete
  useEffect(() => {
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

  const isRunning = progress?.status === "running" || startRanking.isPending;
  const progressPercent = progress?.total 
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const hasProvider = (providersData?.providers.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI Ranking
          {progress?.status === "running" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {progress?.status === "completed" && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {progress?.status === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </CardTitle>
        <CardDescription>
          Run the AI ranking process to score and rank all leads against the persona spec.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasProvider && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
            No AI provider configured. Please add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment.
          </div>
        )}

        {isRunning && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {progress.currentCompany 
                  ? `Processing: ${progress.currentCompany}` 
                  : "Starting..."}
              </span>
              <span>{progress.completed} / {progress.total}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {providersData?.providers.includes("openai") && (
            <Button
              onClick={() => startRanking.mutate({ provider: "openai" })}
              disabled={isRunning || !hasProvider}
            >
              {isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run with OpenAI
            </Button>
          )}
          {providersData?.providers.includes("anthropic") && (
            <Button
              variant="outline"
              onClick={() => startRanking.mutate({ provider: "anthropic" })}
              disabled={isRunning || !hasProvider}
            >
              {isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run with Anthropic
            </Button>
          )}
          {!providersData?.providers.length && (
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
