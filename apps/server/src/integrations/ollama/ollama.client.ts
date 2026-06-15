import { config } from '../../shared/config.js'
import { HttpError } from '../../shared/http-error.js'

interface OllamaGenerateResponse {
  response: string
}

interface OllamaGenerateStreamResponse {
  response?: string
  done?: boolean
}

interface OllamaEmbedResponse {
  embeddings?: number[][]
  embedding?: number[]
}

// 这个类只负责和 Ollama 通信。
// 好处是业务层不用关心 Ollama 的 URL、接口路径、请求格式，后续换模型服务时也更好替换。
export class OllamaClient {
  constructor(private readonly baseUrl = config.ollama.baseUrl) {}

  // 调用 Ollama 的生成接口：输入 prompt，返回模型生成的文本。
  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.chatModel,
        prompt,
        stream: false
      })
    })

    await assertOllamaResponse(response, 'generate')

    const data = (await response.json()) as OllamaGenerateResponse
    return data.response
  }

  async *generateStream(prompt: string): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.chatModel,
        prompt,
        stream: true
      })
    })

    if (!response.ok) {
      await assertOllamaResponse(response, 'stream')
    }

    if (!response.body) {
      throw new HttpError('Ollama stream failed: empty response body', 502)
    }

    const decoder = new TextDecoder()
    let buffer = ''

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) {
          continue
        }

        const data = JSON.parse(trimmedLine) as OllamaGenerateStreamResponse
        if (data.response) {
          yield data.response
        }

        if (data.done) {
          return
        }
      }
    }
  }

  // 调用 Ollama 的 embedding 接口：把文本变成向量。
  // 向量是 number[]，后续用于“相似度搜索”，也就是 RAG 里找相关资料的步骤。
  async embed(input: string | string[]): Promise<number[][]> {
    const values = Array.isArray(input) ? input : [input]
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.embedModel,
        input: values
      })
    })

    await assertOllamaResponse(response, 'embed')

    const data = (await response.json()) as OllamaEmbedResponse
    if (data.embeddings) {
      return data.embeddings
    }

    return data.embedding ? [data.embedding] : []
  }
}

async function assertOllamaResponse(response: Response, action: string) {
  if (response.ok) {
    return
  }

  const detail = await response.text()
  const message = detail.trim()
    ? `Ollama ${action} failed: ${response.statusText}; ${detail}`
    : `Ollama ${action} failed: ${response.statusText}`

  throw new HttpError(message, response.status)
}
