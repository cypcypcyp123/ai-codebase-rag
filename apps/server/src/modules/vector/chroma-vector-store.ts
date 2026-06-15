import { ChromaClient } from 'chromadb'
import { config } from '../../shared/config.js'
import type {
  VectorChunk,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore
} from './vector-store.js'

type ChromaQueryResult = {
  ids?: string[][]
  documents?: (string | null)[][]
  distances?: (number | null)[][]
  metadatas?: (Record<string, unknown> | null)[][]
}

// ChromaDB 向量仓库实现。
// 这里仍然由 Ollama 负责生成 embedding，ChromaDB 只负责存储和相似度检索。
export class ChromaVectorStore implements VectorStore {
  private readonly client = new ChromaClient({
    path: config.chroma.url
  })

  private async getCollection() {
    return this.client.getOrCreateCollection({
      name: config.chroma.collection
    })
  }

  async upsert(chunks: VectorChunk[]): Promise<void> {
    if (!chunks.length) {
      return
    }

    const collection = await this.getCollection()

    await collection.upsert({
      ids: chunks.map((chunk) => chunk.id),
      documents: chunks.map((chunk) => chunk.content),
      embeddings: chunks.map((chunk) => chunk.embedding),
      metadatas: chunks.map((chunk) => ({
        documentId: chunk.documentId,
        title: chunk.title,
        ...chunk.metadata
      }))
    })
  }

  async search(
    embedding: number[],
    limit: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const collection = await this.getCollection()
    const result = (await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: options.filter
    })) as ChromaQueryResult

    const ids = result.ids?.[0] ?? []
    const documents = result.documents?.[0] ?? []
    const distances = result.distances?.[0] ?? []
    const metadatas = result.metadatas?.[0] ?? []

    return ids.map((id, index) => {
      const metadata = metadatas[index] ?? {}
      const distance = distances[index] ?? 1

      return {
        id,
        documentId: String(metadata.documentId ?? ''),
        title: String(metadata.title ?? ''),
        content: documents[index] ?? '',
        embedding: [],
        metadata: normalizeMetadata(metadata),
        score: 1 - distance
      }
    })
  }
}

function normalizeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1]
      return ['string', 'number', 'boolean'].includes(typeof value)
    })
  )
}
