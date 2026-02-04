"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
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
	const isAnyPending = importFromCsv.isPending;

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
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

	return (
		<Card>
			<CardHeader>
				<CardTitle>Data</CardTitle>
				<CardDescription>
					Import your own CSV.
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
			</CardContent>
		</Card>
	);
}
