# 后端学习与重搭路线

这份项目后端不是为了炫技，而是把一个 AI 知识库拆成几个容易理解的层。你可以先看懂，再自己从零重搭一遍。

## 先看请求流向

以 `POST /api/chat` 为例：

```text
main.ts
  -> server.ts
    -> chat.routes.ts
      -> RagService
        -> OllamaClient
        -> VectorStore
```

对应含义：

- `main.ts`：程序入口，启动 HTTP 服务。
- `server.ts`：创建 Fastify app，注册插件和业务路由。
- `*.routes.ts`：HTTP 层，只负责参数校验和返回响应。
- `*.service.ts`：业务层，负责真正的业务流程。
- `integrations/ollama`：外部服务适配层，只负责调用 Ollama。
- `vector`：向量仓库抽象，后续可以从内存替换成数据库。

## 建议你从零重搭的顺序

1. 只写一个最小 Fastify 服务

```ts
import Fastify from 'fastify'

const app = Fastify({ logger: true })

app.get('/api/health', async () => {
  return { ok: true }
})

await app.listen({ host: '127.0.0.1', port: 3000 })
```

2. 把 `app.get('/api/health')` 拆到 `health.routes.ts`

目标：理解“路由注册”。

3. 增加 `config.ts`

目标：理解为什么端口、模型名、Ollama 地址不写死在代码里。

4. 增加 `OllamaClient`

目标：理解后端如何用 `fetch` 调另一个 HTTP 服务。

5. 增加 `DocumentService`

目标：理解 service 层如何承载业务流程，而不是把逻辑堆在 route 里。

6. 增加 `VectorStore`

目标：理解接口抽象。先用内存版，后续再换真实向量数据库。

7. 增加 `RagService`

目标：串起 RAG 流程：问题向量化、检索、拼 prompt、模型回答。

## 每个文件该怎么看

- [main.ts](../apps/server/src/main.ts)：先看这里，理解服务怎么启动。
- [server.ts](../apps/server/src/server.ts)：看路由是怎么挂到 `/api/...` 的。
- [health.routes.ts](../apps/server/src/modules/health/health.routes.ts)：最简单的接口。
- [ollama.client.ts](../apps/server/src/integrations/ollama/ollama.client.ts)：学习如何调用本地模型服务。
- [document.routes.ts](../apps/server/src/modules/documents/document.routes.ts)：学习 POST 参数校验。
- [document.service.ts](../apps/server/src/modules/documents/document.service.ts)：学习文档入库流程。
- [rag.service.ts](../apps/server/src/modules/rag/rag.service.ts)：学习 RAG 问答主流程。
- [vector-store.ts](../apps/server/src/modules/vector/vector-store.ts)：学习为什么要先定义接口。

## 你现在最该掌握的后端概念

- HTTP 方法：`GET` 读取，`POST` 创建或提交。
- 路由：URL 到处理函数的映射。
- 请求体：前端传给后端的 JSON。
- 参数校验：不要相信前端传来的数据。
- service：承载业务流程。
- integration/client：封装外部服务调用。
- interface：隔离具体实现，方便以后替换。

## 不建议一开始就做的事

- 不要一上来接数据库、登录权限、Docker、队列、缓存。
- 不要一开始就追求目录特别完整。
- 不要把所有代码都写进一个路由文件。

先跑通一条最小链路，比一次性搭完整架构更适合学习。
