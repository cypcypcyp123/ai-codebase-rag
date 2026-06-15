import path from 'node:path'

const extensionLanguageMap = new Map([
  ['.vue', 'vue'],
  ['.ts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.js', 'javascript'],
  ['.jsx', 'jsx'],
  ['.json', 'json']
])

export function isSupportedCodeFile(filePath: string) {
  return extensionLanguageMap.has(path.extname(filePath).toLowerCase())
}

export function detectLanguage(filePath: string) {
  return extensionLanguageMap.get(path.extname(filePath).toLowerCase()) ?? 'unknown'
}
