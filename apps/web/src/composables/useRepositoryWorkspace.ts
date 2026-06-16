import type {
	AskRepositoryResponse,
	AskRepositoryCitation,
	ChunkRepositoryResponse,
	CodeRepository,
	IndexRepositoryProgressEvent,
	RepositoryConversationMessage,
	ScanRepositoryResponse,
	SearchCodeResponse,
} from "@ai-codebase-rag/shared";
import { computed, onMounted, reactive, readonly, shallowRef } from "vue";
import {
	askRepository,
	askRepositoryStream,
	createRepository,
	indexRepositoryStream,
	listRepositories,
	previewRepositoryChunks,
	scanRepository,
	searchRepository,
	uploadRepositoryZip,
} from "@/api/knowledge";

export function useRepositoryWorkspace() {
	const repositories = shallowRef<CodeRepository[]>([]);
	const selectedRepositoryId = shallowRef("");
	const scanResult = shallowRef<ScanRepositoryResponse | null>(null);
	const chunkResult = shallowRef<ChunkRepositoryResponse | null>(null);
	const searchResult = shallowRef<SearchCodeResponse | null>(null);
	const askResult = shallowRef<AskRepositoryResponse | null>(null);
	const conversationMessages = shallowRef<RepositoryConversationMessage[]>([]);
	const streamingAnswer = shallowRef("");
	const streamingCitations = shallowRef<AskRepositoryCitation[]>([]);
	const uploadProgress = shallowRef(0);
	const uploadStage = shallowRef("");
	const indexProgress = shallowRef<IndexRepositoryProgressEvent | null>(null);
	const errorMessage = shallowRef("");
	const loading = reactive({
		repositories: false,
		create: false,
		upload: false,
		scan: false,
		chunks: false,
		index: false,
		search: false,
		ask: false,
	});
	const repositoryForm = reactive({
		name: "ai-codebase-rag",
		rootPath: "E:\\demo\\ai-codebase-rag",
	});
	const searchForm = reactive({
		query: "",
		limit: 10,
	});
	const askForm = reactive({
		question: "",
		limit: 10,
		contextMaxChars: 12000,
		snippetMaxChars: 6000,
		includeFullContext: false,
	});

	const selectedRepository = computed(
		() =>
			repositories.value.find(
				(repository) => repository.id === selectedRepositoryId.value,
			) ?? null,
	);
	const indexedCount = computed(
		() =>
			repositories.value.filter((repository) => repository.status === "indexed")
				.length,
	);

	async function refreshRepositories() {
		loading.repositories = true;
		errorMessage.value = "";

		try {
			repositories.value = await listRepositories();
			if (!selectedRepositoryId.value && repositories.value.length) {
				selectedRepositoryId.value = repositories.value[0].id;
			}
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.repositories = false;
		}
	}

	async function submitRepository() {
		loading.create = true;
		errorMessage.value = "";

		try {
			const repository = await createRepository({
				name: repositoryForm.name,
				rootPath: repositoryForm.rootPath,
			});
			repositories.value = [repository, ...repositories.value];
			selectedRepositoryId.value = repository.id;
			scanResult.value = null;
			chunkResult.value = null;
			searchResult.value = null;
			askResult.value = null;
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.create = false;
		}
	}

	async function uploadZip(file: File) {
		loading.upload = true;
		uploadProgress.value = 0;
		uploadStage.value = "上传中";
		errorMessage.value = "";

		try {
			const repository = await uploadRepositoryZip(
				file,
				file.name.replace(/\.zip$/i, ""),
				{
					onProgress: (percent) => {
						uploadProgress.value = percent;
						if (percent >= 100) {
							uploadStage.value = "正在解压登记";
						}
					},
				},
			);
			repositories.value = [repository, ...repositories.value];
			selectedRepositoryId.value = repository.id;
			scanResult.value = null;
			chunkResult.value = null;
			searchResult.value = null;
			askResult.value = null;
			uploadStage.value = "上传完成";
		} catch (error) {
			errorMessage.value = formatError(error);
			throw error;
		} finally {
			loading.upload = false;
			uploadProgress.value = 0;
			uploadStage.value = "";
		}
	}

	async function runScan() {
		if (!selectedRepositoryId.value) {
			return;
		}

		loading.scan = true;
		errorMessage.value = "";

		try {
			scanResult.value = await scanRepository(selectedRepositoryId.value);
			await refreshRepositories();
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.scan = false;
		}
	}

	async function runChunksPreview() {
		if (!selectedRepositoryId.value) {
			return;
		}

		loading.chunks = true;
		errorMessage.value = "";

		try {
			chunkResult.value = await previewRepositoryChunks(
				selectedRepositoryId.value,
			);
			await refreshRepositories();
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.chunks = false;
		}
	}

	async function runIndex() {
		if (!selectedRepositoryId.value) {
			return;
		}

		loading.index = true;
		errorMessage.value = "";
		indexProgress.value = {
			repositoryId: selectedRepositoryId.value,
			stage: "scanning",
			message: "正在准备写入索引",
			percent: 0,
			fileCount: selectedRepository.value?.fileCount ?? 0,
			chunkCount: selectedRepository.value?.chunkCount ?? 0,
			processedChunks: 0,
			totalChunks: selectedRepository.value?.chunkCount ?? 0,
			batchIndex: 0,
			batchCount: 0,
		};

		try {
			await indexRepositoryStream(selectedRepositoryId.value, {
				onProgress: (event) => {
					indexProgress.value = event;
				},
				onError: (message) => {
					errorMessage.value = message;
					indexProgress.value = {
						repositoryId: selectedRepositoryId.value,
						stage: "failed",
						message,
						percent: 100,
						fileCount: indexProgress.value?.fileCount ?? 0,
						chunkCount: indexProgress.value?.chunkCount ?? 0,
						processedChunks: indexProgress.value?.processedChunks ?? 0,
						totalChunks: indexProgress.value?.totalChunks ?? 0,
						batchIndex: indexProgress.value?.batchIndex ?? 0,
						batchCount: indexProgress.value?.batchCount ?? 0,
						status: "failed",
					};
				},
				onDone: (result) => {
					indexProgress.value = {
						repositoryId: result.repositoryId,
						stage: "completed",
						message: "索引完成",
						percent: 100,
						fileCount: result.fileCount,
						chunkCount: result.chunkCount,
						processedChunks: result.chunkCount,
						totalChunks: result.chunkCount,
						batchIndex: indexProgress.value?.batchCount ?? 0,
						batchCount: indexProgress.value?.batchCount ?? 0,
						status: result.status,
					};
				},
			});
			await refreshRepositories();
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.index = false;
		}
	}

	async function runSearch() {
		if (!selectedRepositoryId.value || !searchForm.query.trim()) {
			return;
		}

		loading.search = true;
		errorMessage.value = "";

		try {
			searchResult.value = await searchRepository(selectedRepositoryId.value, {
				query: searchForm.query,
				limit: searchForm.limit,
			});
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.search = false;
		}
	}

	async function runAsk() {
		if (!selectedRepositoryId.value || !askForm.question.trim()) {
			return;
		}

		loading.ask = true;
		errorMessage.value = "";

		try {
			askResult.value = await askRepository(selectedRepositoryId.value, {
				question: askForm.question,
				limit: askForm.limit,
				contextMaxChars: askForm.contextMaxChars,
				snippetMaxChars: askForm.snippetMaxChars,
				includeFullContext: askForm.includeFullContext,
				history: conversationMessages.value.slice(-8),
			});
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.ask = false;
		}
	}

	async function runAskStream() {
		if (!selectedRepositoryId.value || !askForm.question.trim()) {
			return;
		}

		loading.ask = true;
		errorMessage.value = "";
		const question = askForm.question.trim();
		const history = conversationMessages.value.slice(-8);
		const assistantMessage: RepositoryConversationMessage = {
			role: "assistant",
			content: "",
		};
		conversationMessages.value = [
			...conversationMessages.value,
			{ role: "user", content: question },
			assistantMessage,
		];
		askForm.question = "";
		streamingAnswer.value = "";
		streamingCitations.value = [];
		askResult.value = null;

		try {
			await askRepositoryStream(
				selectedRepositoryId.value,
				{
					question,
					limit: askForm.limit,
					contextMaxChars: askForm.contextMaxChars,
					snippetMaxChars: askForm.snippetMaxChars,
					includeFullContext: askForm.includeFullContext,
					history,
				},
				{
					onCitations: (citations) => {
						streamingCitations.value = citations;
					},
					onDelta: (delta) => {
						streamingAnswer.value += delta;
						assistantMessage.content += delta;
						conversationMessages.value = [...conversationMessages.value];
					},
					onError: (message) => {
						errorMessage.value = message;
						assistantMessage.content = message;
						conversationMessages.value = [...conversationMessages.value];
					},
					onDone: () => {
						askResult.value = {
							repositoryId: selectedRepositoryId.value,
							question,
							answer: streamingAnswer.value,
							citations: streamingCitations.value,
						};
					},
				},
			);
		} catch (error) {
			errorMessage.value = formatError(error);
		} finally {
			loading.ask = false;
		}
	}

	function selectRepository(repository: CodeRepository) {
		selectedRepositoryId.value = repository.id;
		scanResult.value = null;
		chunkResult.value = null;
		searchResult.value = null;
		askResult.value = null;
		streamingAnswer.value = "";
		streamingCitations.value = [];
		conversationMessages.value = [];
		indexProgress.value = null;
	}

	function clearConversation() {
		conversationMessages.value = [];
		askResult.value = null;
		streamingAnswer.value = "";
		streamingCitations.value = [];
	}

	onMounted(refreshRepositories);

	return {
		repositories: readonly(repositories),
		selectedRepositoryId,
		selectedRepository,
		scanResult: readonly(scanResult),
		chunkResult: readonly(chunkResult),
		searchResult: readonly(searchResult),
		askResult: readonly(askResult),
		conversationMessages: readonly(conversationMessages),
		streamingAnswer: readonly(streamingAnswer),
		streamingCitations: readonly(streamingCitations),
		uploadProgress: readonly(uploadProgress),
		uploadStage: readonly(uploadStage),
		indexProgress: readonly(indexProgress),
		errorMessage: readonly(errorMessage),
		loading,
		repositoryForm,
		searchForm,
		askForm,
		indexedCount,
		refreshRepositories,
		submitRepository,
		uploadZip,
		runScan,
		runChunksPreview,
		runIndex,
		runSearch,
		runAsk,
		runAskStream,
		clearConversation,
		selectRepository,
	};
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : "请求失败";
}
