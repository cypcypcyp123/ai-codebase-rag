export const ignoredDirectories = new Set([
	"node_modules",
	"dist",
	"build",
	".git",
	".vite",
	"coverage",
	".next",
	".nuxt",
	".output",
	"uploads",
]);

export const ignoredFiles = new Set([
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lockb",
]);
