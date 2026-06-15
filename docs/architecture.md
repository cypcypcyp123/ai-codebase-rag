# 架构说明

## 技术栈

- 前端：Vue 3 + TypeScript + Element Plus
- 后端：Node.js + Fastify + TypeScript
- 本地模型：Ollama，聊天模型 `qwen3.5:4b`，向量模型 `nomic-embed-text`
- 元数据数据库：SQLite，文件位置 `data/app.db`
- 向量数据库：ChromaDB，Docker 启动，数据位置 `data/chroma`

## 数据分工

SQLite 保存业务元数据，例如：

- 仓库 ID
- 仓库名称
- 本地源码路径
- 项目类型
- 索引状态
- 文件数量
- 分片数量
- 创建时间和更新时间

ChromaDB 保存向量检索数据，例如：

- 代码分片内容
- embedding 向量
- 文件路径
- 起止行号
- 仓库 ID

因此后端重启后，仓库列表会从 SQLite 恢复；向量检索数据由 ChromaDB 持久化。

## 核心流程

1. 上传 ZIP 或登记本地项目路径。
2. 后端扫描源码文件。
3. 后端按行数把代码切成分片。
4. 后端调用 Ollama `/api/embed` 生成向量。
5. 后端把向量和代码片段写入 ChromaDB。
6. 用户提问时，后端先做向量检索，再把相关代码片段拼进 prompt。
7. 后端调用 Ollama `/api/generate` 生成回答。

## 存储说明

- `data/app.db`：SQLite 数据库，保存仓库元数据。
- `data/chroma`：ChromaDB 数据目录，保存向量数据。
- `uploads/repositories`：上传 ZIP 解压后的源码目录。
- `uploads/tmp`：上传过程中的临时 ZIP 文件目录。

这些目录都属于本地运行数据，不提交到 Git。
