<script setup lang="ts">
import type { CodeRepository } from "@ai-codebase-rag/shared";
import {
	Aim,
	ChatDotRound,
	Check,
	Cpu,
	DataAnalysis,
	CopyDocument,
	Files,
	FolderOpened,
	Link,
	Moon,
	Refresh,
	Search,
	Setting,
	Sunny,
	Upload,
	UploadFilled,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UploadRequestOptions } from "element-plus";
import type { UploadAjaxError } from "element-plus/es/components/upload/src/ajax";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { computed, shallowRef } from "vue";
import { useKnowledgeStatus } from "@/composables/useKnowledgeStatus";
import { useRepositoryWorkspace } from "@/composables/useRepositoryWorkspace";

const { health } = useKnowledgeStatus();
const {
	repositories,
	selectedRepositoryId,
	selectedRepository,
	scanResult,
	chunkResult,
	searchResult,
	askResult,
	conversationMessages,
	streamingAnswer,
	streamingCitations,
	uploadProgress,
	uploadStage,
	indexProgress,
	errorMessage,
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
	runAskStream,
	clearConversation,
	selectRepository,
} = useRepositoryWorkspace();

const markdown = new MarkdownIt({
	breaks: true,
	linkify: true,
});
const selectedRepositoryName = computed(
	() => selectedRepository.value?.name ?? "未选择仓库",
);
const assistantMessages = computed(() =>
	conversationMessages.value.filter((message) => message.role === "assistant"),
);
const answerMarkdown = computed(
	() =>
		assistantMessages.value.at(-1)?.content || askResult.value?.answer || "",
);
const renderedConversationMessages = computed(() =>
	conversationMessages.value.map((message, index) => ({
		id: `${message.role}-${index}`,
		role: message.role,
		content: message.content,
		html:
			message.role === "assistant"
				? DOMPurify.sanitize(markdown.render(message.content || "正在生成..."))
				: "",
	})),
);
const answerCitations = computed(() =>
	streamingCitations.value.length
		? streamingCitations.value
		: (askResult.value?.citations ?? []),
);
const hasAnswerPanelContent = computed(() =>
	Boolean(
		conversationMessages.value.length ||
		loading.ask ||
		answerCitations.value.length,
	),
);
const hasIndexProgress = computed(() =>
	Boolean(
		indexProgress.value && (loading.index || indexProgress.value.percent > 0),
	),
);
const indexProgressText = computed(() => {
	if (!indexProgress.value) {
		return "";
	}

	const parts = [indexProgress.value.message];
	if (indexProgress.value.batchCount) {
		parts.push(
			`批次 ${indexProgress.value.batchIndex}/${indexProgress.value.batchCount}`,
		);
	}
	if (indexProgress.value.totalChunks) {
		parts.push(
			`分片 ${indexProgress.value.processedChunks}/${indexProgress.value.totalChunks}`,
		);
	}

	return parts.join(" · ");
});
const indexProgressStatus = computed(() => {
	if (indexProgress.value?.stage === "completed") {
		return "success";
	}

	if (indexProgress.value?.stage === "failed") {
		return "exception";
	}

	return undefined;
});
const answerCopied = shallowRef(false);
const askSettingsVisible = shallowRef(false);
const themeMode = shallowRef<"paper" | "ink">("ink");
const isInkTheme = computed(() => themeMode.value === "ink");
const shellClasses = computed(() => ({
	"knowledge-shell": true,
	"knowledge-shell--paper": themeMode.value === "paper",
	"knowledge-shell--ink": themeMode.value === "ink",
}));
const themeLabel = computed(() => (isInkTheme.value ? "浅色模式" : "深空模式"));

function toggleThemeMode() {
	themeMode.value = isInkTheme.value ? "paper" : "ink";
}

function openAskSettings() {
	askSettingsVisible.value = true;
}

function repositoryRowClassName({ row }: { row: CodeRepository }) {
	return row.id === selectedRepositoryId.value
		? "repository-row--selected"
		: "";
}

function statusType(status: CodeRepository["status"]) {
	const typeMap: Record<
		CodeRepository["status"],
		"info" | "warning" | "success" | "danger"
	> = {
		pending: "info",
		indexing: "warning",
		indexed: "success",
		failed: "danger",
	};

	return typeMap[status];
}

async function handleZipUpload(options: UploadRequestOptions) {
	try {
		await uploadZip(options.file);
		options.onSuccess({});
	} catch (error) {
		options.onError(createUploadError(error));
	}
}

function createUploadError(error: unknown): UploadAjaxError {
	const uploadError = new Error(
		error instanceof Error ? error.message : "上传失败",
	) as UploadAjaxError;
	uploadError.status = 0;
	uploadError.method = "POST";
	uploadError.url = "";

	return uploadError;
}

async function copyAnswerMarkdown() {
	if (!answerMarkdown.value || answerCopied.value) {
		return;
	}

	try {
		await navigator.clipboard.writeText(answerMarkdown.value);
		answerCopied.value = true;
		ElMessage.success("已复制回答 Markdown");
		window.setTimeout(() => {
			answerCopied.value = false;
		}, 1600);
	} catch {
		ElMessage.error("复制失败，请确认浏览器允许访问剪贴板");
	}
}
</script>

<template>
	<main :class="shellClasses">
		<section class="hero-band">
			<div class="hero-band__copy">
				<p class="hero-band__eyebrow">Neural Codebase Intelligence</p>
				<h1 class="hero-band__title">代码知识库平台</h1>
				<p class="hero-band__summary">
					连接本地仓库、ChromaDB
					向量索引和本地模型，把源码扫描、语义检索和上下文问答汇聚到一个 AI
					代码分析中枢。
				</p>
			</div>

			<div class="hero-band__tools">
				<el-button
					class="theme-toggle"
					:icon="isInkTheme ? Sunny : Moon"
					@click="toggleThemeMode"
				>
					{{ themeLabel }}
				</el-button>
				<div class="hero-band__status">
					<el-tag
						:type="health?.ok ? 'success' : 'danger'"
						size="large"
						effect="dark"
					>
						API {{ health?.ok ? "在线" : "未连接" }}
					</el-tag>
					<span class="hero-band__model">{{
						health?.ollama.chatModel ?? "qwen3.5:4b"
					}}</span>
				</div>
			</div>
		</section>

		<el-alert
			v-if="errorMessage"
			class="workspace-alert"
			:title="errorMessage"
			type="error"
			show-icon
			:closable="false"
		/>

		<section class="metric-grid">
			<el-card shadow="never" class="metric-card">
				<el-icon class="metric-card__icon"><FolderOpened /></el-icon>
				<span class="metric-card__label">仓库数量</span>
				<strong class="metric-card__value">{{ repositories.length }}</strong>
			</el-card>
			<el-card shadow="never" class="metric-card">
				<el-icon class="metric-card__icon"><DataAnalysis /></el-icon>
				<span class="metric-card__label">已索引</span>
				<strong class="metric-card__value">{{ indexedCount }}</strong>
			</el-card>
			<el-card shadow="never" class="metric-card">
				<el-icon class="metric-card__icon"><Cpu /></el-icon>
				<span class="metric-card__label">向量模型</span>
				<strong class="metric-card__value metric-card__value--text">
					{{ health?.ollama.embedModel ?? "nomic-embed-text" }}
				</strong>
			</el-card>
			<el-card shadow="never" class="metric-card">
				<el-icon class="metric-card__icon"><Link /></el-icon>
				<span class="metric-card__label">ChromaDB</span>
				<strong class="metric-card__value metric-card__value--text">
					{{ health?.chroma.host ?? "127.0.0.1" }}:{{
						health?.chroma.port ?? 8000
					}}
				</strong>
			</el-card>
		</section>

		<section class="workspace-layout">
			<el-card shadow="never" class="workspace-panel workspace-panel--form">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">登记代码仓库</h2>
							<p class="panel-header__subtitle">
								输入本地项目路径，建立后续扫描和索引入口。
							</p>
						</div>
						<el-button
							:icon="Refresh"
							:loading="loading.repositories"
							@click="refreshRepositories"
						>
							刷新
						</el-button>
					</div>
				</template>

				<el-form
					label-position="top"
					:model="repositoryForm"
					class="repository-form"
				>
					<el-form-item label="仓库名称">
						<el-input
							v-model="repositoryForm.name"
							placeholder="例如 ai-codebase-rag"
							clearable
						/>
					</el-form-item>
					<el-form-item label="本地路径">
						<el-input
							v-model="repositoryForm.rootPath"
							placeholder="例如 E:\\demo\\ai-codebase-rag"
							clearable
						/>
					</el-form-item>
					<el-button
						type="primary"
						:icon="UploadFilled"
						:loading="loading.create"
						class="repository-form__submit"
						@click="submitRepository"
					>
						创建仓库
					</el-button>
				</el-form>

				<el-divider>或上传压缩包</el-divider>

				<el-upload
					drag
					accept=".zip"
					:show-file-list="false"
					:http-request="handleZipUpload"
					:disabled="loading.upload"
				>
					<el-icon class="upload-drop__icon"><Upload /></el-icon>
					<div class="upload-drop__title">拖拽 zip 到这里，或点击上传</div>
					<template #tip>
						<div class="upload-drop__tip">
							上传后会解压到 uploads/repositories，并自动登记为代码仓库。
						</div>
					</template>
				</el-upload>
				<div v-if="loading.upload || uploadStage" class="upload-progress">
					<div class="upload-progress__head">
						<span>{{ uploadStage || "上传中" }}</span>
						<strong>{{ uploadProgress }}%</strong>
					</div>
					<el-progress
						:percentage="uploadProgress"
						:indeterminate="uploadProgress >= 100"
					/>
				</div>
			</el-card>

			<el-card shadow="never" class="workspace-panel workspace-panel--table">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">仓库列表</h2>
							<p class="panel-header__subtitle">
								选择一个仓库后执行扫描、分片、索引和搜索。
							</p>
						</div>
						<el-tag type="info">{{ selectedRepositoryName }}</el-tag>
					</div>
				</template>

				<el-table
					v-loading="loading.repositories"
					:data="repositories"
					height="286"
					highlight-current-row
					class="repository-table"
					:row-class-name="repositoryRowClassName"
					@row-click="selectRepository"
				>
					<el-table-column prop="name" label="名称" min-width="150">
						<template #default="{ row }">
							<div class="repository-name-cell">
								<span class="repository-name-cell__dot"></span>
								<span class="repository-name-cell__text">{{ row.name }}</span>
								<el-tag
									v-if="row.id === selectedRepositoryId"
									size="small"
									type="success"
									effect="dark"
								>
									当前
								</el-tag>
							</div>
						</template>
					</el-table-column>
					<el-table-column prop="framework" label="类型" width="96">
						<template #default="{ row }">
							<el-tag size="small" effect="plain">{{ row.framework }}</el-tag>
						</template>
					</el-table-column>
					<el-table-column prop="status" label="状态" width="96">
						<template #default="{ row }">
							<el-tag :type="statusType(row.status)" size="small">{{
								row.status
							}}</el-tag>
						</template>
					</el-table-column>
					<el-table-column prop="fileCount" label="文件" width="86" />
					<el-table-column prop="chunkCount" label="分片" width="86" />
				</el-table>
			</el-card>
		</section>

		<section class="workspace-layout workspace-layout--actions">
			<el-card shadow="never" class="workspace-panel">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">索引流水线</h2>
							<p class="panel-header__subtitle">
								按顺序验证扫描、分片和写入 ChromaDB。
							</p>
						</div>
					</div>
				</template>

				<el-space wrap>
					<el-button
						:disabled="!selectedRepositoryId"
						:loading="loading.scan"
						:icon="Files"
						@click="runScan"
					>
						扫描源码
					</el-button>
					<el-button
						:disabled="!selectedRepositoryId"
						:loading="loading.chunks"
						:icon="DataAnalysis"
						@click="runChunksPreview"
					>
						预览分片
					</el-button>
					<el-button
						type="primary"
						:disabled="!selectedRepositoryId"
						:loading="loading.index"
						:icon="Aim"
						@click="runIndex"
					>
						写入索引
					</el-button>
				</el-space>

				<div v-if="hasIndexProgress" class="index-progress">
					<div class="index-progress__head">
						<span>{{ indexProgressText }}</span>
						<strong>{{ indexProgress?.percent ?? 0 }}%</strong>
					</div>
					<el-progress
						:percentage="indexProgress?.percent ?? 0"
						:status="indexProgressStatus"
						:indeterminate="
							loading.index &&
							(indexProgress?.stage === 'scanning' ||
								!indexProgress?.totalChunks)
						"
					/>
				</div>

				<div class="pipeline-result">
					<el-descriptions :column="3" border>
						<el-descriptions-item label="扫描文件">
							{{ scanResult?.fileCount ?? selectedRepository?.fileCount ?? 0 }}
						</el-descriptions-item>
						<el-descriptions-item label="代码分片">
							{{
								chunkResult?.chunkCount ?? selectedRepository?.chunkCount ?? 0
							}}
						</el-descriptions-item>
						<el-descriptions-item label="索引状态">
							<el-tag
								v-if="selectedRepository"
								:type="statusType(selectedRepository.status)"
							>
								{{ selectedRepository.status }}
							</el-tag>
							<span v-else>未选择</span>
						</el-descriptions-item>
					</el-descriptions>
				</div>
			</el-card>

			<el-card shadow="never" class="workspace-panel">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">代码语义检索</h2>
							<p class="panel-header__subtitle">
								按仓库过滤 ChromaDB 结果，并结合路径关键词重排。
							</p>
						</div>
					</div>
				</template>

				<el-form :model="searchForm" class="search-form">
					<el-form-item>
						<el-input
							v-model="searchForm.query"
							placeholder="例如：代码扫描器在哪里实现"
							clearable
							@keyup.enter="runSearch"
						>
							<template #append>
								<el-button
									:icon="Search"
									:loading="loading.search"
									:disabled="!selectedRepositoryId"
									@click="runSearch"
								>
									搜索
								</el-button>
							</template>
						</el-input>
					</el-form-item>
				</el-form>

				<el-empty
					v-if="!searchResult?.results.length"
					description="暂无搜索结果"
					:image-size="96"
				/>
				<div v-else class="search-results">
					<article
						v-for="result in searchResult.results"
						:key="result.chunkId"
						class="search-result"
					>
						<div class="search-result__head">
							<strong>{{ result.relativePath }}</strong>
							<el-tag size="small">{{ result.language }}</el-tag>
						</div>
						<p class="search-result__meta">
							行 {{ result.startLine }}-{{ result.endLine }} · score
							{{ result.score.toFixed(2) }}
						</p>
						<p class="search-result__preview">{{ result.preview }}</p>
					</article>
				</div>
			</el-card>
		</section>

		<section class="qa-layout">
			<el-card shadow="never" class="workspace-panel qa-panel">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">代码问答</h2>
							<p class="panel-header__subtitle">
								基于当前仓库检索出的代码片段，让本地模型生成解释。
							</p>
						</div>
						<el-button :icon="Setting" @click="openAskSettings">
							配置
						</el-button>
					</div>
				</template>

				<div v-if="!hasAnswerPanelContent" class="conversation-empty">
					<el-empty description="暂无对话" :image-size="96" />
				</div>
				<div v-else class="answer-panel">
					<div class="answer-panel__title-row">
						<h3 class="answer-panel__title">对话</h3>
						<div class="answer-panel__actions">
							<el-tag v-if="loading.ask" type="warning">生成中</el-tag>
							<el-button
								size="small"
								:type="answerCopied ? 'success' : 'default'"
								:icon="answerCopied ? Check : CopyDocument"
								:disabled="!answerMarkdown"
								@click="copyAnswerMarkdown"
							>
								{{ answerCopied ? "已复制" : "复制" }}
							</el-button>
						</div>
					</div>
					<div class="conversation-list">
						<article
							v-for="message in renderedConversationMessages"
							:key="message.id"
							:class="[
								'conversation-message',
								`conversation-message--${message.role}`,
							]"
						>
							<div class="conversation-message__role">
								{{ message.role === "user" ? "你" : "助手" }}
							</div>
							<p
								v-if="message.role === 'user'"
								class="conversation-message__text"
							>
								{{ message.content }}
							</p>
							<div
								v-else
								class="conversation-message__content markdown-body"
								v-html="message.html"
							></div>
						</article>
					</div>
					<h3 v-if="answerCitations.length" class="answer-panel__title">
						引用代码
					</h3>
					<el-table
						v-if="answerCitations.length"
						:data="answerCitations"
						size="small"
						border
					>
						<el-table-column prop="relativePath" label="文件" min-width="220" />
						<el-table-column label="行号" width="120">
							<template #default="{ row }">
								{{ row.startLine }}-{{ row.endLine }}
							</template>
						</el-table-column>
						<el-table-column prop="language" label="语言" width="120" />
						<el-table-column label="分数" width="100">
							<template #default="{ row }">{{ row.score.toFixed(2) }}</template>
						</el-table-column>
					</el-table>
				</div>

				<el-form :model="askForm" class="ask-form">
					<el-form-item>
						<el-input
							v-model="askForm.question"
							type="textarea"
							:rows="3"
							placeholder="例如：这个项目的代码扫描器在哪里实现？"
							clearable
							@keydown.enter.exact.prevent="runAskStream"
						/>
					</el-form-item>
					<div class="ask-form__actions">
						<el-button
							type="primary"
							:icon="ChatDotRound"
							:loading="loading.ask"
							:disabled="!selectedRepositoryId"
							@click="runAskStream"
						>
							发送
						</el-button>
						<el-button
							:disabled="!conversationMessages.length || loading.ask"
							@click="clearConversation"
						>
							清空对话
						</el-button>
					</div>
				</el-form>
			</el-card>
		</section>

		<el-dialog
			v-model="askSettingsVisible"
			title="回答范围"
			width="520px"
			class="ask-settings-dialog"
		>
			<p class="ask-settings__hint">
				回答不准或提示“内容被截断”时，优先调大“最多参考代码量”。
			</p>
			<el-form label-position="top" :model="askForm" class="ask-settings-form">
				<el-form-item label="最多参考几个代码片段">
					<el-input-number
						v-model="askForm.limit"
						:min="1"
						:max="10"
						:step="1"
						controls-position="right"
					/>
					<p class="ask-settings__help">
						数值越大，模型会看更多搜索结果；太大会更慢，也可能引入无关代码。
					</p>
				</el-form-item>
				<el-form-item label="最多参考代码量">
					<el-input-number
						v-model="askForm.contextMaxChars"
						:min="2000"
						:max="50000"
						:step="1000"
						controls-position="right"
					/>
					<p class="ask-settings__help">
						控制一次提问最多塞给模型多少代码。看不全文件时调大这里。
					</p>
				</el-form-item>
				<el-form-item label="单段代码最多保留多少">
					<el-input-number
						v-model="askForm.snippetMaxChars"
						:min="500"
						:max="20000"
						:step="500"
						:disabled="askForm.includeFullContext"
						controls-position="right"
					/>
					<p class="ask-settings__help">
						限制每个命中片段的长度，避免一个大文件挤掉其他相关文件。
					</p>
				</el-form-item>
				<el-form-item label="优先看完整代码片段">
					<el-switch v-model="askForm.includeFullContext" />
					<p class="ask-settings__help">
						开启后会尽量不截断单个片段，适合查看组件 props、完整函数或类。
					</p>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button type="primary" @click="askSettingsVisible = false">
					完成
				</el-button>
			</template>
		</el-dialog>
	</main>
</template>

<style scoped>
.knowledge-shell {
	min-height: 100vh;
	padding: 28px;
	color: #17211b;
	background:
		linear-gradient(
			135deg,
			rgba(235, 242, 229, 0.88),
			rgba(247, 248, 243, 0.96)
		),
		repeating-linear-gradient(
			90deg,
			rgba(38, 68, 48, 0.06) 0 1px,
			transparent 1px 28px
		);
}

.hero-band {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24px;
	margin-bottom: 18px;
}

.hero-band__copy {
	max-width: 760px;
}

.hero-band__eyebrow {
	margin: 0 0 10px;
	color: #496858;
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0;
	text-transform: uppercase;
}

.hero-band__title {
	margin: 0;
	font-size: 38px;
	line-height: 1.12;
}

.hero-band__summary {
	margin: 14px 0 0;
	color: #52665b;
	font-size: 16px;
	line-height: 1.7;
}

.hero-band__status {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 260px;
	justify-content: flex-end;
}

.hero-band__model {
	color: #52665b;
	font-weight: 700;
}

.workspace-alert {
	margin-bottom: 16px;
}

.metric-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 14px;
	margin-bottom: 16px;
}

.metric-card {
	border-radius: 8px;
}

.metric-card :deep(.el-card__body) {
	display: grid;
	grid-template-columns: 38px 1fr;
	gap: 8px 12px;
	align-items: center;
}

.metric-card__icon {
	grid-row: span 2;
	width: 38px;
	height: 38px;
	border-radius: 8px;
	color: #1f5f46;
	background: #e4efe8;
}

.metric-card__label {
	color: #65766d;
	font-size: 13px;
}

.metric-card__value {
	overflow-wrap: anywhere;
	font-size: 26px;
	line-height: 1.1;
}

.metric-card__value--text {
	font-size: 18px;
}

.workspace-layout {
	display: grid;
	grid-template-columns: minmax(320px, 0.85fr) minmax(0, 1.35fr);
	gap: 16px;
	margin-bottom: 16px;
}

.workspace-layout--actions {
	grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.4fr);
}

.workspace-panel {
	border-radius: 8px;
}

.panel-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.panel-header__title {
	margin: 0;
	font-size: 17px;
}

.panel-header__subtitle {
	margin: 6px 0 0;
	color: #6b7b72;
	font-size: 13px;
}

.repository-form__submit {
	width: 100%;
}

.upload-drop__icon {
	color: #2d6a4f;
	font-size: 34px;
}

.upload-drop__title {
	color: #26362d;
	font-weight: 700;
}

.upload-drop__tip {
	color: #718176;
	font-size: 12px;
	margin-top: 4px;
}

.upload-progress {
	margin-top: 14px;
}

.index-progress {
	margin-top: 16px;
}

.upload-progress__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
	color: #52665b;
	font-size: 13px;
}

.index-progress__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
	color: #52665b;
	font-size: 13px;
}

.repository-table {
	width: 100%;
}

.pipeline-result {
	margin-top: 18px;
	padding: 12px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: var(--paper-soft);
}

.search-form {
	margin-bottom: 12px;
}

.search-results {
	display: grid;
	gap: 10px;
	max-height: 420px;
	overflow: auto;
	padding-right: 4px;
	scrollbar-width: thin;
}

.search-result {
	padding: 14px;
	border: 1px solid #dfe8e2;
	border-radius: 8px;
	background: #fbfcfa;
	transition:
		border-color 160ms ease,
		box-shadow 160ms ease,
		transform 160ms ease;
}

.search-result:hover {
	border-color: var(--line-strong);
	box-shadow: 0 10px 22px rgba(66, 45, 22, 0.1);
	transform: translateY(-1px);
}

.search-result__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	overflow-wrap: anywhere;
}

.search-result__meta {
	margin: 8px 0;
	color: #6b7b72;
	font-size: 13px;
}

.search-result__preview {
	margin: 0;
	color: #2d3c34;
	font-size: 13px;
	line-height: 1.7;
}

.qa-layout {
	display: grid;
	grid-template-columns: 1fr;
	margin-bottom: 16px;
}

.qa-panel :deep(.el-card__body) {
	display: flex;
	flex-direction: column;
	min-height: 520px;
}

.conversation-empty {
	display: grid;
	min-height: 300px;
	place-items: center;
	border: 1px dashed var(--line);
	border-radius: 8px;
	background:
		linear-gradient(135deg, rgba(47, 107, 80, 0.08), transparent 54%),
		var(--paper-soft);
}

.ask-form {
	margin-top: 16px;
	padding: 14px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 58%),
		var(--paper-strong);
	box-shadow: var(--inner-shadow);
}

.ask-form__actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 10px;
}

.ask-settings-form {
	display: grid;
	gap: 2px;
}

.ask-settings__hint {
	margin: -4px 0 18px;
	color: var(--muted-ink);
	font-size: 13px;
	line-height: 1.7;
}

.ask-settings__help {
	width: 100%;
	margin: 7px 0 0;
	color: var(--muted-ink);
	font-size: 12px;
	line-height: 1.6;
}

.ask-settings-form .el-input-number {
	width: 100%;
}

.answer-panel {
	flex: 1;
	padding-top: 4px;
}

.answer-panel__title {
	margin: 0 0 10px;
	font-size: 15px;
}

.answer-panel__title-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.answer-panel__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.conversation-list {
	display: grid;
	gap: 12px;
	max-height: 560px;
	margin-bottom: 18px;
	padding: 2px 6px 2px 2px;
	overflow: auto;
	scrollbar-width: thin;
}

.conversation-message {
	max-width: min(840px, 92%);
	padding: 14px 16px;
	border: 1px solid #d9e4dd;
	border-radius: 8px;
	overflow-wrap: anywhere;
	background: #fbfcfa;
	transition:
		border-color 160ms ease,
		box-shadow 160ms ease,
		transform 160ms ease;
}

.conversation-message:hover {
	border-color: var(--line-strong);
	box-shadow: 0 10px 22px rgba(66, 45, 22, 0.1);
	transform: translateY(-1px);
}

.conversation-message--user {
	justify-self: end;
	border-color: rgba(139, 31, 31, 0.28);
	background: rgba(139, 31, 31, 0.08);
}

.conversation-message--assistant {
	justify-self: start;
	box-shadow: inset 3px 0 0 #8fb99f;
}

.conversation-message__role {
	margin-bottom: 8px;
	color: #6b7b72;
	font-size: 12px;
	font-weight: 700;
}

.conversation-message__text {
	margin: 0;
	color: #26362d;
	font-size: 14px;
	line-height: 1.75;
	white-space: pre-wrap;
}

.conversation-message__content {
	color: #26362d;
	font-size: 14px;
	line-height: 1.85;
}

.answer-panel__content {
	margin: 0 0 18px;
	padding: 18px 20px;
	border: 1px solid #d9e4dd;
	border-radius: 8px;
	color: #26362d;
	font-size: 14px;
	line-height: 1.85;
	overflow-wrap: anywhere;
	background:
		linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.82),
			rgba(248, 251, 247, 0.96)
		),
		#fbfcfa;
	box-shadow: inset 3px 0 0 #8fb99f;
}

.answer-panel__placeholder {
	margin: 0 0 18px;
	padding: 16px 18px;
	border: 1px dashed #cbd9d1;
	border-radius: 8px;
	color: #6b7b72;
	font-size: 14px;
	background: #f7faf6;
}

.markdown-body :deep(*) {
	box-sizing: border-box;
}

.markdown-body :deep(p) {
	margin: 0 0 12px;
}

.markdown-body :deep(p:last-child) {
	margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
	margin: 20px 0 10px;
	color: #17211b;
	font-weight: 750;
	line-height: 1.35;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child) {
	margin-top: 0;
}

.markdown-body :deep(h1) {
	font-size: 22px;
}

.markdown-body :deep(h2) {
	padding-bottom: 7px;
	border-bottom: 1px solid #dce7df;
	font-size: 18px;
}

.markdown-body :deep(h3) {
	font-size: 16px;
}

.markdown-body :deep(h4) {
	color: #405549;
	font-size: 14px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
	margin: 10px 0 14px;
	padding-left: 24px;
}

.markdown-body :deep(li) {
	margin: 5px 0;
	padding-left: 2px;
}

.markdown-body :deep(li::marker) {
	color: #2d6a4f;
	font-weight: 700;
}

.markdown-body :deep(blockquote) {
	margin: 14px 0;
	padding: 10px 14px;
	border-left: 3px solid #d4a843;
	border-radius: 0 8px 8px 0;
	color: #4f5f56;
	background: #fff8e6;
}

.markdown-body :deep(blockquote p) {
	margin-bottom: 8px;
}

.markdown-body :deep(blockquote p:last-child) {
	margin-bottom: 0;
}

.markdown-body :deep(a) {
	color: #1f6f52;
	font-weight: 700;
	text-decoration: none;
	border-bottom: 1px solid rgba(31, 111, 82, 0.32);
}

.markdown-body :deep(a:hover) {
	color: #15563e;
	border-bottom-color: currentColor;
}

.markdown-body :deep(strong) {
	color: #17211b;
	font-weight: 750;
}

.markdown-body :deep(code) {
	padding: 2px 6px;
	border: 1px solid #d7e5dc;
	border-radius: 5px;
	color: #10543b;
	font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
	font-size: 0.92em;
	background: #edf6f0;
}

.markdown-body :deep(pre) {
	overflow: auto;
	margin: 14px 0;
	padding: 14px 16px;
	border: 1px solid #21362b;
	border-radius: 8px;
	color: #e7f4ee;
	line-height: 1.7;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34px),
		#14241c;
	box-shadow: 0 10px 24px rgba(17, 34, 25, 0.14);
}

.markdown-body :deep(pre code) {
	padding: 0;
	border: 0;
	color: inherit;
	font-size: 13px;
	background: transparent;
}

.markdown-body :deep(table) {
	display: block;
	width: 100%;
	overflow-x: auto;
	margin: 14px 0;
	border-spacing: 0;
	border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
	padding: 9px 11px;
	border: 1px solid #dbe6df;
	text-align: left;
	vertical-align: top;
}

.markdown-body :deep(th) {
	color: #26362d;
	font-weight: 750;
	background: #edf5ef;
}

.markdown-body :deep(td) {
	background: rgba(255, 255, 255, 0.62);
}

.markdown-body :deep(hr) {
	height: 1px;
	margin: 18px 0;
	border: 0;
	background: #dce7df;
}

@media (max-width: 1080px) {
	.metric-grid,
	.workspace-layout,
	.workspace-layout--actions {
		grid-template-columns: 1fr 1fr;
	}
}

@media (max-width: 760px) {
	.knowledge-shell {
		padding: 18px;
	}

	.hero-band {
		align-items: flex-start;
		flex-direction: column;
	}

	.hero-band__status {
		justify-content: flex-start;
	}

	.metric-grid,
	.workspace-layout,
	.workspace-layout--actions {
		grid-template-columns: 1fr;
	}
}

.knowledge-shell {
	--font-title: "Ma Shan Zheng", "Noto Serif SC", serif;
	--font-body: "Noto Serif SC", "Microsoft YaHei", serif;
	--page-bg: #efe1bf;
	--page-ink: #2c2419;
	--muted-ink: #6f5e45;
	--paper: rgba(255, 249, 232, 0.88);
	--paper-strong: rgba(255, 252, 239, 0.96);
	--paper-soft: rgba(247, 235, 203, 0.72);
	--line: rgba(93, 66, 36, 0.2);
	--line-strong: rgba(61, 42, 24, 0.34);
	--accent: #8b1f1f;
	--accent-2: #2f6b50;
	--gold: #b28a3d;
	--shadow: 0 18px 42px rgba(66, 45, 22, 0.12);
	--inner-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #ad514a;
	--el-color-primary-light-5: #c9887f;
	--el-color-primary-light-7: #dfb7aa;
	--el-color-primary-light-8: #ead0c2;
	--el-color-primary-light-9: #f5e8da;
	--el-color-primary-dark-2: #611412;
	--el-border-color: var(--line);
	--el-border-color-light: rgba(93, 66, 36, 0.16);
	--el-border-color-lighter: rgba(93, 66, 36, 0.1);
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: var(--muted-ink);
	--el-fill-color-blank: var(--paper-strong);
	--el-fill-color-light: rgba(250, 239, 210, 0.72);
	--el-bg-color: var(--paper-strong);
	--el-bg-color-overlay: var(--paper-strong);
	position: relative;
	isolation: isolate;
	overflow: hidden;
	padding: 30px;
	color: var(--page-ink);
	font-family: var(--font-body);
	background:
		radial-gradient(ellipse at 18% 8%, rgba(98, 74, 42, 0.12), transparent 34%),
		linear-gradient(115deg, rgba(123, 26, 26, 0.08), transparent 28%),
		repeating-linear-gradient(
			88deg,
			rgba(88, 62, 32, 0.055) 0 1px,
			transparent 1px 42px
		),
		linear-gradient(180deg, #f3e5c6 0%, var(--page-bg) 45%, #e6d2a8 100%);
	transition:
		color 220ms ease,
		background 260ms ease;
}

.knowledge-shell--ink {
	--page-bg: #12110e;
	--page-ink: #efe3c6;
	--muted-ink: #aa9b7c;
	--paper: rgba(27, 27, 23, 0.84);
	--paper-strong: rgba(34, 33, 28, 0.95);
	--paper-soft: rgba(15, 16, 14, 0.72);
	--line: rgba(211, 185, 132, 0.19);
	--line-strong: rgba(223, 195, 139, 0.34);
	--accent: #c2483c;
	--accent-2: #6fb08a;
	--gold: #d0a955;
	--shadow: 0 22px 52px rgba(0, 0, 0, 0.34);
	--inner-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #d16c5d;
	--el-color-primary-light-5: #de9382;
	--el-color-primary-light-7: #e9b9a9;
	--el-color-primary-light-8: #f0d0c3;
	--el-color-primary-light-9: rgba(194, 72, 60, 0.14);
	--el-color-primary-dark-2: #8e2e26;
	--el-border-color: var(--line);
	--el-border-color-light: rgba(211, 185, 132, 0.14);
	--el-border-color-lighter: rgba(211, 185, 132, 0.1);
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: var(--muted-ink);
	--el-fill-color-blank: var(--paper-strong);
	--el-fill-color-light: rgba(55, 51, 42, 0.78);
	--el-bg-color: var(--paper-strong);
	--el-bg-color-overlay: #27251f;
	background:
		radial-gradient(
			ellipse at 14% 8%,
			rgba(217, 194, 141, 0.14),
			transparent 28%
		),
		radial-gradient(
			ellipse at 84% 4%,
			rgba(84, 113, 92, 0.16),
			transparent 26%
		),
		linear-gradient(120deg, rgba(194, 72, 60, 0.13), transparent 26%),
		repeating-linear-gradient(
			91deg,
			rgba(232, 211, 163, 0.045) 0 1px,
			transparent 1px 44px
		),
		linear-gradient(180deg, #10100d 0%, var(--page-bg) 58%, #0b0c0a 100%);
}

.knowledge-shell::before {
	position: fixed;
	inset: 0;
	z-index: -2;
	pointer-events: none;
	content: "";
	background:
		linear-gradient(
			90deg,
			transparent 0 12%,
			rgba(75, 51, 24, 0.06) 12% 12.4%,
			transparent 12.4%
		),
		repeating-linear-gradient(
			0deg,
			rgba(255, 255, 255, 0.1) 0 1px,
			transparent 1px 5px
		);
	mix-blend-mode: multiply;
	opacity: 0.72;
}

.knowledge-shell--ink::before {
	background:
		linear-gradient(
			90deg,
			transparent 0 11%,
			rgba(210, 184, 129, 0.08) 11% 11.3%,
			transparent 11.3%
		),
		repeating-linear-gradient(
			0deg,
			rgba(244, 230, 190, 0.04) 0 1px,
			transparent 1px 6px
		);
	mix-blend-mode: screen;
	opacity: 0.54;
}

.knowledge-shell::after {
	position: fixed;
	right: -7vw;
	bottom: -13vh;
	z-index: -1;
	width: min(58vw, 760px);
	aspect-ratio: 1.25;
	pointer-events: none;
	content: "";
	background:
		radial-gradient(
			ellipse at 48% 58%,
			rgba(43, 36, 25, 0.22),
			transparent 0 35%
		),
		radial-gradient(
			ellipse at 36% 44%,
			rgba(43, 36, 25, 0.16),
			transparent 0 30%
		),
		radial-gradient(
			ellipse at 64% 30%,
			rgba(43, 36, 25, 0.1),
			transparent 0 26%
		);
	filter: blur(18px);
	opacity: 0.38;
	transform: rotate(-10deg);
}

.knowledge-shell--ink::after {
	background:
		radial-gradient(
			ellipse at 48% 58%,
			rgba(245, 229, 187, 0.18),
			transparent 0 35%
		),
		radial-gradient(
			ellipse at 36% 44%,
			rgba(111, 176, 138, 0.14),
			transparent 0 30%
		),
		radial-gradient(
			ellipse at 64% 30%,
			rgba(194, 72, 60, 0.11),
			transparent 0 26%
		);
	opacity: 0.32;
}

.hero-band {
	position: relative;
	align-items: center;
	margin-bottom: 22px;
	padding: 28px 30px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background:
		linear-gradient(100deg, var(--paper-strong), rgba(255, 255, 255, 0) 72%),
		linear-gradient(180deg, rgba(255, 255, 255, 0.34), transparent),
		var(--paper);
	box-shadow: var(--shadow), var(--inner-shadow);
	backdrop-filter: blur(8px);
}

.knowledge-shell--ink .hero-band {
	background:
		linear-gradient(100deg, rgba(37, 35, 29, 0.98), rgba(21, 21, 18, 0.64) 78%),
		linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
		var(--paper);
}

.hero-band::before {
	position: absolute;
	inset: 10px;
	pointer-events: none;
	content: "";
	border: 1px solid rgba(143, 103, 44, 0.2);
	border-radius: 6px;
}

.hero-band__copy {
	position: relative;
	max-width: 820px;
}

.hero-band__eyebrow {
	color: var(--accent);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.12em;
}

.hero-band__title {
	font-family: var(--font-title);
	font-size: clamp(42px, 5vw, 72px);
	font-weight: 400;
	letter-spacing: 0;
	text-shadow: 0 2px 0 rgba(255, 255, 255, 0.28);
}

.knowledge-shell--ink .hero-band__title {
	text-shadow: 0 0 22px rgba(208, 169, 85, 0.12);
}

.hero-band__summary {
	max-width: 760px;
	color: var(--muted-ink);
	font-size: 15px;
	line-height: 1.9;
}

.hero-band__tools {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 12px;
	min-width: 260px;
}

.hero-band__status {
	min-width: auto;
	padding: 10px 12px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--paper-soft);
}

.hero-band__model {
	color: var(--muted-ink);
	font-weight: 700;
}

.theme-toggle.el-button {
	height: 38px;
	border-color: var(--line-strong);
	color: var(--page-ink);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent),
		var(--paper-soft);
}

.theme-toggle.el-button:hover {
	border-color: var(--gold);
	color: var(--accent);
	background: var(--paper-strong);
}

.workspace-alert {
	overflow: hidden;
	border-radius: 8px;
	box-shadow: var(--shadow);
}

.metric-grid {
	gap: 16px;
	margin-bottom: 18px;
}

.metric-card,
.workspace-panel {
	overflow: hidden;
	border: 1px solid var(--line);
	border-radius: 8px;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.34), transparent 46%),
		var(--paper);
	box-shadow: var(--shadow), var(--inner-shadow);
	backdrop-filter: blur(7px);
}

.knowledge-shell--ink .metric-card,
.knowledge-shell--ink .workspace-panel {
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 50%),
		var(--paper);
}

.metric-card :deep(.el-card__body) {
	grid-template-columns: 42px 1fr;
	padding: 18px;
}

.metric-card__icon {
	width: 42px;
	height: 42px;
	border: 1px solid var(--line);
	border-radius: 8px;
	color: var(--accent);
	background:
		linear-gradient(135deg, rgba(178, 138, 61, 0.22), transparent),
		var(--paper-soft);
}

.metric-card__label,
.panel-header__subtitle,
.upload-drop__tip,
.upload-progress__head,
.search-result__meta {
	color: var(--muted-ink);
}

.metric-card__value {
	color: var(--page-ink);
	font-family: var(--font-title);
	font-size: 34px;
	font-weight: 400;
}

.metric-card__value--text {
	font-family: var(--font-body);
	font-size: 16px;
	font-weight: 700;
}

.workspace-layout {
	gap: 18px;
	margin-bottom: 18px;
}

.workspace-panel :deep(.el-card__header) {
	padding: 18px 20px;
	border-bottom: 1px solid var(--line);
	background:
		linear-gradient(90deg, rgba(139, 31, 31, 0.08), transparent 62%),
		rgba(255, 255, 255, 0.08);
}

.workspace-panel :deep(.el-card__body) {
	padding: 20px;
}

.panel-header__title {
	position: relative;
	padding-left: 14px;
	color: var(--page-ink);
	font-size: 18px;
	font-weight: 700;
}

.panel-header__title::before {
	position: absolute;
	top: 0.25em;
	bottom: 0.25em;
	left: 0;
	width: 3px;
	content: "";
	border-radius: 2px;
	background: var(--accent);
}

.repository-form__submit.el-button,
.ask-form > .el-button {
	width: 100%;
}

.ask-form__actions .el-button {
	min-width: 120px;
}

.upload-drop__icon {
	color: var(--accent-2);
	font-size: 38px;
}

.upload-drop__title {
	color: var(--page-ink);
	font-weight: 700;
}

.search-result {
	border: 1px solid var(--line);
	border-radius: 8px;
	color: var(--page-ink);
	background:
		linear-gradient(90deg, rgba(178, 138, 61, 0.1), transparent 54%),
		var(--paper-strong);
	box-shadow: var(--inner-shadow);
}

.search-result__head strong {
	color: var(--page-ink);
}

.search-result__preview {
	color: var(--page-ink);
}

.answer-panel__title {
	color: var(--page-ink);
	font-size: 16px;
}

.conversation-message {
	border-color: var(--line);
	color: var(--page-ink);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent 42%),
		var(--paper-strong);
}

.conversation-message--user {
	border-color: rgba(194, 72, 60, 0.38);
	background:
		linear-gradient(135deg, rgba(194, 72, 60, 0.14), transparent 56%),
		var(--paper-soft);
}

.conversation-message__role {
	color: var(--muted-ink);
}

.conversation-message__text,
.conversation-message__content {
	color: var(--page-ink);
}

.answer-panel__content {
	border: 1px solid var(--line);
	border-radius: 8px;
	color: var(--page-ink);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 42%),
		var(--paper-strong);
	box-shadow: inset 4px 0 0 var(--accent-2);
}

.answer-panel__placeholder {
	border: 1px dashed var(--line-strong);
	color: var(--muted-ink);
	background: var(--paper-soft);
}

.knowledge-shell :deep(.el-button) {
	border-radius: 6px;
	font-family: var(--font-body);
	font-weight: 700;
}

.knowledge-shell :deep(.el-button--primary) {
	border-color: var(--accent);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent),
		var(--accent);
	box-shadow: 0 8px 18px rgba(139, 31, 31, 0.18);
}

.knowledge-shell :deep(.el-input__wrapper),
.knowledge-shell :deep(.el-textarea__inner) {
	border-radius: 6px;
	background: var(--paper-strong);
	box-shadow: 0 0 0 1px var(--line) inset;
}

.knowledge-shell :deep(.el-input__wrapper.is-focus),
.knowledge-shell :deep(.el-textarea__inner:focus) {
	box-shadow: 0 0 0 1px var(--accent) inset;
}

.knowledge-shell :deep(.el-input-group__append) {
	border-color: var(--line);
	background: var(--paper-soft);
	box-shadow: 0 0 0 1px var(--line) inset;
}

.knowledge-shell :deep(.el-form-item__label) {
	color: var(--page-ink);
	font-weight: 700;
}

.knowledge-shell :deep(.el-divider__text) {
	color: var(--muted-ink);
	background: var(--paper);
}

.knowledge-shell :deep(.el-upload-dragger) {
	border-color: var(--line-strong);
	border-radius: 8px;
	background:
		linear-gradient(135deg, rgba(47, 107, 80, 0.1), transparent 50%),
		var(--paper-soft);
}

.knowledge-shell :deep(.el-upload-dragger:hover) {
	border-color: var(--accent-2);
}

.knowledge-shell :deep(.el-table),
.knowledge-shell :deep(.el-table__expanded-cell) {
	color: var(--page-ink);
	background: transparent;
}

.knowledge-shell :deep(.el-table th.el-table__cell) {
	color: var(--page-ink);
	background: rgba(178, 138, 61, 0.14);
}

.knowledge-shell :deep(.el-table tr),
.knowledge-shell :deep(.el-table td.el-table__cell) {
	background: transparent;
}

.knowledge-shell :deep(.el-table__row:hover > td.el-table__cell) {
	background: rgba(139, 31, 31, 0.08);
}

.knowledge-shell--ink .repository-table :deep(.el-table__body),
.knowledge-shell--ink .repository-table :deep(.el-table__row),
.knowledge-shell--ink .repository-table :deep(td.el-table__cell),
.knowledge-shell--ink .repository-table :deep(.cell) {
	color: var(--page-ink);
	background: transparent;
}

.knowledge-shell--ink .repository-table :deep(th.el-table__cell) {
	color: #f7e8bd;
	background: rgba(178, 138, 61, 0.18);
}

.knowledge-shell--ink
	.repository-table
	:deep(.el-table__row.current-row > td.el-table__cell),
.knowledge-shell--ink
	.repository-table
	:deep(.el-table__row:hover > td.el-table__cell) {
	color: #fff2ca;
	background: rgba(194, 72, 60, 0.16);
}

.knowledge-shell :deep(.el-table__inner-wrapper::before),
.knowledge-shell :deep(.el-table__border-left-patch) {
	background-color: var(--line);
}

.knowledge-shell :deep(.el-descriptions__label.el-descriptions__cell),
.knowledge-shell :deep(.el-descriptions__content.el-descriptions__cell) {
	border-color: var(--line);
	color: var(--page-ink);
	background: var(--paper-strong);
}

.knowledge-shell :deep(.el-empty__description p) {
	color: var(--muted-ink);
}

.knowledge-shell :deep(.el-progress-bar__outer) {
	background: rgba(93, 66, 36, 0.14);
}

.knowledge-shell :deep(.el-progress-bar__inner) {
	background: linear-gradient(90deg, var(--accent), var(--gold));
}

.knowledge-shell :deep(.el-tag) {
	border-radius: 6px;
	font-family: var(--font-body);
	font-weight: 700;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(strong) {
	color: var(--page-ink);
}

.markdown-body :deep(h2) {
	border-bottom-color: var(--line);
}

.markdown-body :deep(li::marker),
.markdown-body :deep(a) {
	color: var(--accent-2);
}

.markdown-body :deep(blockquote) {
	border-left-color: var(--gold);
	color: var(--page-ink);
	background: rgba(178, 138, 61, 0.13);
}

.markdown-body :deep(code) {
	border-color: var(--line);
	color: var(--accent-2);
	background: rgba(47, 107, 80, 0.11);
}

.markdown-body :deep(pre) {
	border-color: rgba(208, 169, 85, 0.32);
	color: #f4ead2;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 38px),
		#151411;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
	border-color: var(--line);
}

.markdown-body :deep(th) {
	color: var(--page-ink);
	background: rgba(178, 138, 61, 0.13);
}

.markdown-body :deep(td) {
	background: rgba(255, 255, 255, 0.06);
}

.markdown-body :deep(hr) {
	background: var(--line);
}

@media (max-width: 760px) {
	.knowledge-shell {
		padding: 16px;
	}

	.hero-band {
		padding: 22px 18px;
	}

	.hero-band__tools,
	.hero-band__status {
		align-items: flex-start;
		width: 100%;
	}

	.hero-band__status {
		flex-wrap: wrap;
	}

	.hero-band__title {
		font-size: 44px;
	}

	.qa-panel :deep(.el-card__body) {
		min-height: 440px;
	}

	.conversation-empty {
		min-height: 220px;
	}

	.conversation-message {
		max-width: 100%;
	}

	.ask-form__actions {
		flex-direction: column;
		align-items: stretch;
	}

	.ask-form__actions .el-button {
		width: 100%;
		margin-left: 0;
	}
}

/* Product-console theme override: code search/RAG systems need density and low visual noise. */
.knowledge-shell {
	--font-title:
		"Inter", "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei",
		sans-serif;
	--font-body:
		"Inter", "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei",
		sans-serif;
	--page-bg: #f6f8fb;
	--page-ink: #111827;
	--muted-ink: #667085;
	--paper: #ffffff;
	--paper-strong: #ffffff;
	--paper-soft: #f8fafc;
	--line: #e4e7ec;
	--line-strong: #cfd6e3;
	--accent: #2563eb;
	--accent-2: #059669;
	--gold: #f59e0b;
	--shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
	--inner-shadow: none;
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #5b8def;
	--el-color-primary-light-5: #93b5f7;
	--el-color-primary-light-7: #bfd2fb;
	--el-color-primary-light-8: #d7e4fd;
	--el-color-primary-light-9: #eff5ff;
	--el-color-primary-dark-2: #1d4ed8;
	--el-border-color: var(--line);
	--el-border-color-light: #eef1f5;
	--el-border-color-lighter: #f2f4f7;
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: #344054;
	--el-fill-color-blank: #ffffff;
	--el-fill-color-light: #f8fafc;
	--el-bg-color: #ffffff;
	--el-bg-color-overlay: #ffffff;
	background: var(--page-bg);
}

.knowledge-shell--ink {
	--page-bg: #0b1020;
	--page-ink: #eef2ff;
	--muted-ink: #9aa4b2;
	--paper: #111827;
	--paper-strong: #151f32;
	--paper-soft: #0f172a;
	--line: rgba(148, 163, 184, 0.22);
	--line-strong: rgba(148, 163, 184, 0.38);
	--accent: #60a5fa;
	--accent-2: #34d399;
	--gold: #fbbf24;
	--shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #7db8fb;
	--el-color-primary-light-5: #9dccfc;
	--el-color-primary-light-7: #bddffd;
	--el-color-primary-light-8: #d1e9fe;
	--el-color-primary-light-9: rgba(96, 165, 250, 0.14);
	--el-color-primary-dark-2: #3b82f6;
	--el-border-color: var(--line);
	--el-border-color-light: rgba(148, 163, 184, 0.16);
	--el-border-color-lighter: rgba(148, 163, 184, 0.1);
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: var(--muted-ink);
	--el-fill-color-blank: var(--paper-strong);
	--el-fill-color-light: var(--paper-soft);
	--el-bg-color: var(--paper-strong);
	--el-bg-color-overlay: #172033;
	background: var(--page-bg);
}

.knowledge-shell::before,
.knowledge-shell::after {
	display: none;
}

.hero-band {
	padding: 22px 24px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: var(--paper);
	box-shadow: var(--shadow);
	backdrop-filter: none;
}

.knowledge-shell--ink .hero-band {
	background: var(--paper);
}

.hero-band::before {
	display: none;
}

.hero-band__eyebrow {
	color: var(--accent);
	font-family: var(--font-body);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.08em;
}

.hero-band__title {
	color: var(--page-ink);
	font-family: var(--font-title);
	font-size: clamp(30px, 4vw, 44px);
	font-weight: 750;
	text-shadow: none;
}

.knowledge-shell--ink .hero-band__title {
	text-shadow: none;
}

.hero-band__summary {
	max-width: 720px;
	color: var(--muted-ink);
	font-size: 14px;
	line-height: 1.7;
}

.hero-band__status,
.theme-toggle.el-button,
.metric-card,
.workspace-panel,
.search-result,
.conversation-message,
.ask-form,
.conversation-empty,
.pipeline-result {
	border-radius: 8px;
	background: var(--paper);
	box-shadow: var(--shadow);
}

.hero-band__status,
.theme-toggle.el-button,
.conversation-empty,
.pipeline-result {
	border: 1px solid var(--line);
}

.metric-card,
.workspace-panel,
.search-result,
.conversation-message,
.ask-form {
	border: 1px solid var(--line);
}

.workspace-panel :deep(.el-card__header) {
	background: var(--paper);
}

.panel-header__title {
	padding-left: 0;
	font-size: 16px;
	font-weight: 750;
}

.panel-header__title::before {
	display: none;
}

.metric-card__icon {
	color: var(--accent);
	background: #eff6ff;
}

.knowledge-shell--ink .metric-card__icon {
	background: rgba(96, 165, 250, 0.14);
}

.metric-card__value {
	font-family: var(--font-title);
	font-size: 28px;
	font-weight: 750;
}

.metric-card__value--text {
	font-size: 14px;
	font-weight: 700;
}

.search-result,
.conversation-message,
.ask-form,
.pipeline-result {
	background: var(--paper-strong);
}

.conversation-message--user {
	border-color: rgba(37, 99, 235, 0.28);
	background: #eff6ff;
}

.knowledge-shell--ink .conversation-message--user {
	background: rgba(37, 99, 235, 0.16);
}

.conversation-message--assistant {
	box-shadow: inset 3px 0 0 var(--accent-2);
}

.conversation-message:hover,
.search-result:hover {
	border-color: var(--line-strong);
	box-shadow: 0 8px 18px rgba(16, 24, 40, 0.08);
}

.knowledge-shell :deep(.el-button) {
	border-radius: 6px;
	font-family: var(--font-body);
	font-weight: 650;
}

.knowledge-shell :deep(.el-button--primary) {
	border-color: var(--accent);
	background: var(--accent);
	box-shadow: none;
}

.knowledge-shell :deep(.el-input__wrapper),
.knowledge-shell :deep(.el-textarea__inner) {
	border-radius: 6px;
	background: var(--paper-strong);
	box-shadow: 0 0 0 1px var(--line) inset;
}

.knowledge-shell :deep(.el-input__wrapper.is-focus),
.knowledge-shell :deep(.el-textarea__inner:focus) {
	box-shadow: 0 0 0 1px var(--accent) inset;
}

.knowledge-shell :deep(.el-upload-dragger) {
	border-color: var(--line-strong);
	background: var(--paper-soft);
}

.knowledge-shell :deep(.el-table th.el-table__cell) {
	background: var(--paper-soft);
}

.knowledge-shell :deep(.el-table__row:hover > td.el-table__cell) {
	background: rgba(37, 99, 235, 0.06);
}

.markdown-body :deep(pre) {
	border-color: var(--line);
	color: #dbeafe;
	background: #0f172a;
	box-shadow: none;
}

/* High-tech command-center skin. */
.knowledge-shell {
	--font-title:
		"Rajdhani", "Orbitron", "SF Pro Display", "Segoe UI", "PingFang SC",
		"Microsoft YaHei", sans-serif;
	--font-body:
		"IBM Plex Sans", "SF Pro Text", "Segoe UI", "PingFang SC",
		"Microsoft YaHei", sans-serif;
	--page-bg: #07111f;
	--page-ink: #e6f3ff;
	--muted-ink: #8fa8bd;
	--paper: rgba(11, 24, 42, 0.78);
	--paper-strong: rgba(13, 29, 52, 0.92);
	--paper-soft: rgba(8, 19, 34, 0.86);
	--line: rgba(97, 218, 251, 0.18);
	--line-strong: rgba(97, 218, 251, 0.42);
	--accent: #23c7ff;
	--accent-2: #3df5b6;
	--gold: #a78bfa;
	--shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
	--inner-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #5ed7ff;
	--el-color-primary-light-5: #8ee4ff;
	--el-color-primary-light-7: #b8efff;
	--el-color-primary-light-8: #d0f5ff;
	--el-color-primary-light-9: rgba(35, 199, 255, 0.16);
	--el-color-primary-dark-2: #0aa7dc;
	--el-border-color: var(--line);
	--el-border-color-light: rgba(97, 218, 251, 0.13);
	--el-border-color-lighter: rgba(97, 218, 251, 0.08);
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: var(--muted-ink);
	--el-fill-color-blank: var(--paper-strong);
	--el-fill-color-light: var(--paper-soft);
	--el-bg-color: var(--paper-strong);
	--el-bg-color-overlay: #0d1d34;
	background:
		radial-gradient(
			circle at 18% 12%,
			rgba(35, 199, 255, 0.18),
			transparent 28%
		),
		radial-gradient(
			circle at 84% 8%,
			rgba(61, 245, 182, 0.12),
			transparent 30%
		),
		linear-gradient(rgba(97, 218, 251, 0.045) 1px, transparent 1px),
		linear-gradient(90deg, rgba(97, 218, 251, 0.045) 1px, transparent 1px),
		linear-gradient(135deg, #07111f 0%, #081827 46%, #0c1022 100%);
	background-size:
		auto,
		auto,
		38px 38px,
		38px 38px,
		auto;
}

.knowledge-shell--paper {
	--page-bg: #eef7ff;
	--page-ink: #0b1b2e;
	--muted-ink: #527086;
	--paper: rgba(255, 255, 255, 0.88);
	--paper-strong: rgba(255, 255, 255, 0.96);
	--paper-soft: rgba(232, 247, 255, 0.82);
	--line: rgba(29, 125, 188, 0.18);
	--line-strong: rgba(29, 125, 188, 0.36);
	--accent: #0879c9;
	--accent-2: #00a77f;
	--gold: #6d5dfc;
	--shadow: 0 16px 34px rgba(16, 52, 86, 0.13);
	--el-bg-color: var(--paper-strong);
	--el-bg-color-overlay: #ffffff;
	background:
		radial-gradient(circle at 16% 8%, rgba(8, 121, 201, 0.16), transparent 26%),
		radial-gradient(
			circle at 86% 10%,
			rgba(0, 167, 127, 0.12),
			transparent 28%
		),
		linear-gradient(rgba(8, 121, 201, 0.05) 1px, transparent 1px),
		linear-gradient(90deg, rgba(8, 121, 201, 0.05) 1px, transparent 1px),
		linear-gradient(135deg, #f8fcff 0%, #eef7ff 48%, #e6f2ff 100%);
	background-size:
		auto,
		auto,
		38px 38px,
		38px 38px,
		auto;
}

.knowledge-shell::before {
	display: block;
	position: fixed;
	inset: 0;
	z-index: -2;
	pointer-events: none;
	content: "";
	background:
		linear-gradient(
			120deg,
			transparent 0 42%,
			rgba(35, 199, 255, 0.08) 48%,
			transparent 54%
		),
		repeating-linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.035) 0 1px,
			transparent 1px 7px
		);
	mix-blend-mode: screen;
	opacity: 0.7;
}

.knowledge-shell--paper::before {
	mix-blend-mode: multiply;
	opacity: 0.34;
}

.knowledge-shell::after {
	display: block;
	position: fixed;
	right: -120px;
	bottom: -180px;
	z-index: -1;
	width: min(58vw, 760px);
	aspect-ratio: 1;
	pointer-events: none;
	content: "";
	background:
		radial-gradient(circle, rgba(35, 199, 255, 0.2), transparent 32%),
		radial-gradient(
			circle at 42% 44%,
			rgba(61, 245, 182, 0.12),
			transparent 30%
		);
	filter: blur(10px);
	opacity: 0.9;
}

.hero-band,
.metric-card,
.workspace-panel,
.search-result,
.conversation-message,
.ask-form,
.conversation-empty,
.pipeline-result {
	position: relative;
	border: 1px solid var(--line);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 42%),
		var(--paper);
	box-shadow:
		var(--shadow),
		0 0 0 1px rgba(255, 255, 255, 0.035) inset,
		0 0 38px rgba(35, 199, 255, 0.055);
	backdrop-filter: blur(16px) saturate(132%);
}

.hero-band {
	overflow: hidden;
	padding: 26px 28px;
}

.hero-band::before {
	display: block;
	position: absolute;
	inset: 0;
	pointer-events: none;
	content: "";
	border: 0;
	border-radius: inherit;
	background:
		linear-gradient(90deg, rgba(35, 199, 255, 0.18), transparent 38%),
		linear-gradient(180deg, rgba(61, 245, 182, 0.08), transparent 55%);
	opacity: 0.75;
}

.hero-band__copy,
.hero-band__tools {
	position: relative;
}

.hero-band__eyebrow {
	color: var(--accent-2);
	font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
	letter-spacing: 0.14em;
}

.hero-band__title {
	color: var(--page-ink);
	font-size: clamp(40px, 5vw, 68px);
	font-weight: 800;
	letter-spacing: 0;
	text-shadow:
		0 0 18px rgba(35, 199, 255, 0.28),
		0 0 34px rgba(61, 245, 182, 0.12);
}

.hero-band__summary {
	color: var(--muted-ink);
	font-size: 15px;
}

.hero-band__status,
.theme-toggle.el-button {
	border-color: var(--line-strong);
	background:
		linear-gradient(135deg, rgba(35, 199, 255, 0.12), rgba(61, 245, 182, 0.07)),
		var(--paper-soft);
}

.workspace-panel :deep(.el-card__header) {
	border-bottom-color: var(--line);
	background:
		linear-gradient(90deg, rgba(35, 199, 255, 0.1), transparent 70%),
		transparent;
}

.panel-header__title {
	color: var(--page-ink);
	font-size: 17px;
	letter-spacing: 0;
}

.panel-header__subtitle,
.metric-card__label,
.search-result__meta,
.conversation-message__role {
	color: var(--muted-ink);
}

.metric-card__icon {
	color: var(--accent);
	background:
		radial-gradient(
			circle at 35% 30%,
			rgba(61, 245, 182, 0.22),
			transparent 42%
		),
		rgba(35, 199, 255, 0.11);
	box-shadow: 0 0 20px rgba(35, 199, 255, 0.12);
}

.metric-card__value {
	color: var(--page-ink);
	font-family: var(--font-title);
	font-size: 32px;
}

.knowledge-shell :deep(.el-button--primary) {
	border-color: rgba(35, 199, 255, 0.64);
	color: #03111d;
	background: linear-gradient(135deg, var(--accent), var(--accent-2));
	box-shadow:
		0 10px 26px rgba(35, 199, 255, 0.18),
		0 0 0 1px rgba(255, 255, 255, 0.28) inset;
}

.knowledge-shell :deep(.el-button:not(.el-button--primary)) {
	border-color: var(--line);
	color: var(--page-ink);
	background: rgba(255, 255, 255, 0.04);
}

.knowledge-shell--paper :deep(.el-button:not(.el-button--primary)) {
	background: rgba(255, 255, 255, 0.78);
}

.knowledge-shell :deep(.el-input__wrapper),
.knowledge-shell :deep(.el-textarea__inner) {
	color: var(--page-ink);
	background: rgba(6, 17, 32, 0.48);
	box-shadow: 0 0 0 1px var(--line) inset;
}

.knowledge-shell--paper :deep(.el-input__wrapper),
.knowledge-shell--paper :deep(.el-textarea__inner) {
	background: rgba(255, 255, 255, 0.88);
}

.knowledge-shell :deep(.el-input__wrapper.is-focus),
.knowledge-shell :deep(.el-textarea__inner:focus) {
	box-shadow:
		0 0 0 1px var(--accent) inset,
		0 0 0 3px rgba(35, 199, 255, 0.12);
}

.knowledge-shell :deep(.el-upload-dragger) {
	border-color: var(--line-strong);
	background:
		linear-gradient(135deg, rgba(35, 199, 255, 0.09), rgba(61, 245, 182, 0.06)),
		var(--paper-soft);
}

.search-result,
.conversation-message {
	transition:
		border-color 180ms ease,
		box-shadow 180ms ease,
		transform 180ms ease;
}

.search-result:hover,
.conversation-message:hover {
	border-color: var(--line-strong);
	box-shadow:
		0 14px 34px rgba(0, 0, 0, 0.2),
		0 0 28px rgba(35, 199, 255, 0.1);
	transform: translateY(-2px);
}

.conversation-message--user {
	border-color: rgba(35, 199, 255, 0.34);
	background:
		linear-gradient(135deg, rgba(35, 199, 255, 0.16), transparent 64%),
		var(--paper-soft);
}

.conversation-message--assistant {
	box-shadow:
		inset 3px 0 0 var(--accent-2),
		0 0 24px rgba(61, 245, 182, 0.06);
}

.knowledge-shell :deep(.el-table th.el-table__cell) {
	color: var(--page-ink);
	background: rgba(35, 199, 255, 0.08);
}

.knowledge-shell :deep(.el-table__row:hover > td.el-table__cell) {
	background: rgba(35, 199, 255, 0.08);
}

.knowledge-shell :deep(.el-progress-bar__inner) {
	background: linear-gradient(
		90deg,
		var(--accent),
		var(--accent-2),
		var(--gold)
	);
	box-shadow: 0 0 18px rgba(35, 199, 255, 0.28);
}

.markdown-body :deep(pre) {
	border-color: rgba(35, 199, 255, 0.26);
	color: #d9f7ff;
	background:
		linear-gradient(180deg, rgba(35, 199, 255, 0.05), transparent 42px), #06111f;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

/* Local-first typography: sharp tech headings, readable Chinese body, stable code font. */
.knowledge-shell {
	--font-title:
		"Bahnschrift", "DIN Alternate", "Arial Narrow", "Microsoft YaHei UI",
		"PingFang SC", sans-serif;
	--font-body:
		"Microsoft YaHei UI", "Segoe UI Variable", "Segoe UI", "PingFang SC",
		"Hiragino Sans GB", sans-serif;
	--font-code:
		"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
	font-family: var(--font-body);
}

.hero-band__title,
.metric-card__value {
	font-family: var(--font-title);
	font-stretch: condensed;
}

.hero-band__eyebrow,
.hero-band__model,
.search-result__meta,
.conversation-message__role,
.markdown-body :deep(code),
.markdown-body :deep(pre code) {
	font-family: var(--font-code);
}

.panel-header__title,
.metric-card__label,
.knowledge-shell :deep(.el-button),
.knowledge-shell :deep(.el-tag) {
	font-family: var(--font-body);
}

.repository-table :deep(.el-table__row) {
	cursor: pointer;
	transition:
		background 160ms ease,
		box-shadow 160ms ease,
		transform 160ms ease;
}

.repository-table :deep(.el-table__row:hover > td.el-table__cell) {
	background:
		linear-gradient(90deg, rgba(35, 199, 255, 0.12), transparent 62%),
		rgba(35, 199, 255, 0.05);
}

.repository-table :deep(.repository-row--selected > td.el-table__cell) {
	position: relative;
	color: var(--page-ink);
	/* background:
		linear-gradient(
			90deg,
			rgba(61, 245, 182, 0.18),
			rgba(35, 199, 255, 0.08) 58%,
			transparent
		),
		rgba(35, 199, 255, 0.08);
	box-shadow:
		inset 3px 0 0 var(--accent-2),
		inset 0 1px 0 rgba(255, 255, 255, 0.08),
		inset 0 -1px 0 rgba(97, 218, 251, 0.14); */
}

.repository-name-cell {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.repository-name-cell__dot {
	width: 8px;
	height: 8px;
	flex: 0 0 auto;
	border: 1px solid var(--line-strong);
	border-radius: 50%;
	background: rgba(143, 168, 189, 0.58);
}

.repository-name-cell__text {
	min-width: 0;
	overflow: hidden;
	color: var(--page-ink);
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.repository-table :deep(.repository-row--selected) .repository-name-cell__dot {
	border-color: rgba(61, 245, 182, 0.8);
	background: var(--accent-2);
	box-shadow:
		0 0 0 4px rgba(61, 245, 182, 0.12),
		0 0 14px rgba(61, 245, 182, 0.42);
}

.repository-table :deep(.repository-row--selected) .repository-name-cell__text {
	color: var(--page-ink);
	text-shadow: 0 0 14px rgba(61, 245, 182, 0.18);
}
/* Liquid glass + future-tech theme. This is the final visual layer for this page. */
.knowledge-shell {
	--font-title:
		"Bahnschrift", "DIN Alternate", "Microsoft YaHei UI", "PingFang SC",
		sans-serif;
	--font-body:
		"Microsoft YaHei UI", "Segoe UI Variable", "Segoe UI", "PingFang SC",
		"Hiragino Sans GB", sans-serif;
	--font-code:
		"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
	--page-bg: #04111d;
	--page-ink: #eefaff;
	--muted-ink: #99b8c7;
	--paper: rgba(11, 30, 48, 0.54);
	--paper-strong: rgba(12, 35, 58, 0.7);
	--paper-soft: rgba(221, 249, 255, 0.08);
	--line: rgba(199, 247, 255, 0.2);
	--line-strong: rgba(133, 238, 255, 0.48);
	--accent: #7deeff;
	--accent-2: #7dffd8;
	--gold: #b7a7ff;
	--liquid-blue: rgba(93, 214, 255, 0.28);
	--liquid-mint: rgba(125, 255, 216, 0.2);
	--liquid-violet: rgba(183, 167, 255, 0.18);
	--shadow: 0 28px 76px rgba(0, 12, 28, 0.44);
	--inner-shadow:
		inset 0 1px 0 rgba(255, 255, 255, 0.22),
		inset 0 -1px 0 rgba(255, 255, 255, 0.06);
	--el-color-primary: var(--accent);
	--el-color-primary-light-3: #9af3ff;
	--el-color-primary-light-5: #b9f7ff;
	--el-color-primary-light-7: #d5fbff;
	--el-color-primary-light-8: #e4fdff;
	--el-color-primary-light-9: rgba(125, 238, 255, 0.16);
	--el-color-primary-dark-2: #39cbe7;
	--el-border-color: var(--line);
	--el-border-color-light: rgba(199, 247, 255, 0.14);
	--el-border-color-lighter: rgba(199, 247, 255, 0.1);
	--el-text-color-primary: var(--page-ink);
	--el-text-color-regular: var(--muted-ink);
	--el-fill-color-blank: rgba(12, 35, 58, 0.7);
	--el-fill-color-light: rgba(221, 249, 255, 0.08);
	--el-bg-color: rgba(12, 35, 58, 0.7);
	--el-bg-color-overlay: rgba(12, 35, 58, 0.96);
	min-height: 100vh;
	padding: 30px;
	color: var(--page-ink);
	font-family: var(--font-body);
	background:
		radial-gradient(
			circle at 16% 8%,
			rgba(125, 238, 255, 0.28),
			transparent 27%
		),
		radial-gradient(
			circle at 86% 12%,
			rgba(125, 255, 216, 0.2),
			transparent 25%
		),
		radial-gradient(
			circle at 58% 0%,
			rgba(183, 167, 255, 0.18),
			transparent 31%
		),
		linear-gradient(rgba(199, 247, 255, 0.05) 1px, transparent 1px),
		linear-gradient(90deg, rgba(199, 247, 255, 0.045) 1px, transparent 1px),
		linear-gradient(135deg, #04111d 0%, #071c2f 46%, #0b1022 100%);
	background-size:
		auto,
		auto,
		auto,
		42px 42px,
		42px 42px,
		auto;
	isolation: isolate;
}

.knowledge-shell--paper {
	--page-bg: #eefdff;
	--page-ink: #0b2435;
	--muted-ink: #587487;
	--paper: rgba(255, 255, 255, 0.5);
	--paper-strong: rgba(255, 255, 255, 0.72);
	--paper-soft: rgba(255, 255, 255, 0.38);
	--line: rgba(16, 122, 159, 0.18);
	--line-strong: rgba(16, 122, 159, 0.36);
	--accent: #087ea4;
	--accent-2: #009d80;
	--gold: #7568ff;
	--liquid-blue: rgba(47, 180, 226, 0.18);
	--liquid-mint: rgba(0, 186, 151, 0.14);
	--liquid-violet: rgba(117, 104, 255, 0.12);
	--shadow: 0 24px 58px rgba(26, 87, 116, 0.16);
	--el-bg-color: rgba(255, 255, 255, 0.72);
	--el-bg-color-overlay: rgba(255, 255, 255, 0.95);
	background:
		radial-gradient(circle at 16% 8%, rgba(47, 180, 226, 0.2), transparent 27%),
		radial-gradient(
			circle at 86% 12%,
			rgba(0, 186, 151, 0.14),
			transparent 25%
		),
		radial-gradient(
			circle at 58% 0%,
			rgba(117, 104, 255, 0.12),
			transparent 31%
		),
		linear-gradient(rgba(16, 122, 159, 0.055) 1px, transparent 1px),
		linear-gradient(90deg, rgba(16, 122, 159, 0.05) 1px, transparent 1px),
		linear-gradient(135deg, #f7fdff 0%, #eefdff 50%, #e9f8ff 100%);
	background-size:
		auto,
		auto,
		auto,
		42px 42px,
		42px 42px,
		auto;
}

.knowledge-shell--ink {
	--page-bg: #04101b;
	--page-ink: #f2fbff;
	--muted-ink: #9cb9c8;
	--paper: rgba(9, 28, 46, 0.56);
	--paper-strong: rgba(10, 34, 57, 0.72);
	--paper-soft: rgba(221, 249, 255, 0.08);
	--line: rgba(199, 247, 255, 0.22);
	--line-strong: rgba(125, 238, 255, 0.5);
	--accent: #7deeff;
	--accent-2: #7dffd8;
	--gold: #b7a7ff;
	--shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
	--el-bg-color: rgba(10, 34, 57, 0.72);
	--el-bg-color-overlay: rgba(10, 34, 57, 0.96);
}

.knowledge-shell::before,
.knowledge-shell::after {
	display: block;
	position: fixed;
	pointer-events: none;
	content: "";
}

.knowledge-shell::before {
	inset: 0;
	z-index: -2;
	background:
		linear-gradient(
			115deg,
			transparent 0 37%,
			rgba(125, 238, 255, 0.12) 45%,
			transparent 54%
		),
		repeating-linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.035) 0 1px,
			transparent 1px 8px
		);
	mix-blend-mode: screen;
	opacity: 0.58;
}

.knowledge-shell--paper::before {
	mix-blend-mode: multiply;
	opacity: 0.24;
}

.knowledge-shell::after {
	right: -180px;
	bottom: -220px;
	z-index: -1;
	width: min(62vw, 820px);
	aspect-ratio: 1;
	border-radius: 50%;
	background:
		radial-gradient(
			circle at 36% 36%,
			rgba(125, 238, 255, 0.3),
			transparent 32%
		),
		radial-gradient(
			circle at 64% 52%,
			rgba(125, 255, 216, 0.22),
			transparent 34%
		),
		radial-gradient(
			circle at 48% 66%,
			rgba(183, 167, 255, 0.18),
			transparent 36%
		);
	filter: blur(18px);
	opacity: 0.86;
}

.hero-band,
.metric-card,
.workspace-panel,
.search-result,
.conversation-message,
.ask-form,
.conversation-empty,
.pipeline-result {
	position: relative;
	overflow: hidden;
	border: 1px solid var(--line);
	border-radius: 8px;
	background:
		linear-gradient(145deg, rgba(255, 255, 255, 0.2), transparent 38%),
		radial-gradient(circle at 18% 0%, var(--liquid-blue), transparent 42%),
		radial-gradient(circle at 100% 12%, var(--liquid-mint), transparent 38%),
		var(--paper);
	box-shadow:
		var(--shadow),
		var(--inner-shadow),
		0 0 0 1px rgba(255, 255, 255, 0.04) inset,
		0 0 42px rgba(125, 238, 255, 0.08);
	backdrop-filter: blur(22px) saturate(150%);
}

.hero-band::after,
.metric-card::after,
.workspace-panel::after,
.search-result::after,
.conversation-message::after,
.ask-form::after,
.pipeline-result::after {
	position: absolute;
	inset: 0;
	pointer-events: none;
	content: "";
	border-radius: inherit;
	background:
		linear-gradient(120deg, rgba(255, 255, 255, 0.18), transparent 30%),
		linear-gradient(300deg, rgba(255, 255, 255, 0.08), transparent 38%);
	opacity: 0.7;
}

.hero-band {
	align-items: center;
	margin-bottom: 20px;
	padding: 30px;
}

.hero-band::before {
	inset: auto 26px 18px 26px;
	height: 1px;
	border: 0;
	background: linear-gradient(
		90deg,
		transparent,
		var(--accent),
		var(--accent-2),
		transparent
	);
	box-shadow: 0 0 18px rgba(125, 238, 255, 0.42);
}

.hero-band__copy,
.hero-band__tools,
.panel-header,
.metric-card :deep(.el-card__body),
.search-result__head,
.conversation-message > *,
.ask-form > *,
.pipeline-result > * {
	position: relative;
	z-index: 1;
}

.hero-band__eyebrow,
.hero-band__model,
.search-result__meta,
.conversation-message__role,
.markdown-body :deep(code),
.markdown-body :deep(pre code) {
	font-family: var(--font-code);
}

.hero-band__eyebrow {
	color: var(--accent-2);
	font-size: 12px;
	letter-spacing: 0.16em;
	text-shadow: 0 0 16px rgba(125, 255, 216, 0.4);
}

.hero-band__title,
.metric-card__value {
	font-family: var(--font-title);
	font-stretch: condensed;
}

.hero-band__title {
	color: var(--page-ink);
	font-size: clamp(42px, 5vw, 70px);
	font-weight: 800;
	letter-spacing: 0;
	text-shadow:
		0 0 16px rgba(125, 238, 255, 0.35),
		0 0 36px rgba(125, 255, 216, 0.18);
}

.hero-band__summary {
	max-width: 820px;
	color: var(--muted-ink);
	font-size: 15px;
	line-height: 1.85;
}

.hero-band__tools {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 12px;
	min-width: 260px;
}

.hero-band__status,
.theme-toggle.el-button {
	border: 1px solid var(--line-strong);
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 52%),
		rgba(221, 249, 255, 0.1);
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, 0.18),
		0 12px 30px rgba(0, 16, 35, 0.22);
	backdrop-filter: blur(18px) saturate(145%);
}

.hero-band__model,
.panel-header__subtitle,
.metric-card__label,
.upload-drop__tip,
.upload-progress__head,
.index-progress__head,
.search-result__meta,
.conversation-message__role,
.ask-settings__hint,
.ask-settings__help {
	color: var(--muted-ink);
}

.metric-grid {
	gap: 16px;
	margin-bottom: 18px;
}

.metric-card :deep(.el-card__body) {
	grid-template-columns: 44px 1fr;
	padding: 18px;
}

.metric-card__icon {
	width: 44px;
	height: 44px;
	border: 1px solid var(--line);
	color: var(--accent);
	background:
		radial-gradient(
			circle at 35% 28%,
			rgba(255, 255, 255, 0.32),
			transparent 32%
		),
		linear-gradient(135deg, rgba(125, 238, 255, 0.22), rgba(125, 255, 216, 0.1));
	box-shadow:
		inset 0 1px 0 rgba(255, 255, 255, 0.22),
		0 0 24px rgba(125, 238, 255, 0.22);
}

.metric-card__value {
	color: var(--page-ink);
	font-size: 34px;
	font-weight: 800;
}

.metric-card__value--text {
	font-family: var(--font-body);
	font-size: 15px;
	font-weight: 700;
}

.workspace-layout {
	gap: 18px;
	margin-bottom: 18px;
}

.workspace-panel :deep(.el-card__header) {
	position: relative;
	z-index: 1;
	border-bottom-color: var(--line);
	background:
		linear-gradient(90deg, rgba(125, 238, 255, 0.13), transparent 70%),
		transparent;
}

.workspace-panel :deep(.el-card__body) {
	position: relative;
	z-index: 1;
}

.panel-header__title {
	position: relative;
	color: var(--page-ink);
	font-size: 17px;
	font-weight: 800;
	letter-spacing: 0;
}

.panel-header__title::before {
	display: block;
	position: absolute;
	top: 4px;
	left: -12px;
	width: 3px;
	height: 14px;
	content: "";
	border-radius: 99px;
	background: linear-gradient(180deg, var(--accent), var(--accent-2));
	box-shadow: 0 0 14px rgba(125, 238, 255, 0.45);
}

.knowledge-shell :deep(.el-button) {
	border-radius: 6px;
	font-family: var(--font-body);
	font-weight: 750;
}

.knowledge-shell :deep(.el-button--primary) {
	border-color: rgba(125, 238, 255, 0.65);
	color: #031420;
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.42), transparent 36%),
		linear-gradient(135deg, var(--accent), var(--accent-2));
	box-shadow:
		0 12px 30px rgba(125, 238, 255, 0.22),
		inset 0 1px 0 rgba(255, 255, 255, 0.46);
}

.knowledge-shell :deep(.el-button:not(.el-button--primary)) {
	border-color: var(--line);
	color: var(--page-ink);
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.16), transparent 48%),
		rgba(221, 249, 255, 0.08);
	backdrop-filter: blur(14px);
}

.knowledge-shell :deep(.el-button:not(.el-button--primary):hover) {
	border-color: var(--line-strong);
	color: var(--accent);
	background: rgba(221, 249, 255, 0.14);
}

.knowledge-shell :deep(.el-input__wrapper),
.knowledge-shell :deep(.el-textarea__inner) {
	color: var(--page-ink);
	border-radius: 6px;
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.14), transparent 44%),
		rgba(3, 16, 28, 0.34);
	box-shadow:
		0 0 0 1px var(--line) inset,
		inset 0 1px 0 rgba(255, 255, 255, 0.14);
	backdrop-filter: blur(14px);
}

.knowledge-shell--paper :deep(.el-input__wrapper),
.knowledge-shell--paper :deep(.el-textarea__inner) {
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.78), transparent 48%),
		rgba(255, 255, 255, 0.5);
}

.knowledge-shell :deep(.el-input__wrapper.is-focus),
.knowledge-shell :deep(.el-textarea__inner:focus) {
	box-shadow:
		0 0 0 1px var(--accent) inset,
		0 0 0 3px rgba(125, 238, 255, 0.14),
		inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.knowledge-shell :deep(.el-input-group__append) {
	border-color: var(--line);
	background: rgba(221, 249, 255, 0.1);
}

.knowledge-shell :deep(.el-form-item__label),
.knowledge-shell :deep(.el-divider__text),
.knowledge-shell :deep(.el-tag) {
	font-family: var(--font-body);
	font-weight: 750;
}

.knowledge-shell :deep(.el-upload-dragger) {
	border-color: var(--line-strong);
	background:
		radial-gradient(
			circle at 20% 0%,
			rgba(125, 238, 255, 0.16),
			transparent 36%
		),
		linear-gradient(135deg, rgba(255, 255, 255, 0.14), transparent 48%),
		rgba(221, 249, 255, 0.08);
	backdrop-filter: blur(16px);
}

.knowledge-shell :deep(.el-upload-dragger:hover) {
	border-color: var(--accent);
	box-shadow: 0 0 26px rgba(125, 238, 255, 0.16);
}

.upload-drop__icon {
	color: var(--accent);
	filter: drop-shadow(0 0 14px rgba(125, 238, 255, 0.35));
}

.upload-drop__title,
.search-result__head strong,
.search-result__preview,
.conversation-message__text,
.conversation-message__content,
.repository-name-cell__text {
	color: var(--page-ink);
}

.search-result,
.conversation-message {
	transition:
		border-color 180ms ease,
		box-shadow 180ms ease,
		transform 180ms ease;
}

.search-result:hover,
.conversation-message:hover {
	border-color: var(--line-strong);
	box-shadow:
		0 18px 42px rgba(0, 12, 28, 0.26),
		0 0 32px rgba(125, 238, 255, 0.14);
	transform: translateY(-2px);
}

.conversation-message--user {
	justify-self: end;
	border-color: rgba(125, 238, 255, 0.42);
	background:
		radial-gradient(
			circle at 100% 0%,
			rgba(125, 238, 255, 0.24),
			transparent 42%
		),
		var(--paper-strong);
}

.conversation-message--assistant {
	justify-self: start;
	border-color: rgba(125, 255, 216, 0.36);
	background:
		radial-gradient(
			circle at 0% 0%,
			rgba(125, 255, 216, 0.18),
			transparent 42%
		),
		var(--paper);
	box-shadow:
		inset 3px 0 0 var(--accent-2),
		0 0 28px rgba(125, 255, 216, 0.08);
}

.knowledge-shell :deep(.el-table),
.knowledge-shell :deep(.el-table__expanded-cell) {
	color: var(--page-ink);
	background: transparent;
}

.knowledge-shell :deep(.el-table th.el-table__cell) {
	color: var(--page-ink);
	background:
		linear-gradient(90deg, rgba(125, 238, 255, 0.14), transparent 78%),
		rgba(221, 249, 255, 0.08);
}

.knowledge-shell :deep(.el-table tr),
.knowledge-shell :deep(.el-table td.el-table__cell) {
	color: var(--page-ink);
	border-color: var(--line);
	background: transparent;
}

.knowledge-shell :deep(.el-table__inner-wrapper::before),
.knowledge-shell :deep(.el-table__border-left-patch) {
	background-color: var(--line);
}

.repository-table :deep(.el-table__row:hover > td.el-table__cell),
.knowledge-shell :deep(.el-table__row:hover > td.el-table__cell) {
	background:
		linear-gradient(90deg, rgba(125, 238, 255, 0.14), transparent 64%),
		rgba(125, 238, 255, 0.05);
}

.repository-table :deep(.repository-row--selected > td.el-table__cell) {
	color: var(--page-ink);
	/* background:
		linear-gradient(
			90deg,
			rgba(125, 255, 216, 0.18),
			rgba(125, 238, 255, 0.1) 60%,
			transparent
		),
		rgba(125, 238, 255, 0.08);
	box-shadow:
		inset 3px 0 0 var(--accent-2),
		inset 0 1px 0 rgba(255, 255, 255, 0.1),
		inset 0 -1px 0 rgba(199, 247, 255, 0.15); */
}

.repository-name-cell__dot {
	border-color: var(--line-strong);
	background: rgba(153, 184, 199, 0.58);
}

.repository-table :deep(.repository-row--selected) .repository-name-cell__dot {
	border-color: rgba(125, 255, 216, 0.86);
	background: var(--accent-2);
	box-shadow:
		0 0 0 4px rgba(125, 255, 216, 0.14),
		0 0 16px rgba(125, 255, 216, 0.5);
}

.knowledge-shell :deep(.el-descriptions__label.el-descriptions__cell),
.knowledge-shell :deep(.el-descriptions__content.el-descriptions__cell) {
	border-color: var(--line);
	color: var(--page-ink);
	background: rgba(221, 249, 255, 0.08);
}

.knowledge-shell :deep(.el-empty__description p) {
	color: var(--muted-ink);
}

.knowledge-shell :deep(.el-progress-bar__outer) {
	background: rgba(199, 247, 255, 0.12);
}

.knowledge-shell :deep(.el-progress-bar__inner) {
	background: linear-gradient(
		90deg,
		var(--accent),
		var(--accent-2),
		var(--gold)
	);
	box-shadow: 0 0 18px rgba(125, 238, 255, 0.36);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(strong) {
	color: var(--page-ink);
}

.markdown-body :deep(h2),
.markdown-body :deep(th),
.markdown-body :deep(td) {
	border-color: var(--line);
}

.markdown-body :deep(h4),
.markdown-body :deep(blockquote) {
	color: var(--muted-ink);
}

.markdown-body :deep(li::marker),
.markdown-body :deep(a) {
	color: var(--accent-2);
}

.markdown-body :deep(blockquote) {
	border-left-color: var(--accent);
	background: rgba(125, 238, 255, 0.08);
}

.markdown-body :deep(code) {
	border-color: var(--line);
	color: var(--accent-2);
	background: rgba(125, 255, 216, 0.1);
}

.markdown-body :deep(pre) {
	border-color: rgba(125, 238, 255, 0.28);
	color: #dcfbff;
	background:
		linear-gradient(180deg, rgba(125, 238, 255, 0.07), transparent 42px),
		rgba(3, 13, 24, 0.82);
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.04),
		0 16px 34px rgba(0, 12, 28, 0.22);
}

@media (max-width: 760px) {
	.knowledge-shell {
		padding: 16px;
	}

	.hero-band {
		padding: 22px 18px;
	}

	.hero-band__tools,
	.hero-band__status {
		align-items: flex-start;
		width: 100%;
	}

	.hero-band__title {
		font-size: 42px;
	}
}

/* Light-mode repair: keep Element Plus internals readable on liquid glass panels. */
.knowledge-shell--paper :deep(.el-table),
.knowledge-shell--paper :deep(.el-table__expanded-cell) {
	color: var(--page-ink);
	background: transparent;
}

.knowledge-shell--paper :deep(.el-table th.el-table__cell) {
	color: #123044;
	background:
		linear-gradient(90deg, rgba(8, 126, 164, 0.1), transparent 78%),
		rgba(255, 255, 255, 0.34);
}

.knowledge-shell--paper :deep(.el-table tr),
.knowledge-shell--paper :deep(.el-table td.el-table__cell) {
	color: #16364a;
	border-color: rgba(16, 122, 159, 0.16);
	background: rgba(255, 255, 255, 0.18);
}

.knowledge-shell--paper :deep(.el-table__row:hover > td.el-table__cell),
.knowledge-shell--paper
	.repository-table
	:deep(.repository-row--selected > td.el-table__cell) {
	color: #0b2435;
	/* background:
		linear-gradient(
			90deg,
			rgba(0, 169, 130, 0.12),
			rgba(8, 126, 164, 0.08) 58%,
			transparent
		),
		rgba(255, 255, 255, 0.38); */
}

.knowledge-shell--paper :deep(.el-descriptions__label.el-descriptions__cell),
.knowledge-shell--paper :deep(.el-descriptions__content.el-descriptions__cell) {
	color: #123044;
	border: none !important;
	/* border-color: rgba(16, 122, 159, 0.16); */
	background: rgba(255, 255, 255, 0.9);
}

.knowledge-shell--paper :deep(.el-tag) {
	color: #0f5970;
	border-color: rgba(8, 126, 164, 0.22);
	background: rgba(255, 255, 255, 0.52);
}

.knowledge-shell--paper :deep(.el-tag--success) {
	color: #24810f;
	border-color: rgba(67, 160, 71, 0.24);
	background: rgba(242, 255, 237, 0.86);
}

.knowledge-shell--paper :deep(.el-tag--info) {
	color: #4f6573;
	border-color: rgba(88, 116, 135, 0.18);
	background: rgba(255, 255, 255, 0.58);
}

.knowledge-shell--paper .pipeline-result {
	background:
		linear-gradient(145deg, rgba(255, 255, 255, 0.55), transparent 46%),
		rgba(255, 255, 255, 0.34);
}
</style>
