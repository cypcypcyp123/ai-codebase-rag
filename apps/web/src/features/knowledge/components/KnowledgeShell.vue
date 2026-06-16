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
	streamingAnswer,
	streamingCitations,
	uploadProgress,
	uploadStage,
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
	selectRepository,
} = useRepositoryWorkspace();

const markdown = new MarkdownIt({
	breaks: true,
	linkify: true,
});
const selectedRepositoryName = computed(
	() => selectedRepository.value?.name ?? "未选择仓库",
);
const answerMarkdown = computed(
	() => streamingAnswer.value || askResult.value?.answer || "",
);
const renderedAnswer = computed(() =>
	DOMPurify.sanitize(markdown.render(answerMarkdown.value)),
);
const answerCitations = computed(() =>
	streamingCitations.value.length
		? streamingCitations.value
		: (askResult.value?.citations ?? []),
);
const hasAnswerPanelContent = computed(() =>
	Boolean(answerMarkdown.value || loading.ask || answerCitations.value.length),
);
const answerCopied = shallowRef(false);
const themeMode = shallowRef<"paper" | "ink">("paper");
const isInkTheme = computed(() => themeMode.value === "ink");
const shellClasses = computed(() => ({
	"knowledge-shell": true,
	"knowledge-shell--paper": themeMode.value === "paper",
	"knowledge-shell--ink": themeMode.value === "ink",
}));
const themeLabel = computed(() => (isInkTheme.value ? "古风宣纸" : "水墨暗黑"));

function toggleThemeMode() {
	themeMode.value = isInkTheme.value ? "paper" : "ink";
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
				<p class="hero-band__eyebrow">AI Codebase Intelligence · 江湖卷宗</p>
				<h1 class="hero-band__title">代码知识库平台</h1>
				<p class="hero-band__summary">
					面向 Vue、React、Node 项目的源码扫描、代码分片、ChromaDB
					索引与语义检索工作台。以宣纸为案、水墨为界，把仓库脉络铺成可追问的代码长卷。
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
					@row-click="selectRepository"
				>
					<el-table-column prop="name" label="名称" min-width="150" />
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
			<el-card shadow="never" class="workspace-panel">
				<template #header>
					<div class="panel-header">
						<div>
							<h2 class="panel-header__title">代码问答</h2>
							<p class="panel-header__subtitle">
								基于当前仓库检索出的代码片段，让本地模型生成解释。
							</p>
						</div>
					</div>
				</template>

				<el-form :model="askForm" class="ask-form">
					<el-form-item>
						<el-input
							v-model="askForm.question"
							type="textarea"
							:rows="3"
							placeholder="例如：这个项目的代码扫描器在哪里实现？"
							clearable
						/>
					</el-form-item>
					<el-button
						type="primary"
						:icon="ChatDotRound"
						:loading="loading.ask"
						:disabled="!selectedRepositoryId"
						@click="runAskStream"
					>
						流式提问
					</el-button>
				</el-form>

				<el-empty
					v-if="!hasAnswerPanelContent"
					description="暂无问答结果"
					:image-size="96"
				/>
				<div v-else class="answer-panel">
					<div class="answer-panel__title-row">
						<h3 class="answer-panel__title">回答</h3>
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
					<div
						v-if="answerMarkdown"
						class="answer-panel__content markdown-body"
						v-html="renderedAnswer"
					></div>
					<div v-else class="answer-panel__placeholder">
						{{
							loading.ask
								? "正在生成回答..."
								: "未收到回答文本，请查看上方错误提示。"
						}}
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
			</el-card>
		</section>
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
}

.upload-progress {
	margin-top: 14px;
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

.repository-table {
	width: 100%;
}

.pipeline-result {
	margin-top: 18px;
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
}

.search-result {
	padding: 14px;
	border: 1px solid #dfe8e2;
	border-radius: 8px;
	background: #fbfcfa;
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

.ask-form {
	margin-bottom: 16px;
}

.answer-panel {
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
		radial-gradient(ellipse at 14% 8%, rgba(217, 194, 141, 0.14), transparent 28%),
		radial-gradient(ellipse at 84% 4%, rgba(84, 113, 92, 0.16), transparent 26%),
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
		linear-gradient(90deg, transparent 0 12%, rgba(75, 51, 24, 0.06) 12% 12.4%, transparent 12.4%),
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
		linear-gradient(90deg, transparent 0 11%, rgba(210, 184, 129, 0.08) 11% 11.3%, transparent 11.3%),
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
		radial-gradient(ellipse at 48% 58%, rgba(43, 36, 25, 0.22), transparent 0 35%),
		radial-gradient(ellipse at 36% 44%, rgba(43, 36, 25, 0.16), transparent 0 30%),
		radial-gradient(ellipse at 64% 30%, rgba(43, 36, 25, 0.1), transparent 0 26%);
	filter: blur(18px);
	opacity: 0.38;
	transform: rotate(-10deg);
}

.knowledge-shell--ink::after {
	background:
		radial-gradient(ellipse at 48% 58%, rgba(245, 229, 187, 0.18), transparent 0 35%),
		radial-gradient(ellipse at 36% 44%, rgba(111, 176, 138, 0.14), transparent 0 30%),
		radial-gradient(ellipse at 64% 30%, rgba(194, 72, 60, 0.11), transparent 0 26%);
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
	background:
		linear-gradient(90deg, var(--accent), var(--gold));
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
}
</style>
