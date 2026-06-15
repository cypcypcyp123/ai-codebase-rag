import type { CodeChunk, ScannedCodeFile } from '@ai-codebase-rag/shared'

const DEFAULT_LINES_PER_CHUNK = 40

export interface ChunkCodeFilesOptions {
  repositoryId: string
  files: ScannedCodeFile[]
  linesPerChunk?: number
}

// 第一版按行数分片，先保证稳定、可解释。
// 后续可以升级为 AST 分片：按函数、组件、路由、导出符号切分。
export function chunkCodeFiles(options: ChunkCodeFilesOptions): CodeChunk[] {
  const linesPerChunk = options.linesPerChunk ?? DEFAULT_LINES_PER_CHUNK

  return options.files.flatMap((file) => chunkCodeFile(options.repositoryId, file, linesPerChunk))
}

function chunkCodeFile(repositoryId: string, file: ScannedCodeFile, linesPerChunk: number): CodeChunk[] {
  const lines = file.content.split(/\r\n|\r|\n/)
  const chunks: CodeChunk[] = []

  for (let startIndex = 0; startIndex < lines.length; startIndex += linesPerChunk) {
    const endIndex = Math.min(startIndex + linesPerChunk, lines.length)
    const startLine = startIndex + 1
    const endLine = endIndex
    const content = lines.slice(startIndex, endIndex).join('\n').trim()

    if (!content) {
      continue
    }

    chunks.push({
      id: `${repositoryId}:${file.relativePath}:${startLine}-${endLine}`,
      repositoryId,
      filePath: file.filePath,
      relativePath: file.relativePath,
      language: file.language,
      startLine,
      endLine,
      content,
      chunkType: 'file'
    })
  }

  return chunks
}
