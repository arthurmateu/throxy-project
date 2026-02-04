type RankingBatchListener = (batchId: string) => void;

let latestBatchId: string | null = null;
const listeners = new Set<RankingBatchListener>();

export const publishRankingBatchId = (batchId: string) => {
	latestBatchId = batchId;
	for (const listener of listeners) {
		listener(batchId);
	}
};

export const getLatestRankingBatchId = (): string | null => latestBatchId;

export const subscribeRankingBatchId = (
	listener: RankingBatchListener,
): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
