import type { StepResult, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";
import { composeStepHandlers } from "../src/compose";

const makeStep = (
	toolCalls: Array<{ toolName: string }> = [],
): StepResult<ToolSet> => ({ toolCalls }) as unknown as StepResult<ToolSet>;

describe("composeStepHandlers", () => {
	it("runs handlers sequentially in order", async () => {
		const order: number[] = [];
		const handler1 = vi.fn(async () => {
			order.push(1);
		});
		const handler2 = vi.fn(async () => {
			order.push(2);
		});
		const handler3 = vi.fn(async () => {
			order.push(3);
		});

		const composed = composeStepHandlers(handler1, handler2, handler3);
		const step = makeStep();
		await composed(step);

		expect(order).toEqual([1, 2, 3]);
		expect(handler1).toHaveBeenCalledWith(step);
		expect(handler2).toHaveBeenCalledWith(step);
		expect(handler3).toHaveBeenCalledWith(step);
	});

	it("handles a mix of sync and async handlers", async () => {
		const order: number[] = [];
		const syncHandler = vi.fn(() => {
			order.push(1);
		});
		const asyncHandler = vi.fn(async () => {
			order.push(2);
		});

		const composed = composeStepHandlers(syncHandler, asyncHandler);
		await composed(makeStep());

		expect(order).toEqual([1, 2]);
	});

	it("propagates errors from handlers", async () => {
		const error = new Error("handler failed");
		const failingHandler = vi.fn(async () => {
			throw error;
		});
		const neverCalled = vi.fn();

		const composed = composeStepHandlers(failingHandler, neverCalled);

		await expect(composed(makeStep())).rejects.toThrow("handler failed");
		expect(neverCalled).not.toHaveBeenCalled();
	});

	it("works with a single handler", async () => {
		const handler = vi.fn(async () => {});
		const composed = composeStepHandlers(handler);

		await composed(makeStep());

		expect(handler).toHaveBeenCalledOnce();
	});

	it("works with no handlers", async () => {
		const composed = composeStepHandlers();

		// Should resolve without error
		await expect(composed(makeStep())).resolves.toBeUndefined();
	});
});
