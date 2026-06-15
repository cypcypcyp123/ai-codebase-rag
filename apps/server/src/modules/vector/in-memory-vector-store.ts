import type {
  VectorChunk,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore
} from './vector-store.js'

// 这是学习阶段用的内存向量库。
// 优点：不用安装数据库，能先跑通 RAG 流程。
// 缺点：数据不持久，服务重启就没了。
export class InMemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, VectorChunk>()

  async upsert(chunks: VectorChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk)
    }
  }

  async search(
    embedding: number[],
    limit: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    return [...this.chunks.values()]
      .filter((chunk) => matchesFilter(chunk.metadata ?? {}, options.filter ?? {}))
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(embedding, chunk.embedding)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
  }
}

function matchesFilter(
  metadata: Record<string, string | number | boolean>,
  filter: Record<string, string | number | boolean>
) {
  return Object.entries(filter).every(([key, value]) => metadata[key] === value)
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }

  if (!leftNorm || !rightNorm) {
    return 0
  }

  // 余弦相似度：衡量两个向量方向是否接近。
  // 在 embedding 场景里，方向越接近，通常表示文本语义越相似。
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}
