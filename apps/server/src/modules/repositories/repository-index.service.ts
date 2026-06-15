import type {
  ChunkRepositoryResponse,
  CodeChunk,
  CodeChunkSummary,
  AskRepositoryResponse,
  IndexRepositoryResponse,
  ScanRepositoryResponse,
  SearchCodeResponse
} from '@ai-codebase-rag/shared'
import { OllamaClient } from '../../integrations/ollama/ollama.client.js'
import { config } from '../../shared/config.js'
import { chunkCodeFiles } from '../code/code-chunker.js'
import { scanCodeRepository } from '../code/code-scanner.js'
import { vectorStore } from '../vector/vector-store.instance.js'
import { repositoryService } from './repository-store.js'

export class RepositoryIndexService {
  constructor(private readonly ollama = new OllamaClient()) {}

  async scanRepository(repositoryId: string): Promise<ScanRepositoryResponse> {
    const repository = repositoryService.getRepository(repositoryId)
    const files = await scanCodeRepository({ rootPath: repository.rootPath })

    repositoryService.updateIndexState(repository.id, {
      fileCount: files.length
    })

    return {
      repositoryId: repository.id,
      fileCount: files.length,
      files: files.map((file) => ({
        relativePath: file.relativePath,
        language: file.language,
        lineCount: file.lineCount
      }))
    }
  }

  async previewChunks(repositoryId: string): Promise<ChunkRepositoryResponse> {
    const { repository, chunks, fileCount } = await this.buildChunks(repositoryId)

    repositoryService.updateIndexState(repository.id, {
      fileCount,
      chunkCount: chunks.length
    })

    return {
      repositoryId: repository.id,
      fileCount,
      chunkCount: chunks.length,
      chunks: chunks.map(toChunkSummary)
    }
  }

  async indexRepository(repositoryId: string): Promise<IndexRepositoryResponse> {
    const { repository, chunks, fileCount } = await this.buildChunks(repositoryId)

    repositoryService.updateIndexState(repository.id, {
      fileCount,
      chunkCount: chunks.length,
      status: 'indexing'
    })

    for (const chunkBatch of splitIntoBatches(chunks, config.ollama.embedBatchSize)) {
      const embeddings = await this.ollama.embed(chunkBatch.map((chunk) => chunk.content))
      await vectorStore.upsert(toVectorChunks(repository.id, chunkBatch, embeddings))
    }

    const updatedRepository = repositoryService.updateIndexState(repository.id, {
      fileCount,
      chunkCount: chunks.length,
      status: 'indexed'
    })

    return {
      repositoryId: updatedRepository.id,
      fileCount: updatedRepository.fileCount,
      chunkCount: updatedRepository.chunkCount,
      status: updatedRepository.status
    }
  }

  async searchRepository(repositoryId: string, query: string, limit: number): Promise<SearchCodeResponse> {
    const repository = repositoryService.getRepository(repositoryId)
    const [embedding] = await this.ollama.embed(query)
    const vectorResults = await vectorStore.search(embedding, Math.max(limit * 3, 10), {
      filter: {
        repositoryId: repository.id
      }
    })
    const localChunks = chunkCodeFiles({
      repositoryId: repository.id,
      files: await scanCodeRepository({ rootPath: repository.rootPath })
    })
    const rerankedResults = rerankSearchResults(query, vectorResults, localChunks)
      .slice(0, limit)

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
        preview: buildPreview(result.chunk.content)
      }))
    }
  }

  async askRepository(repositoryId: string, question: string, limit: number): Promise<AskRepositoryResponse> {
    const searchResponse = await this.searchRepository(repositoryId, question, limit)
    const prompt = buildCodeQuestionPrompt(question, searchResponse.results)
    const answer = await this.ollama.generate(prompt)

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
        score: result.score
      }))
    }
  }

  async prepareAskContext(repositoryId: string, question: string, limit: number) {
    const searchResponse = await this.searchRepository(repositoryId, question, limit)

    return {
      prompt: buildCodeQuestionPrompt(question, searchResponse.results),
      citations: searchResponse.results.map((result) => ({
        chunkId: result.chunkId,
        relativePath: result.relativePath,
        language: result.language,
        startLine: result.startLine,
        endLine: result.endLine,
        score: result.score
      }))
    }
  }

  streamAnswer(prompt: string) {
    return this.ollama.generateStream(prompt)
  }

  private async buildChunks(repositoryId: string) {
    const repository = repositoryService.getRepository(repositoryId)
    const files = await scanCodeRepository({ rootPath: repository.rootPath })
    const chunks = chunkCodeFiles({
      repositoryId: repository.id,
      files
    })

    return {
      repository,
      files,
      fileCount: files.length,
      chunks
    }
  }
}

function splitIntoBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = []

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize))
  }

  return batches
}

function toVectorChunks(repositoryId: string, chunks: CodeChunk[], embeddings: number[][]) {
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
      chunkType: chunk.chunkType
    }
  }))
}

interface RerankedSearchResult {
  chunk: CodeChunk
  score: number
  vectorScore: number
  keywordScore: number
}

function buildPreview(content: string) {
  return content.replace(/\s+/g, ' ').slice(0, 220)
}

function buildCodeQuestionPrompt(question: string, contexts: SearchCodeResponse['results']) {
  const contextText = contexts.length
    ? contexts
        .map(
          (context, index) =>
            `片段 ${index + 1}: ${context.relativePath}:${context.startLine}-${context.endLine}\n${context.preview}`
        )
        .join('\n\n')
    : '没有检索到相关代码片段。'

  return [
    '你是代码仓库分析助手。',
    '请基于给定代码片段回答问题。回答要说明相关文件路径和行号；如果上下文不足，请明确说明。',
    '',
    contextText,
    '',
    `问题：${question}`,
    '回答：'
  ].join('\n')
}

function rerankSearchResults(
  query: string,
  vectorResults: Awaited<ReturnType<typeof vectorStore.search>>,
  localChunks: CodeChunk[]
): RerankedSearchResult[] {
  const vectorScoreById = new Map(vectorResults.map((result) => [result.id, result.score]))
  const candidates = new Map<string, CodeChunk>()

  for (const chunk of localChunks) {
    const keywordScore = calculateKeywordScore(query, chunk)
    if (keywordScore > 0) {
      candidates.set(chunk.id, chunk)
    }
  }

  for (const result of vectorResults) {
    const localChunk = localChunks.find((chunk) => chunk.id === result.id)
    if (localChunk) {
      candidates.set(localChunk.id, localChunk)
    }
  }

  return [...candidates.values()]
    .map((chunk) => {
      const vectorScore = vectorScoreById.get(chunk.id) ?? 0
      const keywordScore = calculateKeywordScore(query, chunk)

      return {
        chunk,
        vectorScore,
        keywordScore,
        score: vectorScore + keywordScore
      }
    })
    .sort((left, right) => right.score - left.score)
}

function calculateKeywordScore(query: string, chunk: CodeChunk) {
  const normalizedQuery = query.toLowerCase()
  const normalizedPath = chunk.relativePath.toLowerCase()
  const normalizedContent = chunk.content.toLowerCase()
  const tokens = extractSearchTokens(normalizedQuery)
  let score = 0

  for (const token of tokens) {
    if (normalizedPath.includes(token)) {
      score += 2
    }

    if (normalizedContent.includes(token)) {
      score += 1
    }
  }

  return score
}

function extractSearchTokens(query: string) {
  const directTokens = query
    .split(/[^a-z0-9_\u4e00-\u9fa5]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  const mappedTokens = new Set(directTokens)
  const synonymMap = new Map([
    ['扫描器', ['scanner', 'scan']],
    ['扫描', ['scanner', 'scan']],
    ['代码扫描器', ['code-scanner', 'scanner', 'scan']],
    ['分片', ['chunker', 'chunk']],
    ['索引', ['index']],
    ['仓库', ['repository', 'repositories']],
    ['向量', ['vector']],
    ['模型', ['ollama']],
    ['接口', ['routes', 'route']]
  ])

  for (const [keyword, synonyms] of synonymMap) {
    if (query.includes(keyword)) {
      for (const synonym of synonyms) {
        mappedTokens.add(synonym)
      }
    }
  }

  return [...mappedTokens].filter((token) => token.length >= 2)
}

function toChunkSummary(chunk: CodeChunk): CodeChunkSummary {
  return {
    id: chunk.id,
    relativePath: chunk.relativePath,
    language: chunk.language,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    chunkType: chunk.chunkType
  }
}
