const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'

export function resolveApiUrl(path: string) {
  return `${apiBaseUrl}${path}`
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers
    }
  })

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`)
  }

  return (await response.json()) as T
}

export async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    body
  })

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`)
  }

  return (await response.json()) as T
}
