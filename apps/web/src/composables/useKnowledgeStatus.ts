import type { HealthResponse, KnowledgeDocument } from '@ai-codebase-rag/shared'
import { computed, onMounted, readonly, shallowRef } from 'vue'
import { getHealth, listDocuments } from '@/api/knowledge'

export function useKnowledgeStatus() {
  const health = shallowRef<HealthResponse | null>(null)
  const documents = shallowRef<KnowledgeDocument[]>([])
  const loading = shallowRef(false)
  const errorMessage = shallowRef('')

  const indexedCount = computed(() =>
    documents.value.filter((document) => document.status === 'indexed').length
  )

  async function refresh() {
    loading.value = true
    errorMessage.value = ''

    try {
      const [healthResult, documentResult] = await Promise.all([getHealth(), listDocuments()])
      health.value = healthResult
      documents.value = documentResult
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '服务状态读取失败'
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)

  return {
    health: readonly(health),
    documents: readonly(documents),
    loading: readonly(loading),
    errorMessage: readonly(errorMessage),
    indexedCount,
    refresh
  }
}
