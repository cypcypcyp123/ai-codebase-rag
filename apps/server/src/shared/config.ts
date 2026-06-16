import 'dotenv/config'
import { z } from 'zod'

// 后端不要把模型名、端口、外部服务地址写死在业务代码里。
// 这里用 zod 读取并校验环境变量，同时提供本地开发默认值。
const envSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('qwen3.5:4b'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_EMBED_BATCH_SIZE: z.coerce.number().int().positive().default(8),
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(8192),
  OLLAMA_NUM_PREDICT: z.coerce.number().int().positive().default(2048),
  OLLAMA_THINK: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  CHROMA_HOST: z.string().default('127.0.0.1'),
  CHROMA_PORT: z.coerce.number().int().positive().default(8000),
  CHROMA_COLLECTION: z.string().default('code_chunks'),
  // 单个 ZIP 上传上限。大型代码仓库压缩包可能接近 1GB，所以本地开发默认给到 1024MB。
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(1024),
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().positive().default(3000)
})

const env = envSchema.parse(process.env)

// 业务代码统一从 config 读取配置，后续换模型或换端口时只改环境变量。
export const config = {
  server: {
    host: env.SERVER_HOST,
    port: env.SERVER_PORT
  },
  ollama: {
    baseUrl: env.OLLAMA_BASE_URL,
    chatModel: env.OLLAMA_CHAT_MODEL,
    embedModel: env.OLLAMA_EMBED_MODEL,
    embedBatchSize: env.OLLAMA_EMBED_BATCH_SIZE,
    numCtx: env.OLLAMA_NUM_CTX,
    numPredict: env.OLLAMA_NUM_PREDICT,
    think: env.OLLAMA_THINK
  },
  chroma: {
    host: env.CHROMA_HOST,
    port: env.CHROMA_PORT,
    url: `http://${env.CHROMA_HOST}:${env.CHROMA_PORT}`,
    collection: env.CHROMA_COLLECTION
  },
  upload: {
    maxFileSizeBytes: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024
  }
} as const
