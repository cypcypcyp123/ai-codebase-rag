import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OllamaClient } from '../../integrations/ollama/ollama.client.js'
import { HttpError } from '../../shared/http-error.js'
import { RagService } from '../rag/rag.service.js'
import { vectorStore } from '../vector/vector-store.instance.js'

const chatRequestSchema = z.object({
  question: z.string().trim().min(1),
  knowledgeBaseId: z.string().optional()
})

export async function registerChatRoutes(app: FastifyInstance) {
  // 聊天接口背后走的是 RAG 流程：
  // 用户问题 -> 问题向量化 -> 检索相关文档片段 -> 拼 prompt -> 调用大模型回答。
  const ragService = new RagService(new OllamaClient(), vectorStore)

  // POST /api/chat
  // 请求体示例：{ "question": "这个项目怎么启动？" }
  app.post('/', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new HttpError('问题不能为空', 400)
    }

    const response = await ragService.answerQuestion(parsed.data.question)
    return reply.send(response)
  })
}
