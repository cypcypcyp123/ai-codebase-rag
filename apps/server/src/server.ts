import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { registerChatRoutes } from './modules/chat/chat.routes.js'
import { registerDocumentRoutes } from './modules/documents/document.routes.js'
import { registerHealthRoutes } from './modules/health/health.routes.js'
import { registerRepositoryRoutes } from './modules/repositories/repository.routes.js'
import { config } from './shared/config.js'

export async function buildServer() {
  // Fastify 是 Node.js Web 框架，类似前端里的 Vue app 实例。
  // 所有接口、插件、中间件都会注册到这个 app 上。
  const app = Fastify({
    logger: true
  })

  // CORS 允许前端 Vite 开发服务器跨端口访问后端接口。
  await app.register(cors, {
    origin: true
  })

  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSizeBytes
    }
  })

  // 路由按业务模块拆开：健康检查、聊天、文档。
  // prefix 会拼到模块路由前面，例如 health.routes.ts 里的 GET '/' 实际路径是 GET /api/health。
  await app.register(registerHealthRoutes, { prefix: '/api/health' })
  await app.register(registerChatRoutes, { prefix: '/api/chat' })
  await app.register(registerDocumentRoutes, { prefix: '/api/documents' })
  await app.register(registerRepositoryRoutes, { prefix: '/api/repositories' })

  return app
}
