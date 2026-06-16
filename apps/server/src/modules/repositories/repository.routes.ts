import type {
	AskRepositoryResponse,
	ChunkRepositoryResponse,
	IndexRepositoryResponse,
	ScanRepositoryResponse,
	SearchCodeResponse,
} from "@ai-codebase-rag/shared";
import type { Multipart } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { RepositoryIndexService } from "./repository-index.service.js";
import { repositoryService } from "./repository-store.js";
import { RepositoryUploadService } from "./repository-upload.service.js";

const createRepositorySchema = z.object({
	name: z.string().trim().min(1),
	rootPath: z.string().trim().min(1),
});

const repositoryParamsSchema = z.object({
	id: z.string().trim().min(1),
});

const searchCodeSchema = z.object({
	query: z.string().trim().min(1),
	limit: z.coerce.number().int().positive().max(20).default(5),
});

const askRepositorySchema = z.object({
	question: z.string().trim().min(1),
	limit: z.coerce.number().int().positive().max(10).default(5),
});
const uploadTmpRoot = path.resolve(process.cwd(), "../../uploads/tmp");

export async function registerRepositoryRoutes(app: FastifyInstance) {
	const repositoryIndexService = new RepositoryIndexService();
	const repositoryUploadService = new RepositoryUploadService();

	// GET /api/repositories
	app.get("/", async () => repositoryService.listRepositories());

	// POST /api/repositories
	// 请求体示例：{ "name": "ai-codebase-rag", "rootPath": "E:\\demo\\ai-codebase-rag" }
	app.post("/", async (request, reply) => {
		const parsed = createRepositorySchema.parse(request.body);
		const repository = await repositoryService.createRepository(parsed);

		return reply.code(201).send(repository);
	});

	// POST /api/repositories/upload
	// 上传 zip 后解压到 uploads/repositories，并自动登记为代码仓库。
	app.post("/upload", async (request, reply) => {
		const file = await request.file();
		if (!file) {
			throw new Error("请选择 zip 文件");
		}

		const zipPath = await saveUploadedFile(file);
		const repository = await repositoryUploadService.uploadZip({
			name:
				getMultipartFieldValue(file.fields.name) ??
				file.filename.replace(/\.zip$/i, ""),
			filename: file.filename,
			zipPath,
		});

		return reply.code(201).send(repository);
	});

	// POST /api/repositories/:id/scan
	// 第一阶段只扫描源码文件并返回摘要，还不写入 ChromaDB。
	app.post("/:id/scan", async (request): Promise<ScanRepositoryResponse> => {
		const params = repositoryParamsSchema.parse(request.params);
		return repositoryIndexService.scanRepository(params.id);
	});

	// POST /api/repositories/:id/chunks
	// 预览代码分片结果，便于确认行号和文件路径是否正确。
	app.post("/:id/chunks", async (request): Promise<ChunkRepositoryResponse> => {
		const params = repositoryParamsSchema.parse(request.params);
		return repositoryIndexService.previewChunks(params.id);
	});

	// POST /api/repositories/:id/index
	// 扫描源码 -> 代码分片 -> embedding -> 写入 ChromaDB。
	app.post("/:id/index", async (request): Promise<IndexRepositoryResponse> => {
		const params = repositoryParamsSchema.parse(request.params);
		return repositoryIndexService.indexRepository(params.id);
	});

	// POST /api/repositories/:id/search
	// 只做代码语义检索，不调用大模型，便于单独验证 ChromaDB 检索质量。
	app.post("/:id/search", async (request): Promise<SearchCodeResponse> => {
		const params = repositoryParamsSchema.parse(request.params);
		const body = searchCodeSchema.parse(request.body);
		return repositoryIndexService.searchRepository(
			params.id,
			body.query,
			body.limit,
		);
	});

	// POST /api/repositories/:id/ask
	// 面向代码仓库的问答接口，会返回答案和代码引用来源。
	app.post("/:id/ask", async (request): Promise<AskRepositoryResponse> => {
		const params = repositoryParamsSchema.parse(request.params);
		const body = askRepositorySchema.parse(request.body);
		return repositoryIndexService.askRepository(
			params.id,
			body.question,
			body.limit,
		);
	});

	// POST /api/repositories/:id/ask/stream
	// SSE 流式问答：先推送 citations，再持续推送模型增量文本。
	app.post("/:id/ask/stream", async (request, reply) => {
		const params = repositoryParamsSchema.parse(request.params);
		const body = askRepositorySchema.parse(request.body);
		const context = await repositoryIndexService.prepareAskContext(
			params.id,
			body.question,
			body.limit,
		);

		reply.raw.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
			"access-control-allow-origin": "*",
		});
		writeSseEvent(reply.raw, "citations", context.citations);

		try {
			let hasDelta = false;

			for await (const delta of repositoryIndexService.streamAnswer(
				context.prompt,
			)) {
				hasDelta = true;
				writeSseEvent(reply.raw, "delta", delta);
			}

			if (!hasDelta) {
				const fallbackAnswer = await repositoryIndexService.generateAnswer(
					context.prompt,
				);
				writeSseEvent(reply.raw, "delta", fallbackAnswer);
			}

			writeSseEvent(reply.raw, "done", {});
		} catch (error) {
			writeSseEvent(reply.raw, "error", {
				message: error instanceof Error ? error.message : "流式问答失败",
			});
		} finally {
			reply.raw.end();
		}
	});
}

async function saveUploadedFile(file: Multipart & { type: "file" }) {
	await fsp.mkdir(uploadTmpRoot, { recursive: true });
	const safeFilename = `${Date.now()}-${file.filename.replace(/[^\w.-]/g, "_")}`;
	const zipPath = path.join(uploadTmpRoot, safeFilename);

	// 大 ZIP 不能使用 file.toBuffer()，否则会把整个文件读进内存。这里直接流式写盘。
	await pipeline(file.file, fs.createWriteStream(zipPath));

	return zipPath;
}

function getMultipartFieldValue(field: Multipart | Multipart[] | undefined) {
	if (!field || Array.isArray(field) || field.type !== "field") {
		return undefined;
	}

	return String(field.value);
}

function writeSseEvent(
	response: NodeJS.WritableStream,
	event: string,
	data: unknown,
) {
	response.write(`event: ${event}\n`);
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}
