export interface VectorChunk {
  id: string
  documentId: string
  title: string
  content: string
  embedding: number[]
  metadata?: Record<string, string | number | boolean>
}

export interface VectorSearchResult extends VectorChunk {
  // score 是相似度分数，越大代表越相关。
  score: number
}

export interface VectorSearchOptions {
  filter?: Record<string, string | number | boolean>
}

// 向量仓库接口。
// 现在实现是内存版，后续换 Qdrant、pgvector、Milvus 时，只要实现这两个方法即可。
export interface VectorStore {
  upsert(chunks: VectorChunk[]): Promise<void>
  search(embedding: number[], limit: number, options?: VectorSearchOptions): Promise<VectorSearchResult[]>
}
