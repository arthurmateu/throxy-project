"use client";

import { env } from "@throxy-interview/env/web";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function generateCSV(data: Record<string, unknown>[]): string {
	const first = data[0];
	if (!first) return "";

	const headers = Object.keys(first);
	const rows = data.map((row) =>
		headers
			.map((header) => {
				const value = String(row[header] ?? "");
				// Escape quotes and wrap in quotes if contains comma, quote, or newline
				if (
					value.includes(",") ||
					value.includes('"') ||
					value.includes("\n")
				) {
					return `"${value.replace(/"/g, '""')}"`;
				}
				return value;
			})
			.join(","),
	);

	return [headers.join(","), ...rows].join("\n");
}

function downloadCSV(csvContent: string, filename: string) {
	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", filename);
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

export function ExportButton() {
	const [isExporting, setIsExporting] = useState(false);

	const handleExport = async (requestedTopN: number) => {
		setIsExporting(true);
		try {
			// We need to manually fetch since we can't use useQuery for on-demand
			const result = await fetch(
				`${env.NEXT_PUBLIC_SERVER_URL}/trpc/export.topLeadsPerCompany?input=${encodeURIComponent(
					JSON.stringify({ topN: requestedTopN }),
				)}`,
			);
			const json = await result.json();

			if (json.result?.data?.data) {
				const csvContent = generateCSV(json.result.data.data);
				const filename = `top-${requestedTopN}-leads-per-company-${new Date().toISOString().split("T")[0]}.csv`;
				downloadCSV(csvContent, filename);
				toast.success("Export complete", {
					description: `Exported ${json.result.data.totalLeads} leads from ${json.result.data.totalCompanies} companies.`,
				});
			} else {
				throw new Error("No data to export");
			}
		} catch (error) {
			toast.error("Export failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 font-medium text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
				disabled={isExporting}
			>
				{isExporting ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Download className="mr-2 h-4 w-4" />
				)}
				Export CSV
				<ChevronDown className="ml-2 h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleExport(1)}>
					Top 1 per company
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport(3)}>
					Top 3 per company
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport(5)}>
					Top 5 per company
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport(10)}>
					Top 10 per company
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
