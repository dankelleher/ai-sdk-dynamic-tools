import type { StepResult, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";
import { dynamicTools } from "../src/dynamic-tools";

/** Minimal StepResult stub — only fields the implementation reads */
const makeStep = (
	toolCalls: Array<{ toolName: string }>,
): StepResult<ToolSet> => ({ toolCalls }) as unknown as StepResult<ToolSet>;

describe("dynamicTools", () => {
	it("returns a shallow copy of the initial tools", () => {
		const original = { a: { type: "function" }, b: { type: "function" } };
		const { tools } = dynamicTools({
			tools: original as unknown as ToolSet,
			refreshTools: async () => ({}),
			shouldRefresh: () => false,
		});

		expect(tools).not.toBe(original);
		expect(Object.keys(tools)).toEqual(["a", "b"]);
	});

	it("does not refresh when shouldRefresh returns false", async () => {
		const refreshTools = vi.fn(async () => ({ fresh: { type: "function" } }));
		const { tools, onStepFinish } = dynamicTools({
			tools: { old: { type: "function" } } as unknown as ToolSet,
			refreshTools,
			shouldRefresh: () => false,
		});

		await onStepFinish(makeStep([{ toolName: "some-tool" }]));

		expect(refreshTools).not.toHaveBeenCalled();
		expect(Object.keys(tools)).toEqual(["old"]);
	});

	it("refreshes tools in-place when shouldRefresh returns true", async () => {
		const freshToolSet = { x: { type: "function" }, y: { type: "function" } };
		const { tools, onStepFinish } = dynamicTools({
			tools: { a: { type: "function" } } as unknown as ToolSet,
			refreshTools: async () => freshToolSet as unknown as ToolSet,
			shouldRefresh: (step) =>
				step.toolCalls.some((tc) => tc.toolName === "load-skill"),
		});

		// Capture the reference before refresh
		const toolsRef = tools;

		await onStepFinish(makeStep([{ toolName: "load-skill" }]));

		// Same reference (mutated in-place)
		expect(tools).toBe(toolsRef);
		// Old keys removed, new keys present
		expect(Object.keys(tools)).toEqual(["x", "y"]);
		expect("a" in tools).toBe(false);
	});

	it("calls onRefresh with new tool names after refresh", async () => {
		const onRefresh = vi.fn();
		const { onStepFinish } = dynamicTools({
			tools: { old: { type: "function" } } as unknown as ToolSet,
			refreshTools: async () =>
				({ alpha: {}, beta: {}, gamma: {} }) as unknown as ToolSet,
			shouldRefresh: () => true,
			onRefresh,
		});

		await onStepFinish(makeStep([{ toolName: "anything" }]));

		expect(onRefresh).toHaveBeenCalledOnce();
		expect(onRefresh).toHaveBeenCalledWith(["alpha", "beta", "gamma"]);
	});

	it("does not call onRefresh when shouldRefresh returns false", async () => {
		const onRefresh = vi.fn();
		const { onStepFinish } = dynamicTools({
			tools: {} as ToolSet,
			refreshTools: async () => ({}) as ToolSet,
			shouldRefresh: () => false,
			onRefresh,
		});

		await onStepFinish(makeStep([]));

		expect(onRefresh).not.toHaveBeenCalled();
	});

	it("works without onRefresh callback", async () => {
		const { onStepFinish } = dynamicTools({
			tools: { a: {} } as unknown as ToolSet,
			refreshTools: async () => ({ b: {} }) as unknown as ToolSet,
			shouldRefresh: () => true,
		});

		// Should not throw
		await expect(
			onStepFinish(makeStep([{ toolName: "trigger" }])),
		).resolves.toBeUndefined();
	});

	it("handles multiple sequential refreshes", async () => {
		let callCount = 0;
		const { tools, onStepFinish } = dynamicTools({
			tools: { initial: {} } as unknown as ToolSet,
			refreshTools: async () => {
				callCount++;
				return { [`tool-${callCount}`]: {} } as unknown as ToolSet;
			},
			shouldRefresh: () => true,
		});

		await onStepFinish(makeStep([{ toolName: "trigger" }]));
		expect(Object.keys(tools)).toEqual(["tool-1"]);

		await onStepFinish(makeStep([{ toolName: "trigger" }]));
		expect(Object.keys(tools)).toEqual(["tool-2"]);
	});

	describe("prepareStep", () => {
		/** Build a minimal prepareStep options object */
		const makeStepOptions = (
			messages: Array<{ role: string; content: string }>,
			stepNumber = 0,
		) =>
			({
				steps: [],
				stepNumber,
				model: {} as never,
				messages,
				experimental_context: undefined,
			}) as Parameters<
				NonNullable<ReturnType<typeof dynamicTools>["prepareStep"]>
			>[0];

		it("is not returned when refreshMessage is omitted", () => {
			const result = dynamicTools({
				tools: { a: {} } as unknown as ToolSet,
				refreshTools: async () => ({}) as ToolSet,
				shouldRefresh: () => false,
			});

			expect(result.prepareStep).toBeUndefined();
		});

		it("returns undefined (no overrides) when no refresh has occurred", () => {
			const { prepareStep } = dynamicTools({
				tools: { a: {} } as unknown as ToolSet,
				refreshTools: async () => ({}) as ToolSet,
				shouldRefresh: () => false,
				refreshMessage: "Tools updated.",
			});

			expect(prepareStep).toBeDefined();

			const messages = [{ role: "user" as const, content: "hello" }];
			const result = prepareStep?.(makeStepOptions(messages));

			expect(result).toBeUndefined();
		});

		it("appends a user message after refresh (static string)", async () => {
			const { onStepFinish, prepareStep } = dynamicTools({
				tools: { old: {} } as unknown as ToolSet,
				refreshTools: async () => ({ newTool: {} }) as unknown as ToolSet,
				shouldRefresh: () => true,
				refreshMessage: "Your tools have been updated.",
			});

			// Trigger a refresh
			await onStepFinish(makeStep([{ toolName: "load-skill" }]));

			const messages = [{ role: "user" as const, content: "hello" }];
			const result = prepareStep?.(makeStepOptions(messages, 1));

			expect(result).toEqual({
				messages: [
					{ role: "user", content: "hello" },
					{
						role: "user",
						content: "[system: Your tools have been updated.]",
					},
				],
			});
		});

		it("appends a user message after refresh (function)", async () => {
			const { onStepFinish, prepareStep } = dynamicTools({
				tools: { old: {} } as unknown as ToolSet,
				refreshTools: async () =>
					({ alpha: {}, beta: {} }) as unknown as ToolSet,
				shouldRefresh: () => true,
				refreshMessage: (names) =>
					`Tools refreshed. Now available: ${names.join(", ")}`,
			});

			await onStepFinish(makeStep([{ toolName: "load-skill" }]));

			const messages = [{ role: "user" as const, content: "hi" }];
			const result = prepareStep?.(makeStepOptions(messages, 1));

			expect(result).toEqual({
				messages: [
					{ role: "user", content: "hi" },
					{
						role: "user",
						content: "[system: Tools refreshed. Now available: alpha, beta]",
					},
				],
			});
		});

		it("clears the flag after firing — second call is pass-through", async () => {
			const { onStepFinish, prepareStep } = dynamicTools({
				tools: { old: {} } as unknown as ToolSet,
				refreshTools: async () => ({ fresh: {} }) as unknown as ToolSet,
				shouldRefresh: () => true,
				refreshMessage: "Updated!",
			});

			await onStepFinish(makeStep([{ toolName: "load-skill" }]));

			const messages = [{ role: "user" as const, content: "test" }];

			// First call — should include notification
			const first = prepareStep?.(makeStepOptions(messages, 1));
			expect(first?.messages).toHaveLength(2);

			// Second call — flag cleared, pass-through (undefined = no overrides)
			const second = prepareStep?.(makeStepOptions(messages, 2));
			expect(second).toBeUndefined();
		});
	});
});
