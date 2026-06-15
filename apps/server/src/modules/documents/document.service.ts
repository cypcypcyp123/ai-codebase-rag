import type { KnowledgeDocument } from '@ai-codebase-rag/shared'
import { randomUUID } from 'node:crypto'
import { OllamaClient } from '../../integrations/ollama/ollama.client.js'
import type { VectorStore } from '../vector/vector-store.js'

// service 层负责业务流程。
// 文档入库流程：保存文档信息 -> 切分正文 -> 调 embedding -> 写入向量仓库。
export class DocumentService {
  // 当前先用内存保存文档列表，方便学习流程。
  // 风险：服务重启后会丢失，后续应替换成数据库。
  private readonly documents = new Map<string, KnowledgeDocument>()

  constructor(
    private readonly ollama: OllamaClient,
    private readonly vectorStore: VectorStore
  ) {}

  listDocuments(): KnowledgeDocument[] {
    return [...this.documents.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  async indexText(title: string, content: string): Promise<KnowledgeDocument> {
    const documentId = randomUUID()

    // RAG 不会把整篇文档一次性塞给模型，而是先切成小段。
    const chunks = splitText(content)

    // 每个文本分片都转成向量，后续用户提问时用向量相似度找到相关分片。
    const embeddings = await this.ollama.embed(chunks)

    await this.vectorStore.upsert(
      chunks.map((chunk, index) => ({
        id: `${documentId}:${index}`,
        documentId,
        title,
        content: chunk,
        embedding: embeddings[index] ?? []
      }))
    )

    const document: KnowledgeDocument = {
      id: documentId,
      title,
      source: 'manual',
      status: 'indexed',
      createdAt: new Date().toISOString(),
      chunkCount: chunks.length
    }

    this.documents.set(document.id, document)
    return document
  }
}

function splitText(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }

  // 初始分片策略保持简单，后续可按 Markdown 标题、代码块和 token 数优化。
  return normalized.match(/[\s\S]{1,800}/g) ?? []
}
