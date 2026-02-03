"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Play } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useTRPC } from "@/utils/trpc";

const CSV_ACCEPT = ".csv,text/csv,text/plain";

export function DataImport() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const importFromCsv = useMutation(trpc.leads.importFromCsv.mutationOptions());
	const runTestData = useMutation(trpc.leads.runTestData.mutationOptions());

	const isAnyPending = importFromCsv.isPending || runTestData.isPending;

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (runTestData.isPending) {
				toast.error("Please wait for the current operation to finish.");
				return;
			}
			const csv = reader.result as string;
			importFromCsv.mutate(
				{ csv },
				{
					onSuccess: (data) => {
						queryClient.invalidateQueries({ queryKey: [["leads"]] });
						queryClient.invalidateQueries({ queryKey: [["leads", "stats"]] });
						toast.success("CSV imported", {
							description: `Imported ${data.imported} leads.`,
						});
					},
					onError: (err) => {
						toast.error("Import failed", { description: err.message });
					},
				},
			);
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const handleRunTestData = () => {
		runTestData.mutate(undefined, {
			onSuccess: (data) => {
				queryClient.invalidateQueries({ queryKey: [["leads"]] });
				queryClient.invalidateQueries({ queryKey: [["leads", "stats"]] });
				toast.success("Test data loaded", {
					description: data.message,
				});
			},
			onError: (err) => {
				toast.error("Failed to load test data", { description: err.message });
			},
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Data</CardTitle>
				<CardDescription>
					Import your own CSV or load built-in test data (leads.csv + eval_set
					for optimizer).
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center gap-3">
				<input
					ref={fileInputRef}
					type="file"
					accept={CSV_ACCEPT}
					className="hidden"
					onChange={handleFileChange}
					aria-label="Select CSV file"
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={isAnyPending}
				>
					{importFromCsv.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<FileUp className="h-4 w-4" />
					)}
					<span className="ml-2">Import .csv</span>
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={handleRunTestData}
					disabled={isAnyPending}
				>
					{runTestData.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Play className="h-4 w-4" />
					)}
					<span className="ml-2">Run test data</span>
				</Button>
			</CardContent>
		</Card>
	);
}
