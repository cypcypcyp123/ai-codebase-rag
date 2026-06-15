import type {
  AskRepositoryRequest,
  AskRepositoryResponse,
  AskRepositoryCitation,
  ChatRequest,
  ChatResponse,
  ChunkRepositoryResponse,
  CodeRepository,
  HealthResponse,
  IndexRepositoryResponse,
  KnowledgeDocument,
  ScanRepositoryResponse,
  SearchCodeRequest,
  SearchCodeResponse
} from '@ai-codebase-rag/shared'
import { requestForm, requestJson } from './http'
import { resolveApiUrl } from './http'

interface CreateRepositoryRequest {
  name: string
  rootPath: string
}

export function getHealth() {
  return requestJson<HealthResponse>('/api/health')
}

export function listDocuments() {
  return requestJson<KnowledgeDocument[]>('/api/documents')
}

export function askKnowledgeBase(payload: ChatRequest) {
  return requestJson<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function listRepositories() {
  return requestJson<CodeRepository[]>('/api/repositories')
}

export function createRepository(payload: CreateRepositoryRequest) {
  return requestJson<CodeRepository>('/api/repositories', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

interface UploadRepositoryZipOptions {
  onProgress?: (percent: number) => void
}

export function uploadRepositoryZip(file: File, name?: string, options: UploadRepositoryZipOptions = {}) {
  const formData = new FormData()
  formData.append('file', file)
  if (name) {
    formData.append('name', name)
  }

  return uploadFormWithProgress<CodeRepository>('/api/repositories/upload', formData, options)
}

export function scanRepository(repositoryId: string) {
  return requestJson<ScanRepositoryResponse>(`/api/repositories/${repositoryId}/scan`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function previewRepositoryChunks(repositoryId: string) {
  return requestJson<ChunkRepositoryResponse>(`/api/repositories/${repositoryId}/chunks`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function indexRepository(repositoryId: string) {
  return requestJson<IndexRepositoryResponse>(`/api/repositories/${repositoryId}/index`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function searchRepository(repositoryId: string, payload: SearchCodeRequest) {
  return requestJson<SearchCodeResponse>(`/api/repositories/${repositoryId}/search`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function askRepository(repositoryId: string, payload: AskRepositoryRequest) {
  return requestJson<AskRepositoryResponse>(`/api/repositories/${repositoryId}/ask`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

interface AskRepositoryStreamHandlers {
  onCitations: (citations: AskRepositoryCitation[]) => void
  onDelta: (delta: string) => void
  onError: (message: string) => void
  onDone: () => void
}

export async function askRepositoryStream(
  repositoryId: string,
  payload: AskRepositoryRequest,
  handlers: AskRepositoryStreamHandlers
) {
  const response = await fetch(resolveApiUrl(`/api/repositories/${repositoryId}/ask/stream`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok || !response.body) {
    throw new Error(`请求失败：${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventText of events) {
      handleSseEvent(eventText, handlers)
    }
  }
}

function handleSseEvent(eventText: string, handlers: AskRepositoryStreamHandlers) {
  const eventName = eventText.match(/^event: (.+)$/m)?.[1]
  const dataText = eventText.match(/^data: (.+)$/m)?.[1]

  if (!eventName || !dataText) {
    return
  }

  const data = JSON.parse(dataText) as unknown

  if (eventName === 'citations') {
    handlers.onCitations(data as AskRepositoryCitation[])
    return
  }

  if (eventName === 'delta') {
    handlers.onDelta(String(data))
    return
  }

  if (eventName === 'error') {
    handlers.onError((data as { message?: string }).message ?? '流式问答失败')
    return
  }

  if (eventName === 'done') {
    handlers.onDone()
  }
}

function uploadFormWithProgress<T>(
  path: string,
  body: FormData,
  options: UploadRepositoryZipOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', resolveApiUrl(path))
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }

      options.onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(parseErrorMessage(xhr.responseText, xhr.status)))
        return
      }

      resolve(JSON.parse(xhr.responseText) as T)
    }
    xhr.onerror = () => reject(new Error('上传失败，请确认后端服务是否正常运行'))
    xhr.send(body)
  })
}

function parseErrorMessage(responseText: string, status: number) {
  if (!responseText) {
    return `请求失败：${status}`
  }

  try {
    const data = JSON.parse(responseText) as { message?: string }
    return data.message ?? `请求失败：${status}`
  } catch {
    return `请求失败：${status}`
  }
}
