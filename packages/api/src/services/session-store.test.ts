import { describe, expect, test } from "bun:test";
import {
	getSessionAiBatchIds,
	getSessionOptimizedPrompt,
	registerSessionAiBatchId,
	setSessionOptimizedPrompt,
} from "./session-store";

describe("session-store", () => {
	test("tracks batch IDs per session", () => {
		registerSessionAiBatchId("session-a", "batch-1");
		registerSessionAiBatchId("session-a", "batch-2");
		registerSessionAiBatchId("session-b", "batch-3");

		expect(getSessionAiBatchIds("session-a").sort()).toEqual([
			"batch-1",
			"batch-2",
		]);
		expect(getSessionAiBatchIds("session-b")).toEqual(["batch-3"]);
	});

	test("stores optimized prompt per session", () => {
		setSessionOptimizedPrompt("session-c", "optimized");
		expect(getSessionOptimizedPrompt("session-c")).toBe("optimized");
	});
});
