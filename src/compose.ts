import type { StepResult, ToolSet } from "ai";

/**
 * Composes multiple `onStepFinish` handlers into a single handler that
 * runs them sequentially.
 *
 * Useful when you need both `dynamicTools`'s `onStepFinish` and your own
 * step-tracking logic.
 *
 * @example
 * ```ts
 * const { tools, onStepFinish: refreshHandler } = dynamicTools({ ... });
 *
 * const onStepFinish = composeStepHandlers(
 *   refreshHandler,
 *   (step) => console.log(`Step used ${step.toolCalls.length} tools`),
 * );
 *
 * await generateText({ model, tools, onStepFinish });
 * ```
 */
export const composeStepHandlers =
	<TOOLS extends ToolSet>(
		...handlers: Array<(step: StepResult<TOOLS>) => Promise<void> | void>
	) =>
	async (step: StepResult<TOOLS>): Promise<void> => {
		for (const handler of handlers) {
			await handler(step);
		}
	};
