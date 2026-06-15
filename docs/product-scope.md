# AI 代码知识库平台目标

## 项目定位

这是一个可以写进简历的代码仓库智能分析平台，不是普通文档问答系统。

技术栈固定为：

- Vue 3 + TypeScript
- Node.js
- Ollama
- `qwen3.5:4b`
- `nomic-embed-text`
- ChromaDB
- Docker

## 核心功能边界

第一阶段只做这条主链路：

```text
源码上传/选择
  -> zip 解压
  -> 代码文件扫描
  -> 代码分片
  -> nomic-embed-text 向量化
  -> 写入 ChromaDB
  -> 语义检索
  -> 拼接代码上下文
  -> Qwen 生成回答
  -> 返回代码位置引用
```

## 必须体现的简历亮点

- 基于 Ollama 本地部署大模型，避免依赖云端 API。
- 基于 `nomic-embed-text` 对源码片段进行向量化。
- 基于 ChromaDB 构建代码向量索引。
- 支持 Vue、React、Node 项目源码分析。
- 支持根据文件路径、语言、模块、依赖关系进行代码定位。
- 支持“这个功能在哪里实现”“某个模块依赖了什么”“这段接口从哪里被调用”等问答。
- 使用 Docker 部署 ChromaDB 向量数据库服务。

## 代码分片元数据

每个代码分片进入 ChromaDB 时，至少要带这些 metadata：

- `repositoryId`：仓库 ID
- `filePath`：文件路径
- `language`：语言或框架类型
- `startLine`：起始行
- `endLine`：结束行
- `chunkType`：`file`、`function`、`component`、`route`、`config`
- `symbols`：函数名、组件名、导出名
- `imports`：当前片段依赖的模块

这些字段决定平台是否像“代码分析工具”，而不是普通文本问答。

## 下一步开发顺序

1. 接入 Docker 版 ChromaDB，替换当前内存向量仓库。
2. 新增代码仓库模块：记录项目名称、路径、技术栈、索引状态。
3. 新增代码扫描器：递归读取 `.vue`、`.ts`、`.tsx`、`.js`、`.jsx`、`.json` 等源码与配置文件。
4. 新增代码分片器：先按文件和行数分片，后续再升级为 AST 分片。
5. 新增代码索引接口：扫描 -> 分片 -> embedding -> upsert ChromaDB。
6. 新增语义检索接口：返回匹配代码片段、文件路径和行号。
7. 新增代码问答接口：回答必须带代码引用来源。
8. 前端提供 zip 上传、索引流水线和代码问答工作台。
