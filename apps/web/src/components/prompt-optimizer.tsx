"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Play,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export function PromptOptimizer() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Get eval set info
  const { data: evalInfo, isLoading: evalLoading } = useQuery(
    trpc.optimizer.evalSetInfo.queryOptions()
  );

  // Get prompt history
  const { data: history, isLoading: historyLoading } = useQuery(
    trpc.optimizer.history.queryOptions()
  );

  // Get progress
  const { data: progress } = useQuery({
    ...trpc.optimizer.progress.queryOptions({ runId: runId ?? "" }),
    enabled: !!runId && isPolling,
    refetchInterval: isPolling ? 2000 : false,
  });

  // Start optimization mutation
  const startOptimization = useMutation({
    ...trpc.optimizer.start.mutationOptions(),
    onSuccess: (data) => {
      if (data) {
        setRunId(data.runId);
        setIsPolling(true);
        toast.info("Prompt optimization started", {
          description: `Evaluating against ${data.evalLeadsCount} leads.`,
        });
      }
    },
    onError: (error) => {
      toast.error("Failed to start optimization", {
        description: error.message,
      });
    },
  });

  // Activate prompt mutation
  const activatePrompt = useMutation({
    ...trpc.optimizer.activate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["optimizer", "history"]] });
      toast.success("Prompt activated", {
        description: "The selected prompt is now active for ranking.",
      });
    },
    onError: (error) => {
      toast.error("Failed to activate prompt", {
        description: error.message,
      });
    },
  });

  // Monitor progress
  useEffect(() => {
    if (progress?.status === "completed") {
      setIsPolling(false);
      queryClient.invalidateQueries({ queryKey: [["optimizer", "history"]] });
      toast.success("Optimization complete!", {
        description: `Best fitness: ${(progress.bestFitness * 100).toFixed(1)}%`,
      });
    } else if (progress?.status === "error") {
      setIsPolling(false);
      toast.error("Optimization failed", {
        description: progress.error,
      });
    }
  }, [progress?.status, progress?.bestFitness, progress?.error, queryClient]);

  const isRunning = progress?.status === "running" || startOptimization.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Prompt Optimization
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
          Use genetic algorithms to automatically optimize the ranking prompt based on the evaluation set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Eval Set Info */}
        {evalLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : evalInfo && evalInfo.totalLeads > 0 ? (
          <div className="rounded-md bg-muted p-4">
            <h4 className="font-medium mb-2">Evaluation Dataset</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Leads</div>
                <div className="font-medium">{evalInfo.totalLeads}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Relevant</div>
                <div className="font-medium text-green-600">{evalInfo.relevantLeads}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Irrelevant</div>
                <div className="font-medium text-gray-500">{evalInfo.irrelevantLeads}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Companies</div>
                <div className="font-medium">{evalInfo.uniqueCompanies}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
            Evaluation dataset not found. Please ensure eval_set.csv exists in the project root.
          </div>
        )}

        {/* Progress */}
        {isRunning && progress && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>
                Generation {progress.currentGeneration} of {progress.totalGenerations}
              </span>
              <span>{progress.evaluationsRun} evaluations run</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${(progress.currentGeneration / progress.totalGenerations) * 100}%`,
                }}
              />
            </div>
            <div className="text-sm">
              <span className="font-medium">Best Fitness:</span>{" "}
              <span className="text-green-600">{(progress.bestFitness * 100).toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Start Button */}
        <Button
          onClick={() => startOptimization.mutate({})}
          disabled={isRunning || !evalInfo || evalInfo.totalLeads === 0}
        >
          {isRunning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Start Optimization
        </Button>

        {/* Prompt History */}
        {historyLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : history && history.length > 0 ? (
          <div className="space-y-3">
            <h4 className="font-medium">Prompt Versions</h4>
            <div className="space-y-2">
              {history.map((prompt) => (
                <div
                  key={prompt.version}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium">
                        Version {prompt.version}
                        {prompt.isActive && (
                          <Badge variant="success" className="ml-2">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {prompt.evalScore !== null
                          ? `Fitness: ${(prompt.evalScore * 100).toFixed(1)}%`
                          : "Not evaluated"}
                        {prompt.generation !== null && ` · Gen ${prompt.generation}`}
                      </div>
                    </div>
                  </div>
                  {!prompt.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => activatePrompt.mutate({ version: prompt.version })}
                      disabled={activatePrompt.isPending}
                    >
                      {activatePrompt.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Activate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
