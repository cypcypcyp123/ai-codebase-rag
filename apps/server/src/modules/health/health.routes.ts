import type { FastifyInstance } from 'fastify'
import type { HealthResponse } from '@ai-codebase-rag/shared'
import { config } from '../../shared/config.js'

export async function registerHealthRoutes(app: FastifyInstance) {
  // GET /api/health
  // 用来给前端或部署平台确认：后端是否启动、当前连接哪个 Ollama 模型。
  app.get('/', async (): Promise<HealthResponse> => ({
    ok: true,
    ollama: {
      baseUrl: config.ollama.baseUrl,
      chatModel: config.ollama.chatModel,
      embedModel: config.ollama.embedModel
    },
    chroma: {
      host: config.chroma.host,
      port: config.chroma.port,
      collection: config.chroma.collection
    }
  }))
}
