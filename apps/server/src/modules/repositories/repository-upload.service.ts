import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { HttpError } from '../../shared/http-error.js'
import { repositoryService } from './repository-store.js'

const uploadRoot = path.resolve(process.cwd(), '../../uploads/repositories')

interface UploadRepositoryInput {
  name: string
  filename: string
  zipPath: string
}

export class RepositoryUploadService {
  async uploadZip(input: UploadRepositoryInput) {
    if (!input.filename.toLowerCase().endsWith('.zip')) {
      throw new HttpError('只支持上传 .zip 压缩包', 400)
    }

    const repositoryId = randomUUID()
    const targetPath = path.join(uploadRoot, repositoryId)
    await fs.mkdir(targetPath, { recursive: true })
    await extractZip(input.zipPath, targetPath)

    return repositoryService.createRepository({
      id: repositoryId,
      name: input.name,
      rootPath: await resolveRepositoryRoot(targetPath)
    })
  }
}

async function extractZip(zipPath: string, targetPath: string) {
  const zip = new AdmZip(zipPath)
  const normalizedTargetPath = path.resolve(targetPath)

  for (const entry of zip.getEntries()) {
    const entryPath = path.resolve(targetPath, entry.entryName)

    if (!entryPath.startsWith(normalizedTargetPath)) {
      throw new HttpError('zip 文件包含非法路径', 400)
    }
  }

  zip.extractAllTo(targetPath, true)
  await fs.rm(zipPath, { force: true })
}

async function resolveRepositoryRoot(targetPath: string) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory())
  const files = entries.filter((entry) => entry.isFile())

  if (directories.length === 1 && files.length === 0) {
    return path.join(targetPath, directories[0].name)
  }

  return targetPath
}
