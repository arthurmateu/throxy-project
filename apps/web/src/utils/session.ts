const createSessionId = (): string => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `session_${Math.random().toString(36).slice(2, 11)}`;
};

let sessionId: string | null = null;

export const getSessionId = (): string => {
	if (!sessionId) {
		sessionId = createSessionId();
	}
	return sessionId;
};
