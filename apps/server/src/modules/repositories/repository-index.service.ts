import type {
	AskRepositoryResponse,
	ChunkRepositoryResponse,
	CodeChunk,
	CodeChunkSummary,
	IndexRepositoryProgressEvent,
	IndexRepositoryResponse,
	RepositoryConversationMessage,
	ScanRepositoryResponse,
	SearchCodeResponse,
} from "@ai-codebase-rag/shared";
import { OllamaClient } from "../../integrations/ollama/ollama.client.js";
import { config } from "../../shared/config.js";
import { chunkCodeFiles } from "../code/code-chunker.js";
import { scanCodeRepository } from "../code/code-scanner.js";
import { vectorStore } from "../vector/vector-store.instance.js";
import { repositoryService } from "./repository-store.js";

interface SearchRepositoryOptions {
	includeContent?: boolean;
}

interface AskRepositoryOptions {
	contextMaxChars: number;
	snippetMaxChars: number;
	includeFullContext: boolean;
	history: RepositoryConversationMessage[];
}

type IndexProgressHandler = (event: IndexRepositoryProgressEvent) => void;

const DEFAULT_ASK_OPTIONS: AskRepositoryOptions = {
	contextMaxChars: 12000,
	snippetMaxChars: 6000,
	includeFullContext: false,
	history: [],
};

export class RepositoryIndexService {
	constructor(private readonly ollama = new OllamaClient()) {}

	async scanRepository(repositoryId: string): Promise<ScanRepositoryResponse> {
		const repository = repositoryService.getRepository(repositoryId);
		const files = await scanCodeRepository({ rootPath: repository.rootPath });

		repositoryService.updateIndexState(repository.id, {
			fileCount: files.length,
		});

		return {
			repositoryId: repository.id,
			fileCount: files.length,
			files: files.map((file) => ({
				relativePath: file.relativePath,
				language: file.language,
				lineCount: file.lineCount,
			})),
		};
	}

	async previewChunks(repositoryId: string): Promise<ChunkRepositoryResponse> {
		const { repository, chunks, fileCount } =
			await this.buildChunks(repositoryId);

		repositoryService.updateIndexState(repository.id, {
			fileCount,
			chunkCount: chunks.length,
		});

		return {
			repositoryId: repository.id,
			fileCount,
			chunkCount: chunks.length,
			chunks: chunks.map(toChunkSummary),
		};
	}

	async indexRepository(
		repositoryId: string,
	): Promise<IndexRepositoryResponse> {
		return this.indexRepositoryWithProgress(repositoryId);
	}

	async indexRepositoryWithProgress(
		repositoryId: string,
		onProgress?: IndexProgressHandler,
	): Promise<IndexRepositoryResponse> {
		onProgress?.(createIndexProgressEvent(repositoryId, "scanning", {
			message: "正在扫描源码文件",
			percent: 5,
		}));

		const { repository, chunks, fileCount } =
			await this.buildChunks(repositoryId);
		const batchCount = Math.ceil(chunks.length / config.ollama.embedBatchSize);

		onProgress?.(
			createIndexProgressEvent(repository.id, "chunking", {
				message: `已生成 ${chunks.length} 个代码分片`,
				percent: chunks.length ? 12 : 100,
				fileCount,
				chunkCount: chunks.length,
				totalChunks: chunks.length,
				batchCount,
			}),
		);

		repositoryService.updateIndexState(repository.id, {
			fileCount,
			chunkCount: chunks.length,
			status: "indexing",
		});

		if (!chunks.length) {
			const updatedRepository = repositoryService.updateIndexState(
				repository.id,
				{
					fileCount,
					chunkCount: 0,
					status: "indexed",
				},
			);

			onProgress?.(
				createIndexProgressEvent(repository.id, "completed", {
					message: "索引完成",
					percent: 100,
					fileCount,
					chunkCount: 0,
					status: updatedRepository.status,
				}),
			);

			return {
				repositoryId: updatedRepository.id,
				fileCount: updatedRepository.fileCount,
				chunkCount: updatedRepository.chunkCount,
				status: updatedRepository.status,
			};
		}

		let batchIndex = 0;
		let processedChunks = 0;

		for (const chunkBatch of splitIntoBatches(
			chunks,
			config.ollama.embedBatchSize,
		)) {
			batchIndex += 1;
			onProgress?.(
				createIndexProgressEvent(repository.id, "embedding", {
					message: `正在生成向量 ${batchIndex}/${batchCount}`,
					percent: calculateIndexPercent(batchIndex - 1, batchCount, 12, 88),
					fileCount,
					chunkCount: chunks.length,
					processedChunks,
					totalChunks: chunks.length,
					batchIndex,
					batchCount,
				}),
			);

			const embeddings = await this.ollama.embed(
				chunkBatch.map((chunk) => chunk.content),
			);

			onProgress?.(
				createIndexProgressEvent(repository.id, "writing", {
					message: `正在写入 ChromaDB ${batchIndex}/${batchCount}`,
					percent: calculateIndexPercent(batchIndex - 0.25, batchCount, 12, 88),
					fileCount,
					chunkCount: chunks.length,
					processedChunks,
					totalChunks: chunks.length,
					batchIndex,
					batchCount,
				}),
			);

			await vectorStore.upsert(
				toVectorChunks(repository.id, chunkBatch, embeddings),
			);
			processedChunks += chunkBatch.length;

			onProgress?.(
				createIndexProgressEvent(repository.id, "writing", {
					message: `已写入 ${processedChunks}/${chunks.length} 个分片`,
					percent: calculateIndexPercent(batchIndex, batchCount, 12, 88),
					fileCount,
					chunkCount: chunks.length,
					processedChunks,
					totalChunks: chunks.length,
					batchIndex,
					batchCount,
				}),
			);
		}

		const updatedRepository = repositoryService.updateIndexState(
			repository.id,
			{
				fileCount,
				chunkCount: chunks.length,
				status: "indexed",
			},
		);

		onProgress?.(
			createIndexProgressEvent(repository.id, "completed", {
				message: "索引完成",
				percent: 100,
				fileCount,
				chunkCount: chunks.length,
				processedChunks: chunks.length,
				totalChunks: chunks.length,
				batchIndex: batchCount,
				batchCount,
				status: updatedRepository.status,
			}),
		);

		return {
			repositoryId: updatedRepository.id,
			fileCount: updatedRepository.fileCount,
			chunkCount: updatedRepository.chunkCount,
			status: updatedRepository.status,
		};
	}

	async searchRepository(
		repositoryId: string,
		query: string,
		limit: number,
		options: SearchRepositoryOptions = {},
	): Promise<SearchCodeResponse> {
		const repository = repositoryService.getRepository(repositoryId);
		const [embedding] = await this.ollama.embed(query);
		const vectorResults = await vectorStore.search(
			embedding,
			Math.max(limit * 3, 10),
			{
				filter: {
					repositoryId: repository.id,
				},
			},
		);
		const localChunks = chunkCodeFiles({
			repositoryId: repository.id,
			files: await scanCodeRepository({ rootPath: repository.rootPath }),
		});
		const rerankedResults = rerankSearchResults(
			query,
			vectorResults,
			localChunks,
		).slice(0, limit);

		return {
			repositoryId: repository.id,
			query,
			results: rerankedResults.map((result) => ({
				chunkId: result.chunk.id,
				relativePath: result.chunk.relativePath,
				language: result.chunk.language,
				startLine: result.chunk.startLine,
				endLine: result.chunk.endLine,
				score: result.score,
				vectorScore: result.vectorScore,
				keywordScore: result.keywordScore,
				preview: buildPreview(result.chunk.content),
				content: options.includeContent ? result.chunk.content : undefined,
			})),
		};
	}

	async askRepository(
		repositoryId: string,
		question: string,
		limit: number,
		options: Partial<AskRepositoryOptions> = {},
	): Promise<AskRepositoryResponse> {
		const askOptions = normalizeAskOptions(options);
		const searchResponse = await this.searchRepository(
			repositoryId,
			question,
			limit,
			{
				includeContent: true,
			},
		);
		const prompt = buildCodeQuestionPrompt(
			question,
			searchResponse.results,
			askOptions,
		);
		const answer = await this.ollama.generate(prompt);

		return {
			repositoryId,
			question,
			answer,
			citations: searchResponse.results.map((result) => ({
				chunkId: result.chunkId,
				relativePath: result.relativePath,
				language: result.language,
				startLine: result.startLine,
				endLine: result.endLine,
				score: result.score,
			})),
		};
	}

	async prepareAskContext(
		repositoryId: string,
		question: string,
		limit: number,
		options: Partial<AskRepositoryOptions> = {},
	) {
		const askOptions = normalizeAskOptions(options);
		const searchResponse = await this.searchRepository(
			repositoryId,
			question,
			limit,
			{
				includeContent: true,
			},
		);

		return {
			prompt: buildCodeQuestionPrompt(
				question,
				searchResponse.results,
				askOptions,
			),
			citations: searchResponse.results.map((result) => ({
				chunkId: result.chunkId,
				relativePath: result.relativePath,
				language: result.language,
				startLine: result.startLine,
				endLine: result.endLine,
				score: result.score,
			})),
		};
	}

	streamAnswer(prompt: string) {
		return this.ollama.generateStream(prompt);
	}

	generateAnswer(prompt: string) {
		return this.ollama.generate(prompt);
	}

	private async buildChunks(repositoryId: string) {
		const repository = repositoryService.getRepository(repositoryId);
		const files = await scanCodeRepository({ rootPath: repository.rootPath });
		const chunks = chunkCodeFiles({
			repositoryId: repository.id,
			files,
		});

		return {
			repository,
			files,
			fileCount: files.length,
			chunks,
		};
	}
}

function splitIntoBatches<T>(items: T[], batchSize: number) {
	const batches: T[][] = [];

	for (let index = 0; index < items.length; index += batchSize) {
		batches.push(items.slice(index, index + batchSize));
	}

	return batches;
}

function createIndexProgressEvent(
	repositoryId: string,
	stage: IndexRepositoryProgressEvent["stage"],
	partial: Partial<IndexRepositoryProgressEvent> = {},
): IndexRepositoryProgressEvent {
	return {
		repositoryId,
		stage,
		message: partial.message ?? stage,
		percent: partial.percent ?? 0,
		fileCount: partial.fileCount ?? 0,
		chunkCount: partial.chunkCount ?? 0,
		processedChunks: partial.processedChunks ?? 0,
		totalChunks: partial.totalChunks ?? 0,
		batchIndex: partial.batchIndex ?? 0,
		batchCount: partial.batchCount ?? 0,
		status: partial.status,
	};
}

function calculateIndexPercent(
	currentBatch: number,
	batchCount: number,
	startPercent: number,
	endPercent: number,
) {
	if (!batchCount) {
		return endPercent;
	}

	const boundedRatio = Math.min(Math.max(currentBatch / batchCount, 0), 1);
	return Math.round(startPercent + (endPercent - startPercent) * boundedRatio);
}

function toVectorChunks(
	repositoryId: string,
	chunks: CodeChunk[],
	embeddings: number[][],
) {
	return chunks.map((chunk, index) => ({
		id: chunk.id,
		documentId: repositoryId,
		title: chunk.relativePath,
		content: chunk.content,
		embedding: embeddings[index] ?? [],
		metadata: {
			repositoryId: chunk.repositoryId,
			filePath: chunk.relativePath,
			language: chunk.language,
			startLine: chunk.startLine,
			endLine: chunk.endLine,
			chunkType: chunk.chunkType,
		},
	}));
}

interface RerankedSearchResult {
	chunk: CodeChunk;
	score: number;
	vectorScore: number;
	keywordScore: number;
}

function buildPreview(content: string) {
	return content.replace(/\s+/g, " ").slice(0, 220);
}

function buildCodeQuestionPrompt(
	question: string,
	contexts: SearchCodeResponse["results"],
	options: AskRepositoryOptions,
) {
	return [
		"You are a codebase analysis assistant.",
		"Do not include chain-of-thought or hidden reasoning. Provide only the final answer.",
		"Answer only from the provided code snippets. Cite file paths and line ranges.",
		"If the snippets contain the answer, give the conclusion directly.",
		"If the snippets are insufficient, say exactly which file, method, or symbol is missing.",
		"",
		buildConversationHistory(options.history),
		"",
		buildPromptContext(contexts, options),
		"",
		`Question: ${question}`,
		"Answer:",
	].join("\n");
}

function buildConversationHistory(history: RepositoryConversationMessage[]) {
	if (!history.length) {
		return "Conversation history: none.";
	}

	return [
		"Conversation history:",
		...history.map((message) => {
			const role = message.role === "user" ? "User" : "Assistant";
			return `${role}: ${message.content.slice(0, 1200)}`;
		}),
	].join("\n");
}

function buildPromptContext(
	contexts: SearchCodeResponse["results"],
	options: AskRepositoryOptions,
) {
	if (!contexts.length) {
		return "No relevant code snippets were retrieved.";
	}

	const sections: string[] = [];
	let usedChars = 0;

	for (const [index, context] of contexts.entries()) {
		const remainingChars = Math.max(0, options.contextMaxChars - usedChars);
		const section = formatPromptContext(context, index, remainingChars, options);

		if (!section) {
			break;
		}

		sections.push(section);
		usedChars += section.length;

		if (usedChars >= options.contextMaxChars) {
			break;
		}
	}

	return sections.join("\n\n");
}

function formatPromptContext(
	context: SearchCodeResponse["results"][number],
	index: number,
	remainingChars: number,
	options: AskRepositoryOptions,
) {
	const content = context.content ?? context.preview;
	const headerBudget = 220;
	const maxContentChars = options.includeFullContext
		? Math.max(0, remainingChars - headerBudget)
		: Math.max(
				0,
				Math.min(options.snippetMaxChars, remainingChars - headerBudget),
			);
	const boundedContent =
		content.length > maxContentChars
			? `${content.slice(0, maxContentChars)}\n\n...content truncated...`
			: content;

	if (!boundedContent.trim()) {
		return "";
	}

	return [
		`Snippet ${index + 1}: ${context.relativePath}:${context.startLine}-${context.endLine}`,
		`Language: ${context.language}`,
		`Score: ${context.score.toFixed(2)}`,
		"```",
		boundedContent,
		"```",
	].join("\n");
}

function normalizeAskOptions(
	options: Partial<AskRepositoryOptions>,
): AskRepositoryOptions {
	return {
		contextMaxChars:
			options.contextMaxChars ?? DEFAULT_ASK_OPTIONS.contextMaxChars,
		snippetMaxChars:
			options.snippetMaxChars ?? DEFAULT_ASK_OPTIONS.snippetMaxChars,
		includeFullContext:
			options.includeFullContext ?? DEFAULT_ASK_OPTIONS.includeFullContext,
		history: options.history ?? DEFAULT_ASK_OPTIONS.history,
	};
}

function rerankSearchResults(
	query: string,
	vectorResults: Awaited<ReturnType<typeof vectorStore.search>>,
	localChunks: CodeChunk[],
): RerankedSearchResult[] {
	const vectorScoreById = new Map(
		vectorResults.map((result) => [result.id, result.score]),
	);
	const candidates = new Map<string, CodeChunk>();

	for (const chunk of localChunks) {
		const keywordScore = calculateKeywordScore(query, chunk);
		if (keywordScore > 0) {
			candidates.set(chunk.id, chunk);
		}
	}

	for (const result of vectorResults) {
		const localChunk = localChunks.find((chunk) => chunk.id === result.id);
		if (localChunk) {
			candidates.set(localChunk.id, localChunk);
		}
	}

	return [...candidates.values()]
		.map((chunk) => {
			const vectorScore = vectorScoreById.get(chunk.id) ?? 0;
			const keywordScore = calculateKeywordScore(query, chunk);

			return {
				chunk,
				vectorScore,
				keywordScore,
				score: vectorScore + keywordScore,
			};
		})
		.sort((left, right) => right.score - left.score);
}

function calculateKeywordScore(query: string, chunk: CodeChunk) {
	const normalizedQuery = query.toLowerCase();
	const normalizedPath = chunk.relativePath.toLowerCase();
	const normalizedContent = chunk.content.toLowerCase();
	const tokens = extractSearchTokens(normalizedQuery);
	let score = 0;

	for (const token of tokens) {
		if (normalizedPath.includes(token)) {
			score += 2;
		}

		if (normalizedContent.includes(token)) {
			score += 1;
		}
	}

	return score;
}

function extractSearchTokens(query: string) {
	const directTokens = query
		.split(/[^a-z0-9_\u4e00-\u9fa5]+/i)
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);
	const mappedTokens = new Set(directTokens);
	const synonymMap = new Map([
		["扫描器", ["scanner", "scan"]],
		["扫描", ["scanner", "scan"]],
		["代码扫描器", ["code-scanner", "scanner", "scan"]],
		["分片", ["chunker", "chunk"]],
		["索引", ["index"]],
		["仓库", ["repository", "repositories"]],
		["向量", ["vector", "embedding", "embed"]],
		["嵌入", ["embedding", "embed"]],
		["模型", ["ollama"]],
		["接口", ["routes", "route"]],
		[
			"登录",
			[
				"login",
				"signin",
				"sign-in",
				"auth",
				"authentication",
				"token",
				"session",
			],
		],
		["权限", ["permission", "guard", "access", "role", "auth"]],
		["用户", ["user", "account", "profile"]],
	]);

	for (const [keyword, synonyms] of synonymMap) {
		if (query.includes(keyword)) {
			for (const synonym of synonyms) {
				mappedTokens.add(synonym);
			}
		}
	}

	return [...mappedTokens].filter((token) => token.length >= 2);
}

function toChunkSummary(chunk: CodeChunk): CodeChunkSummary {
	return {
		id: chunk.id,
		relativePath: chunk.relativePath,
		language: chunk.language,
		startLine: chunk.startLine,
		endLine: chunk.endLine,
		chunkType: chunk.chunkType,
	};
}
