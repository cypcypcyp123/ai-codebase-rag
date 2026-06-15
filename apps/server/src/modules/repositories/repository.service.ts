import type {
  CodeRepository,
  RepositoryFramework,
  RepositoryStatus
} from '@ai-codebase-rag/shared'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '../../shared/database.js'
import { HttpError } from '../../shared/http-error.js'

interface CreateRepositoryInput {
  id?: string
  name: string
  rootPath: string
}

interface UpdateIndexStateInput {
  fileCount?: number
  chunkCount?: number
  status?: RepositoryStatus
}

interface RepositoryRow {
  id: string
  name: string
  root_path: string
  framework: RepositoryFramework
  status: RepositoryStatus
  file_count: number
  chunk_count: number
  created_at: string
  updated_at: string
}

export class RepositoryService {
  listRepositories(): CodeRepository[] {
    const rows = db
      .prepare('SELECT * FROM repositories ORDER BY created_at DESC')
      .all() as RepositoryRow[]

    return rows.map(toCodeRepository)
  }

  getRepository(id: string): CodeRepository {
    const row = db
      .prepare('SELECT * FROM repositories WHERE id = ?')
      .get(id) as RepositoryRow | undefined

    if (!row) {
      throw new HttpError('代码仓库不存在', 404)
    }

    return toCodeRepository(row)
  }

  async createRepository(input: CreateRepositoryInput): Promise<CodeRepository> {
    const rootPath = path.resolve(input.rootPath)
    await assertDirectory(rootPath)

    const now = new Date().toISOString()
    const repository: CodeRepository = {
      id: input.id ?? randomUUID(),
      name: input.name,
      rootPath,
      framework: await detectRepositoryFramework(rootPath),
      status: 'pending',
      fileCount: 0,
      chunkCount: 0,
      createdAt: now,
      updatedAt: now
    }

    db.prepare(`
      INSERT INTO repositories (
        id,
        name,
        root_path,
        framework,
        status,
        file_count,
        chunk_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      repository.id,
      repository.name,
      repository.rootPath,
      repository.framework,
      repository.status,
      repository.fileCount,
      repository.chunkCount,
      repository.createdAt,
      repository.updatedAt
    )

    return repository
  }

  updateIndexState(id: string, input: UpdateIndexStateInput): CodeRepository {
    const repository = this.getRepository(id)
    const updatedRepository: CodeRepository = {
      ...repository,
      fileCount: input.fileCount ?? repository.fileCount,
      chunkCount: input.chunkCount ?? repository.chunkCount,
      status: input.status ?? repository.status,
      updatedAt: new Date().toISOString()
    }

    db.prepare(`
      UPDATE repositories
      SET file_count = ?, chunk_count = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updatedRepository.fileCount,
      updatedRepository.chunkCount,
      updatedRepository.status,
      updatedRepository.updatedAt,
      id
    )

    return updatedRepository
  }
}

function toCodeRepository(row: RepositoryRow): CodeRepository {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    framework: row.framework,
    status: row.status,
    fileCount: row.file_count,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function assertDirectory(rootPath: string) {
  try {
    const stat = await fs.stat(rootPath)
    if (!stat.isDirectory()) {
      throw new HttpError('rootPath 必须是目录', 400)
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    throw new HttpError('rootPath 不存在或无法访问', 400)
  }
}

async function detectRepositoryFramework(rootPath: string): Promise<RepositoryFramework> {
  const packageJsonPath = path.join(rootPath, 'package.json')

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }

    if ('vue' in dependencies) {
      return 'vue'
    }

    if ('react' in dependencies || 'next' in dependencies) {
      return 'react'
    }

    if ('fastify' in dependencies || 'express' in dependencies || '@nestjs/core' in dependencies) {
      return 'node'
    }
  } catch {
    return 'unknown'
  }

  return 'unknown'
}
