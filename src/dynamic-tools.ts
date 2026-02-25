import type { PrepareStepFunction, StepResult, ToolSet } from "ai";

export interface DynamicToolsConfig<TOOLS extends ToolSet> {
	/** Initial tool set */
	tools: TOOLS;
	/** Async function that returns the refreshed tool set */
	refreshTools: () => Promise<ToolSet>;
	/** Predicate: should we refresh after this step? */
	shouldRefresh: (step: StepResult<TOOLS>) => boolean;
	/** Optional callback invoked after tools are refreshed, with the new tool names */
	onRefresh?: (toolNames: string[]) => void;
	/** Message to inject after a tool refresh. Receives new tool names when a function. */
	refreshMessage?: string | ((toolNames: string[]) => string);
}

export interface DynamicToolsResult<TOOLS extends ToolSet> {
	/** Mutable tools reference — pass to generateText/streamText */
	tools: TOOLS;
	/** onStepFinish callback — pass to generateText/streamText */
	onStepFinish: (step: StepResult<TOOLS>) => Promise<void>;
	/** Pass to generateText/streamText to notify the LLM of tool changes. Only present when refreshMessage is configured. */
	prepareStep?: PrepareStepFunction<TOOLS>;
}

/**
 * Creates a mutable tools object that refreshes between generateText steps.
 *
 * generateText/streamText re-reads its `tools` closure reference on each step
 * iteration, so mutating the object in-place (clear + assign) makes new tools
 * visible to the next LLM call without restarting the loop.
 *
 * @example
 * ```ts
 * const { tools, onStepFinish } = dynamicTools({
 *   tools: initialTools,
 *   refreshTools: () => fetchLatestTools(),
 *   shouldRefresh: (step) => step.toolCalls.some(tc => tc.toolName === "load-skill"),
 *   onRefresh: (names) => console.log(`Refreshed: ${names.join(", ")}`),
 * });
 *
 * const result = await generateText({ model, tools, onStepFinish, ... });
 * ```
 */
export const dynamicTools = <TOOLS extends ToolSet>(
	config: DynamicToolsConfig<TOOLS>,
): DynamicToolsResult<TOOLS> => {
	const tools = { ...config.tools } as TOOLS;
	let pendingRefreshMessage: string | null = null;

	const onStepFinish = async (step: StepResult<TOOLS>) => {
		if (!config.shouldRefresh(step)) return;

		const freshTools = await config.refreshTools();

		// Mutate in-place so the generateText closure sees the changes
		for (const key of Object.keys(tools)) {
			delete (tools as Record<string, unknown>)[key];
		}
		Object.assign(tools, freshTools);

		const toolNames = Object.keys(tools);
		config.onRefresh?.(toolNames);

		if (config.refreshMessage) {
			pendingRefreshMessage =
				typeof config.refreshMessage === "function"
					? config.refreshMessage(toolNames)
					: config.refreshMessage;
		}
	};

	const prepareStep: PrepareStepFunction<TOOLS> | undefined =
		config.refreshMessage
			? ({ messages }) => {
					if (!pendingRefreshMessage) return undefined;

					const notification = pendingRefreshMessage;
					pendingRefreshMessage = null;

					return {
						messages: [
							...messages,
							{ role: "user" as const, content: `[system: ${notification}]` },
						],
					};
				}
			: undefined;

	return { tools, onStepFinish, ...(prepareStep ? { prepareStep } : {}) };
};
