export type RankingChange = {
	leadId: string;
	fullName: string;
	company: string;
	oldRank: number | null;
	newRank: number | null;
};

type SessionState = {
	aiBatchIds: Set<string>;
	optimizedPrompt?: string;
	pendingOptimization?: boolean;
	rankingChanges?: RankingChange[];
};

const sessionMap = new Map<string, SessionState>();

const getOrCreateSession = (sessionId: string): SessionState => {
	const existing = sessionMap.get(sessionId);
	if (existing) return existing;
	const created: SessionState = { aiBatchIds: new Set<string>() };
	sessionMap.set(sessionId, created);
	return created;
};

export const registerSessionAiBatchId = (
	sessionId: string | undefined,
	batchId: string,
): void => {
	if (!sessionId) return;
	const session = getOrCreateSession(sessionId);
	session.aiBatchIds.add(batchId);
};

export const setSessionOptimizedPrompt = (
	sessionId: string | undefined,
	prompt: string,
): void => {
	if (!sessionId) return;
	const session = getOrCreateSession(sessionId);
	session.optimizedPrompt = prompt;
	session.pendingOptimization = true;
	session.rankingChanges = undefined;
};

export const getSessionOptimizedPrompt = (
	sessionId: string | undefined,
): string | undefined => {
	if (!sessionId) return undefined;
	return sessionMap.get(sessionId)?.optimizedPrompt;
};

export const hasPendingOptimization = (
	sessionId: string | undefined,
): boolean => {
	if (!sessionId) return false;
	return sessionMap.get(sessionId)?.pendingOptimization ?? false;
};

export const setSessionRankingChanges = (
	sessionId: string | undefined,
	changes: RankingChange[],
): void => {
	if (!sessionId) return;
	const session = getOrCreateSession(sessionId);
	session.rankingChanges = changes;
	session.pendingOptimization = false;
};

export const getSessionRankingChanges = (
	sessionId: string | undefined,
): RankingChange[] => {
	if (!sessionId) return [];
	return sessionMap.get(sessionId)?.rankingChanges ?? [];
};

export const getSessionAiBatchIds = (
	sessionId: string | undefined,
): string[] => {
	if (!sessionId) return [];
	const session = sessionMap.get(sessionId);
	return session ? Array.from(session.aiBatchIds) : [];
};
