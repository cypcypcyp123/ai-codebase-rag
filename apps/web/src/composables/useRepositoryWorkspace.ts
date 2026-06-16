import type {
	AskRepositoryResponse,
	AskRepositoryCitation,
	ChunkRepositoryResponse,
	CodeRepository,
	ScanRepositoryResponse,
	SearchCodeResponse,
} from "@ai-codebase-rag/shared";
import { computed, onMounted, reactive, readonly, shallowRef } from "vue";
import {
	askRepository,
	askRepositoryStream,
	createRepository,
	indexRepository,
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
	const streamingAnswer = shallowRef("");
	const streamingCitations = shallowRef<AskRepositoryCitation[]>([]);
	const uploadProgress = shallowRef(0);
	const uploadStage = shallowRef("");
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
		query: "代码扫描器在哪里实现",
		limit: 10,
	});
	const askForm = reactive({
		question: "这个项目的代码扫描器在哪里实现？",
		limit: 10,
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

		try {
			await indexRepository(selectedRepositoryId.value);
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
		streamingAnswer.value = "";
		streamingCitations.value = [];
		askResult.value = null;

		try {
			await askRepositoryStream(
				selectedRepositoryId.value,
				{
					question: askForm.question,
					limit: askForm.limit,
				},
				{
					onCitations: (citations) => {
						streamingCitations.value = citations;
					},
					onDelta: (delta) => {
						streamingAnswer.value += delta;
					},
					onError: (message) => {
						errorMessage.value = message;
					},
					onDone: () => {
						askResult.value = {
							repositoryId: selectedRepositoryId.value,
							question: askForm.question,
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
		streamingAnswer: readonly(streamingAnswer),
		streamingCitations: readonly(streamingCitations),
		uploadProgress: readonly(uploadProgress),
		uploadStage: readonly(uploadStage),
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
		selectRepository,
	};
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : "请求失败";
}
