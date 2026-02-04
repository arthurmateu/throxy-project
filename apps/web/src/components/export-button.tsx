"use client";

import { env } from "@throxy-interview/env/web";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLeadsView } from "@/components/leads-view-context";
import { Button } from "@/components/ui/button";

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
	const { view } = useLeadsView();

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const input = {
				sortBy: view.sortBy,
				sortOrder: view.sortOrder,
				showIrrelevant: view.showIrrelevant,
				topPerCompany: view.topPerCompany,
			};
			const result = await fetch(
				`${env.NEXT_PUBLIC_SERVER_URL}/trpc/export.currentView?input=${encodeURIComponent(
					JSON.stringify(input),
				)}`,
			);
			const json = await result.json();

			if (json.result?.data?.data) {
				const csvContent = generateCSV(json.result.data.data);
				const filename = `leads-export-${new Date().toISOString().split("T")[0]}.csv`;
				downloadCSV(csvContent, filename);
				toast.success("Export complete", {
					description: `Exported ${json.result.data.totalLeads} leads.`,
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
		<Button
			variant="outline"
			size="sm"
			onClick={handleExport}
			disabled={isExporting}
		>
			{isExporting ? (
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
			) : (
				<Download className="mr-2 h-4 w-4" />
			)}
			Export CSV
		</Button>
	);
}
