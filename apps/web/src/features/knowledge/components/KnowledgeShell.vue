<script setup lang="ts">
import type { CodeRepository } from '@ai-codebase-rag/shared'
import {
  Aim,
  ChatDotRound,
  Cpu,
  DataAnalysis,
  Files,
  FolderOpened,
  Link,
  Refresh,
  Search,
  Upload,
  UploadFilled
} from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'
import type { UploadAjaxError } from 'element-plus/es/components/upload/src/ajax'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'
import { useKnowledgeStatus } from '@/composables/useKnowledgeStatus'
import { useRepositoryWorkspace } from '@/composables/useRepositoryWorkspace'

const { health } = useKnowledgeStatus()
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
  selectRepository
} = useRepositoryWorkspace()

const markdown = new MarkdownIt({
  breaks: true,
  linkify: true
})
const selectedRepositoryName = computed(() => selectedRepository.value?.name ?? '未选择仓库')
const answerMarkdown = computed(() => streamingAnswer.value || askResult.value?.answer || '')
const renderedAnswer = computed(() => DOMPurify.sanitize(markdown.render(answerMarkdown.value)))
const answerCitations = computed(() =>
  streamingCitations.value.length ? streamingCitations.value : askResult.value?.citations ?? []
)

function statusType(status: CodeRepository['status']) {
  const typeMap: Record<CodeRepository['status'], 'info' | 'warning' | 'success' | 'danger'> = {
    pending: 'info',
    indexing: 'warning',
    indexed: 'success',
    failed: 'danger'
  }

  return typeMap[status]
}

async function handleZipUpload(options: UploadRequestOptions) {
  try {
    await uploadZip(options.file)
    options.onSuccess({})
  } catch (error) {
    options.onError(createUploadError(error))
  }
}

function createUploadError(error: unknown): UploadAjaxError {
  const uploadError = new Error(error instanceof Error ? error.message : '上传失败') as UploadAjaxError
  uploadError.status = 0
  uploadError.method = 'POST'
  uploadError.url = ''

  return uploadError
}
</script>

<template>
  <main class="knowledge-shell">
    <section class="hero-band">
      <div class="hero-band__copy">
        <p class="hero-band__eyebrow">AI Codebase Intelligence</p>
        <h1 class="hero-band__title">代码知识库平台</h1>
        <p class="hero-band__summary">
          面向 Vue、React、Node 项目的源码扫描、代码分片、ChromaDB 索引与语义检索工作台。
        </p>
      </div>

      <div class="hero-band__status">
        <el-tag :type="health?.ok ? 'success' : 'danger'" size="large" effect="dark">
          API {{ health?.ok ? '在线' : '未连接' }}
        </el-tag>
        <span class="hero-band__model">{{ health?.ollama.chatModel ?? 'qwen3.5:4b' }}</span>
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
          {{ health?.ollama.embedModel ?? 'nomic-embed-text' }}
        </strong>
      </el-card>
      <el-card shadow="never" class="metric-card">
        <el-icon class="metric-card__icon"><Link /></el-icon>
        <span class="metric-card__label">ChromaDB</span>
        <strong class="metric-card__value metric-card__value--text">
          {{ health?.chroma.host ?? '127.0.0.1' }}:{{ health?.chroma.port ?? 8000 }}
        </strong>
      </el-card>
    </section>

    <section class="workspace-layout">
      <el-card shadow="never" class="workspace-panel workspace-panel--form">
        <template #header>
          <div class="panel-header">
            <div>
              <h2 class="panel-header__title">登记代码仓库</h2>
              <p class="panel-header__subtitle">输入本地项目路径，建立后续扫描和索引入口。</p>
            </div>
            <el-button :icon="Refresh" :loading="loading.repositories" @click="refreshRepositories">
              刷新
            </el-button>
          </div>
        </template>

        <el-form label-position="top" :model="repositoryForm" class="repository-form">
          <el-form-item label="仓库名称">
            <el-input v-model="repositoryForm.name" placeholder="例如 ai-codebase-rag" clearable />
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
            <div class="upload-drop__tip">上传后会解压到 uploads/repositories，并自动登记为代码仓库。</div>
          </template>
        </el-upload>
        <div v-if="loading.upload || uploadStage" class="upload-progress">
          <div class="upload-progress__head">
            <span>{{ uploadStage || '上传中' }}</span>
            <strong>{{ uploadProgress }}%</strong>
          </div>
          <el-progress :percentage="uploadProgress" :indeterminate="uploadProgress >= 100" />
        </div>
      </el-card>

      <el-card shadow="never" class="workspace-panel workspace-panel--table">
        <template #header>
          <div class="panel-header">
            <div>
              <h2 class="panel-header__title">仓库列表</h2>
              <p class="panel-header__subtitle">选择一个仓库后执行扫描、分片、索引和搜索。</p>
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
              <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
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
              <p class="panel-header__subtitle">按顺序验证扫描、分片和写入 ChromaDB。</p>
            </div>
          </div>
        </template>

        <el-space wrap>
          <el-button :disabled="!selectedRepositoryId" :loading="loading.scan" :icon="Files" @click="runScan">
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
              {{ chunkResult?.chunkCount ?? selectedRepository?.chunkCount ?? 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="索引状态">
              <el-tag v-if="selectedRepository" :type="statusType(selectedRepository.status)">
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
              <p class="panel-header__subtitle">按仓库过滤 ChromaDB 结果，并结合路径关键词重排。</p>
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

        <el-empty v-if="!searchResult?.results.length" description="暂无搜索结果" :image-size="96" />
        <div v-else class="search-results">
          <article v-for="result in searchResult.results" :key="result.chunkId" class="search-result">
            <div class="search-result__head">
              <strong>{{ result.relativePath }}</strong>
              <el-tag size="small">{{ result.language }}</el-tag>
            </div>
            <p class="search-result__meta">
              行 {{ result.startLine }}-{{ result.endLine }} · score {{ result.score.toFixed(2) }}
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
              <p class="panel-header__subtitle">基于当前仓库检索出的代码片段，让本地模型生成解释。</p>
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

        <el-empty v-if="!answerMarkdown && !loading.ask" description="暂无问答结果" :image-size="96" />
        <div v-else class="answer-panel">
          <div class="answer-panel__title-row">
            <h3 class="answer-panel__title">回答</h3>
            <el-tag v-if="loading.ask" type="warning">生成中</el-tag>
          </div>
          <div class="answer-panel__content markdown-body" v-html="renderedAnswer"></div>
          <h3 class="answer-panel__title">引用代码</h3>
          <el-table :data="answerCitations" size="small" border>
            <el-table-column prop="relativePath" label="文件" min-width="220" />
            <el-table-column label="行号" width="120">
              <template #default="{ row }"> {{ row.startLine }}-{{ row.endLine }} </template>
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
    linear-gradient(135deg, rgba(235, 242, 229, 0.88), rgba(247, 248, 243, 0.96)),
    repeating-linear-gradient(90deg, rgba(38, 68, 48, 0.06) 0 1px, transparent 1px 28px);
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

.answer-panel__content {
  margin: 0 0 18px;
  padding: 14px;
  border: 1px solid #dfe8e2;
  border-radius: 8px;
  color: #2d3c34;
  line-height: 1.8;
  white-space: pre-wrap;
  background: #fbfcfa;
}

.markdown-body :deep(p) {
  margin: 0 0 10px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 8px 0 12px;
  padding-left: 22px;
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  color: #0f4c35;
  background: #e8f2ec;
}

.markdown-body :deep(pre) {
  overflow: auto;
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  color: #e9f2ed;
  background: #15251d;
}

.markdown-body :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
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
</style>
