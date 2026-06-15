import type { ChatCitation, ChatResponse } from '@ai-codebase-rag/shared'
import { OllamaClient } from '../../integrations/ollama/ollama.client.js'
import type { VectorStore } from '../vector/vector-store.js'

// RAG = Retrieval-Augmented Generation，中文可以理解为“先检索资料，再让模型回答”。
// 这个 service 只关心问答流程，不关心 HTTP，也不关心向量仓库具体用内存还是数据库。
export class RagService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly vectorStore: VectorStore
  ) {}

  async answerQuestion(question: string): Promise<ChatResponse> {
    // 1. 把问题转成向量。
    const [questionEmbedding] = await this.ollama.embed(question)

    // 2. 用问题向量去知识库里找最相似的 5 个文档片段。
    const contexts = await this.vectorStore.search(questionEmbedding, 5)

    // 3. 把检索到的资料和用户问题组装成 prompt。
    const prompt = buildPrompt(question, contexts.map((context) => context.content))

    // 4. 调用大模型生成答案。
    const answer = await this.ollama.generate(prompt)

    return {
      answer,
      citations: contexts.map<ChatCitation>((context) => ({
        documentId: context.documentId,
        title: context.title,
        chunkId: context.id,
        score: context.score
      }))
    }
  }
}

function buildPrompt(question: string, contexts: string[]) {
  const contextText = contexts.length
    ? contexts.map((context, index) => `资料 ${index + 1}:\n${context}`).join('\n\n')
    : '暂无可用资料。'

  // prompt 的核心要求：限制模型只基于资料回答，减少胡编。
  return [
    '你是一个企业内部知识库助手。',
    '请只基于给定资料回答问题；如果资料不足，请明确说明无法从知识库中确认。',
    '',
    contextText,
    '',
    `问题：${question}`,
    '回答：'
  ].join('\n')
}
