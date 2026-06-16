export type DocumentStatus = "pending" | "indexed" | "failed";
export type RepositoryFramework = "vue" | "react" | "node" | "unknown";
export type RepositoryStatus = "pending" | "indexing" | "indexed" | "failed";

export interface KnowledgeDocument {
	id: string;
	title: string;
	source: string;
	status: DocumentStatus;
	createdAt: string;
	chunkCount: number;
}

export interface CodeRepository {
	id: string;
	name: string;
	rootPath: string;
	framework: RepositoryFramework;
	status: RepositoryStatus;
	fileCount: number;
	chunkCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface ScannedCodeFile {
	filePath: string;
	relativePath: string;
	language: string;
	content: string;
	lineCount: number;
}

export interface ScannedCodeFileSummary {
	relativePath: string;
	language: string;
	lineCount: number;
}

export type CodeChunkType = "file" | "function" | "class" | "component";

export interface CodeChunk {
	id: string;
	repositoryId: string;
	filePath: string;
	relativePath: string;
	language: string;
	startLine: number;
	endLine: number;
	content: string;
	chunkType: CodeChunkType;
}

export interface CodeChunkSummary {
	id: string;
	relativePath: string;
	language: string;
	startLine: number;
	endLine: number;
	chunkType: CodeChunkType;
}

export interface ScanRepositoryResponse {
	repositoryId: string;
	fileCount: number;
	files: ScannedCodeFileSummary[];
}

export interface ChunkRepositoryResponse {
	repositoryId: string;
	fileCount: number;
	chunkCount: number;
	chunks: CodeChunkSummary[];
}

export interface IndexRepositoryResponse {
	repositoryId: string;
	fileCount: number;
	chunkCount: number;
	status: RepositoryStatus;
}

export type IndexRepositoryProgressStage =
	| "scanning"
	| "chunking"
	| "embedding"
	| "writing"
	| "completed"
	| "failed";

export interface IndexRepositoryProgressEvent {
	repositoryId: string;
	stage: IndexRepositoryProgressStage;
	message: string;
	percent: number;
	fileCount: number;
	chunkCount: number;
	processedChunks: number;
	totalChunks: number;
	batchIndex: number;
	batchCount: number;
	status?: RepositoryStatus;
}

export interface SearchCodeRequest {
	query: string;
	limit?: number;
}

export interface SearchCodeResult {
	chunkId: string;
	relativePath: string;
	language: string;
	startLine: number;
	endLine: number;
	score: number;
	vectorScore: number;
	keywordScore: number;
	preview: string;
	content?: string;
}

export interface SearchCodeResponse {
	repositoryId: string;
	query: string;
	results: SearchCodeResult[];
}

export interface AskRepositoryRequest {
	question: string;
	limit?: number;
	contextMaxChars?: number;
	snippetMaxChars?: number;
	includeFullContext?: boolean;
	history?: RepositoryConversationMessage[];
}

export interface RepositoryConversationMessage {
	role: "user" | "assistant";
	content: string;
}

export interface AskRepositoryCitation {
	chunkId: string;
	relativePath: string;
	language: string;
	startLine: number;
	endLine: number;
	score: number;
}

export interface AskRepositoryResponse {
	repositoryId: string;
	question: string;
	answer: string;
	citations: AskRepositoryCitation[];
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
}

export interface ChatRequest {
	question: string;
	knowledgeBaseId?: string;
}

export interface ChatCitation {
	documentId: string;
	title: string;
	chunkId: string;
	score: number;
}

export interface ChatResponse {
	answer: string;
	citations: ChatCitation[];
}

export interface HealthResponse {
	ok: boolean;
	ollama: {
		baseUrl: string;
		chatModel: string;
		embedModel: string;
	};
	chroma: {
		host: string;
		port: number;
		collection: string;
	};
}
