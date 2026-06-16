import type { CodeChunk, ScannedCodeFile } from "@ai-codebase-rag/shared";

const DEFAULT_LINES_PER_CHUNK = 40;
const JS_LIKE_LANGUAGES = new Set(["javascript", "typescript", "jsx", "tsx"]);

export interface ChunkCodeFilesOptions {
	repositoryId: string;
	files: ScannedCodeFile[];
	linesPerChunk?: number;
}

interface ChunkRange {
	startIndex: number;
	endIndex: number;
	chunkType: CodeChunk["chunkType"];
}

interface BalanceState {
	inBlockComment: boolean;
}

export function chunkCodeFiles(options: ChunkCodeFilesOptions): CodeChunk[] {
	const linesPerChunk = options.linesPerChunk ?? DEFAULT_LINES_PER_CHUNK;

	return options.files.flatMap((file) =>
		chunkCodeFile(options.repositoryId, file, linesPerChunk),
	);
}

function chunkCodeFile(
	repositoryId: string,
	file: ScannedCodeFile,
	linesPerChunk: number,
): CodeChunk[] {
	const lines = file.content.split(/\r\n|\r|\n/);
	const semanticRanges = findSemanticRanges(file, lines);

	if (!semanticRanges.length) {
		return chunkLineRange(
			repositoryId,
			file,
			lines,
			0,
			lines.length - 1,
			linesPerChunk,
			"file",
		);
	}

	const chunks: CodeChunk[] = [];
	let cursor = 0;

	for (const range of semanticRanges) {
		if (range.startIndex < cursor) {
			continue;
		}

		if (cursor < range.startIndex) {
			chunks.push(
				...chunkLineRange(
					repositoryId,
					file,
					lines,
					cursor,
					range.startIndex - 1,
					linesPerChunk,
					"file",
				),
			);
		}

		chunks.push(
			createChunk(
				repositoryId,
				file,
				lines,
				range.startIndex,
				range.endIndex,
				range.chunkType,
			),
		);
		cursor = range.endIndex + 1;
	}

	if (cursor < lines.length) {
		chunks.push(
			...chunkLineRange(
				repositoryId,
				file,
				lines,
				cursor,
				lines.length - 1,
				linesPerChunk,
				"file",
			),
		);
	}

	return chunks;
}

function findSemanticRanges(
	file: ScannedCodeFile,
	lines: string[],
): ChunkRange[] {
	if (file.language === "vue") {
		return buildVueComponentRange(lines);
	}

	if (!JS_LIKE_LANGUAGES.has(file.language)) {
		return [];
	}

	return buildJavaScriptRanges(file, lines);
}

function buildVueComponentRange(lines: string[]): ChunkRange[] {
	if (!lines.join("\n").trim()) {
		return [];
	}

	return [
		{
			startIndex: 0,
			endIndex: lines.length - 1,
			chunkType: "component",
		},
	];
}

function buildJavaScriptRanges(
	file: ScannedCodeFile,
	lines: string[],
): ChunkRange[] {
	const ranges: ChunkRange[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const chunkType = detectJavaScriptChunkType(file, lines[index]);

		if (!chunkType) {
			continue;
		}

		ranges.push({
			startIndex: index,
			endIndex: findDeclarationEnd(lines, index),
			chunkType,
		});
	}

	return ranges;
}

function detectJavaScriptChunkType(
	file: ScannedCodeFile,
	line: string,
): CodeChunk["chunkType"] | null {
	const trimmed = line.trim();

	if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
		return null;
	}

	if (/^(?:export\s+default\s+)?defineComponent\s*\(/.test(trimmed)) {
		return "component";
	}

	const variableMatch = trimmed.match(
		/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/,
	);
	if (variableMatch) {
		const [, name, initializer] = variableMatch;

		if (/^defineComponent\s*\(/.test(initializer)) {
			return "component";
		}

		if (
			/^(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(
				initializer,
			)
		) {
			return isLikelyJsxComponent(file.language, name)
				? "component"
				: "function";
		}
	}

	const functionMatch = trimmed.match(
		/^(?:export\s+default\s+)?(?:export\s+)?(?:async\s+)?function(?:\s+([A-Za-z_$][\w$]*))?\s*[<(]/,
	);
	if (functionMatch) {
		return isLikelyJsxComponent(file.language, functionMatch[1])
			? "component"
			: "function";
	}

	if (
		/^(?:export\s+default\s+)?(?:export\s+)?(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*/.test(
			trimmed,
		)
	) {
		return "class";
	}

	if (/^export\s+default\s+\{/.test(trimmed)) {
		return "component";
	}

	return null;
}

function isLikelyJsxComponent(language: string, name?: string) {
	return Boolean(
		name && /^[A-Z]/.test(name) && (language === "jsx" || language === "tsx"),
	);
}

function findDeclarationEnd(lines: string[], startIndex: number) {
	const state: BalanceState = { inBlockComment: false };
	let curlyDepth = 0;
	let parenDepth = 0;
	let squareDepth = 0;
	let sawOpeningToken = false;

	for (let index = startIndex; index < lines.length; index += 1) {
		const cleanLine = stripStringsAndComments(lines[index], state);

		for (const char of cleanLine) {
			if (char === "{") {
				curlyDepth += 1;
				sawOpeningToken = true;
			} else if (char === "}") {
				curlyDepth = Math.max(0, curlyDepth - 1);
			} else if (char === "(") {
				parenDepth += 1;
				sawOpeningToken = true;
			} else if (char === ")") {
				parenDepth = Math.max(0, parenDepth - 1);
			} else if (char === "[") {
				squareDepth += 1;
				sawOpeningToken = true;
			} else if (char === "]") {
				squareDepth = Math.max(0, squareDepth - 1);
			}
		}

		if (
			sawOpeningToken &&
			curlyDepth === 0 &&
			parenDepth === 0 &&
			squareDepth === 0
		) {
			return index;
		}

		if (
			!sawOpeningToken &&
			index > startIndex &&
			lines[index].trim().endsWith(";")
		) {
			return index;
		}
	}

	return lines.length - 1;
}

function stripStringsAndComments(line: string, state: BalanceState) {
	let output = "";
	let index = 0;
	let quote: '"' | "'" | "`" | null = null;
	let escaped = false;

	while (index < line.length) {
		const char = line[index];
		const nextChar = line[index + 1];

		if (state.inBlockComment) {
			if (char === "*" && nextChar === "/") {
				state.inBlockComment = false;
				index += 2;
				continue;
			}

			index += 1;
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}

			index += 1;
			continue;
		}

		if (char === "/" && nextChar === "/") {
			break;
		}

		if (char === "/" && nextChar === "*") {
			state.inBlockComment = true;
			index += 2;
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			index += 1;
			continue;
		}

		output += char;
		index += 1;
	}

	return output;
}

function chunkLineRange(
	repositoryId: string,
	file: ScannedCodeFile,
	lines: string[],
	startIndex: number,
	endIndex: number,
	linesPerChunk: number,
	chunkType: CodeChunk["chunkType"],
): CodeChunk[] {
	const chunks: CodeChunk[] = [];

	for (
		let chunkStartIndex = startIndex;
		chunkStartIndex <= endIndex;
		chunkStartIndex += linesPerChunk
	) {
		const chunkEndIndex = Math.min(
			chunkStartIndex + linesPerChunk - 1,
			endIndex,
		);
		const chunk = createChunk(
			repositoryId,
			file,
			lines,
			chunkStartIndex,
			chunkEndIndex,
			chunkType,
		);

		if (chunk.content) {
			chunks.push(chunk);
		}
	}

	return chunks;
}

function createChunk(
	repositoryId: string,
	file: ScannedCodeFile,
	lines: string[],
	startIndex: number,
	endIndex: number,
	chunkType: CodeChunk["chunkType"],
): CodeChunk {
	const startLine = startIndex + 1;
	const endLine = endIndex + 1;

	return {
		id: `${repositoryId}:${file.relativePath}:${startLine}-${endLine}`,
		repositoryId,
		filePath: file.filePath,
		relativePath: file.relativePath,
		language: file.language,
		startLine,
		endLine,
		content: lines
			.slice(startIndex, endIndex + 1)
			.join("\n")
			.trim(),
		chunkType,
	};
}
