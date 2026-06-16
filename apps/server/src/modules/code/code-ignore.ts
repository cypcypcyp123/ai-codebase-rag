export const ignoredDirectories = new Set([
	"node_modules",
	"dist",
	"build",
	".git",
	".vite",
	".cache",
	"docs",
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

const ignoredDirectorySegments = new Set([
	".vitepress/cache",
	".vitepress/dist",
	".vitepress/temp",
	".vitepress/.temp",
	".vitepress/.cache",
]);

export function shouldIgnoreDirectory(
	directoryName: string,
	relativePath: string,
) {
	if (ignoredDirectories.has(directoryName)) {
		return true;
	}

	const normalizedPath = normalizePath(relativePath);
	return ignoredDirectorySegments.has(normalizedPath);
}

function normalizePath(value: string) {
	return value.replace(/\\/g, "/");
}
