"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export type SortBy = "rank" | "name" | "company";
export type SortOrder = "asc" | "desc";

export interface LeadsViewOptions {
	showIrrelevant: boolean;
	topPerCompany: number | undefined;
	sortBy: SortBy;
	sortOrder: SortOrder;
}

const defaultView: LeadsViewOptions = {
	showIrrelevant: true,
	topPerCompany: undefined,
	sortBy: "rank",
	sortOrder: "asc",
};

type SetView = (update: Partial<LeadsViewOptions>) => void;

const LeadsViewContext = createContext<{
	view: LeadsViewOptions;
	setView: SetView;
} | null>(null);

export function LeadsViewProvider({ children }: { children: ReactNode }) {
	const [view, setViewState] = useState<LeadsViewOptions>(defaultView);
	const setView = useCallback((update: Partial<LeadsViewOptions>) => {
		setViewState((prev) => ({ ...prev, ...update }));
	}, []);
	const value = useMemo(() => ({ view, setView }), [view, setView]);
	return (
		<LeadsViewContext.Provider value={value}>
			{children}
		</LeadsViewContext.Provider>
	);
}

export function useLeadsView() {
	const ctx = useContext(LeadsViewContext);
	if (!ctx)
		throw new Error("useLeadsView must be used within LeadsViewProvider");
	return ctx;
}
