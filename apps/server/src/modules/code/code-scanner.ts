import type { ScannedCodeFile } from '@ai-codebase-rag/shared'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ignoredFiles, shouldIgnoreDirectory } from './code-ignore.js'
import { detectLanguage, isSupportedCodeFile } from './code-language.js'

export interface ScanCodeRepositoryOptions {
  rootPath: string
}

// 代码扫描器只负责把仓库里的源码文件找出来。
// 它不做 embedding、不写 ChromaDB，避免扫描逻辑和索引逻辑耦合。
export async function scanCodeRepository(options: ScanCodeRepositoryOptions): Promise<ScannedCodeFile[]> {
  const rootPath = path.resolve(options.rootPath)
  const files: ScannedCodeFile[] = []

  await walkDirectory(rootPath, rootPath, files)
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

async function walkDirectory(rootPath: string, currentPath: string, files: ScannedCodeFile[]) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name)

    if (entry.isDirectory()) {
      const relativePath = normalizeRelativePath(path.relative(rootPath, entryPath))

      if (shouldIgnoreDirectory(entry.name, relativePath)) {
        continue
      }

      await walkDirectory(rootPath, entryPath, files)
      continue
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name) || !isSupportedCodeFile(entryPath)) {
      continue
    }

    const content = await fs.readFile(entryPath, 'utf8')
    const relativePath = normalizeRelativePath(path.relative(rootPath, entryPath))

    files.push({
      filePath: entryPath,
      relativePath,
      language: detectLanguage(entryPath),
      content,
      lineCount: countLines(content)
    })
  }
}

function countLines(content: string) {
  if (!content) {
    return 0
  }

  return content.split(/\r\n|\r|\n/).length
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join('/')
}
