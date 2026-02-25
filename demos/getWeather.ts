import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { dynamicTools } from "../src/dynamic-tools";

const emptyParams = jsonSchema<Record<string, never>>({
	type: "object",
	properties: {},
});

/** Tool set A — gated behind login */
const loginTools = {
	login: tool({
		description: "Call this tool to get access to all features",
		inputSchema: emptyParams,
		execute: async () =>
			"Login successful. You now have access to all features.",
	}),
};

/** Tool set B — the "real" tools, available after login */
const featureTools = {
	getLocation: tool({
		description: "Get the user's current location",
		inputSchema: emptyParams,
		execute: async () => "Berlin",
	}),
	getWeather: tool({
		description: "Get the weather for a given location",
		inputSchema: jsonSchema<{ location: string }>({
			type: "object",
			properties: { location: { type: "string" } },
			required: ["location"],
		}),
		execute: async ({ location }) => `The weather in ${location} is cloudy.`,
	}),
};

const { tools, onStepFinish, prepareStep } = dynamicTools({
	tools: loginTools,
	refreshTools: async () => featureTools,
	shouldRefresh: (step) => step.toolCalls.some((tc) => tc.toolName === "login"),
	onRefresh: (names) =>
		console.log(`[dynamicTools] refreshed → ${names.join(", ")}`),
	refreshMessage: (names) =>
		`Your tools have been updated after login. Available tools: ${names.join(", ")}. Use them to answer the user's question.`,
});

const result = await generateText({
	model: anthropic("claude-sonnet-4-5-20250929"),
	system:
		"Always use your tools. If you only see a login tool, call it first to unlock more tools.",
	prompt: "Can you get the weather where I live?",
	tools,
	onStepFinish,
	prepareStep,
	stopWhen: stepCountIs(5),
});

console.log("\n--- Final response ---");
console.log(result.text);
console.log(`\n--- Steps: ${result.steps.length} ---`);
for (const step of result.steps) {
	for (const tc of step.toolCalls) {
		const tr = step.toolResults.find((r) => r.toolCallId === tc.toolCallId);
		const output = tr?.output ?? (tr as Record<string, unknown>)?.result;
		console.log(`  ${tc.toolName}(${JSON.stringify(tc.args)}) → ${output}`);
	}
}
