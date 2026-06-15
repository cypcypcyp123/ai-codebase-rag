import { buildServer } from './server.js'
import { config } from './shared/config.js'

// main.ts 是后端程序入口：负责创建服务实例，并监听端口。
// 你可以把它理解成浏览器里 main.ts 创建 Vue 应用的后端版本。
const app = await buildServer()

await app.listen({
  host: config.server.host,
  port: config.server.port
})

app.log.info(`API server listening on ${config.server.host}:${config.server.port}`)
