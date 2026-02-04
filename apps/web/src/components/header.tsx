"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { ModeToggle } from "./mode-toggle";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/utils/trpc";

export default function Header() {
	const links = [{ to: "/", label: "Home" }] as const;
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const clearAll = useMutation(trpc.leads.clearAll.mutationOptions());

	const handleClear = () => {
		clearAll.mutate(undefined, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [["leads"]] });
				queryClient.invalidateQueries({ queryKey: [["leads", "stats"]] });
				toast.success("All data cleared");
			},
			onError: (err) => {
				toast.error("Clear failed", { description: err.message });
			},
		});
	};

	return (
		<div>
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex gap-4 text-lg">
					{links.map(({ to, label }) => {
						return (
							<Link key={to} href={to}>
								{label}
							</Link>
						);
					})}
					<Button
						variant="ghost"
						size="sm"
						onClick={handleClear}
						disabled={clearAll.isPending}
					>
						Clear
					</Button>
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
				</div>
			</div>
			<hr />
		</div>
	);
}
