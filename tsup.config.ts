import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	target: "node20",
	outDir: "dist",
	clean: true,
	sourcemap: false,
	dts: true,
	splitting: false,
	bundle: true,
	external: ["ai"],
});
