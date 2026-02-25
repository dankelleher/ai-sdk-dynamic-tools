# ai-sdk-dynamic-tools

Mid-conversation tool refreshing for Vercel AI SDK's `generateText` and `streamText`.

## Why

The AI SDK re-reads its `tools` reference on each step. This package exploits that by mutating the tools object in-place via `onStepFinish`, so new tools become available to the LLM without restarting the generation loop.

This is useful when a tool call (e.g. "load-skill") adds new tools that should be available in subsequent steps of the same `generateText` call.

## Install

```bash
npm install ai-sdk-dynamic-tools ai
```

`ai` is a peer dependency (`^6.0.0`).

## Usage

```ts
import { generateText } from "ai";
import { dynamicTools } from "ai-sdk-dynamic-tools";

const { tools, onStepFinish, prepareStep } = dynamicTools({
  tools: initialTools,
  refreshTools: () => fetchLatestTools(),
  shouldRefresh: (step) =>
    step.toolCalls.some((tc) => tc.toolName === "load-skill"),
  onRefresh: (names) =>
    console.log(`Now ${names.length} tools available`),
  refreshMessage: (names) =>
    `Tools updated. Now available: ${names.join(", ")}`,
});

const result = await generateText({ model, tools, onStepFinish, prepareStep });
```

### Composing step handlers

If you have multiple `onStepFinish` callbacks, use `composeStepHandlers` to chain them sequentially:

```ts
import { dynamicTools, composeStepHandlers } from "ai-sdk-dynamic-tools";

const { tools, onStepFinish: refreshHandler } = dynamicTools({ ... });

const onStepFinish = composeStepHandlers(
  refreshHandler,
  (step) => console.log(`Step used ${step.toolCalls.length} tools`),
);

await generateText({ model, tools, onStepFinish });
```

## API

### `dynamicTools(config)`

Returns `{ tools, onStepFinish, prepareStep? }` — pass all directly to `generateText` or `streamText`.

| Config | Type | Description |
|--------|------|-------------|
| `tools` | `ToolSet` | Initial tool set |
| `refreshTools` | `() => Promise<ToolSet>` | Returns the updated tool set |
| `shouldRefresh` | `(step: StepResult) => boolean` | Predicate: refresh after this step? |
| `onRefresh` | `(toolNames: string[]) => void` | Optional callback after refresh |
| `refreshMessage` | `string \| ((toolNames: string[]) => string)` | Optional message injected into the LLM context after a refresh via `prepareStep` |

### `composeStepHandlers(...handlers)`

Chains multiple `onStepFinish` handlers into one. Handlers run sequentially; errors short-circuit.

## License

MIT
