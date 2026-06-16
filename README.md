# AI 代码知识库平台

本项目定位为代码仓库智能分析平台，支持源码上传、代码索引构建、语义检索及智能问答。后端使用 Node.js + TypeScript，前端使用 Vue 3 + Vite，向量数据库使用 ChromaDB，模型默认对接本地 Ollama：

- 对话模型：`qwen3.5:4b`
- 向量模型：`nomic-embed-text`
- 向量数据库：ChromaDB

## 目录结构

```text
apps/
  server/          Node.js API、Ollama 适配、RAG 服务
  web/             Vue 3 前端应用
packages/
  shared/          前后端共享类型
docs/
  architecture.md  架构与影响范围说明
  product-scope.md 简历项目目标与功能边界
```

## 本地服务要求

请先确认 Ollama 已启动，并已拉取模型：

```bash
ollama pull qwen3.5:4b
ollama pull nomic-embed-text
```

ChromaDB 使用 Docker 启动：

```bash
docker compose up -d chromadb
```

## 开发命令

安装依赖后可使用：

```bash
npm install
npm run dev:server
npm run dev:web
```

