import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OllamaClient } from '../../integrations/ollama/ollama.client.js'
import { HttpError } from '../../shared/http-error.js'
import { vectorStore } from '../vector/vector-store.instance.js'
import { DocumentService } from './document.service.js'

const createDocumentSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1)
})

export async function registerDocumentRoutes(app: FastifyInstance) {
  // routes 层只处理 HTTP 相关事情：取参数、校验参数、返回响应。
  // 真正的业务逻辑交给 DocumentService，避免路由文件越来越胖。
  const documentService = new DocumentService(new OllamaClient(), vectorStore)

  // GET /api/documents
  app.get('/', async () => documentService.listDocuments())

  // POST /api/documents
  // 请求体示例：{ "title": "项目说明", "content": "这里是文档正文" }
  app.post('/', async (request, reply) => {
    const parsed = createDocumentSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new HttpError('标题和内容不能为空', 400)
    }

    const document = await documentService.indexText(parsed.data.title, parsed.data.content)
    return reply.code(201).send(document)
  })
}
