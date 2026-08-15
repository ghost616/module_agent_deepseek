import { join, isAbsolute, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { exists, existsSync, readJson, readJsonSync, writeText } from './fs.ts'

export interface KnowledgeBase {
  dir: string
  description: string
}

interface KnowledgeBaseFile {
  knowledge_bases: KnowledgeBase[]
}

const FILE_NAME = 'knowledge_bases.json'

function filePath(workspaceDir: string): string {
  return join(workspaceDir, FILE_NAME)
}

async function readFile(workspaceDir: string): Promise<KnowledgeBaseFile> {
  const path = filePath(workspaceDir)
  if (!(await exists(path))) return { knowledge_bases: [] }
  try {
    const data = await readJson<Partial<KnowledgeBaseFile>>(path)
    return { knowledge_bases: Array.isArray(data.knowledge_bases) ? data.knowledge_bases : [] }
  } catch {
    return { knowledge_bases: [] }
  }
}

async function writeFile(workspaceDir: string, data: KnowledgeBaseFile): Promise<void> {
  const path = filePath(workspaceDir)
  await mkdir(workspaceDir, { recursive: true })
  await writeText(path, JSON.stringify(data, null, 2))
}

export async function listKnowledgeBases(workspaceDir: string): Promise<KnowledgeBase[]> {
  const data = await readFile(workspaceDir)
  return data.knowledge_bases
}

/**
 * 同步读取知识库列表。systemPrompt.section 的 text provider 是同步的，
 * 仅在提示词注入路径使用；文件缺失或解析失败返回空列表。
 */
export function listKnowledgeBasesSync(workspaceDir: string): KnowledgeBase[] {
  const path = filePath(workspaceDir)
  if (!existsSync(path)) return []
  try {
    const data = readJsonSync<Partial<KnowledgeBaseFile>>(path)
    return Array.isArray(data.knowledge_bases) ? data.knowledge_bases : []
  } catch {
    return []
  }
}

export async function setKnowledgeBases(workspaceDir: string, bases: KnowledgeBase[]): Promise<void> {
  await writeFile(workspaceDir, { knowledge_bases: bases })
}

export async function addKnowledgeBase(workspaceDir: string, base: KnowledgeBase): Promise<void> {
  const data = await readFile(workspaceDir)
  const target = normalizeDir(resolveToAbsolute(base.dir, ''))
  const idx = data.knowledge_bases.findIndex((b) => normalizeDir(resolveToAbsolute(b.dir, '')) === target)
  if (idx >= 0) data.knowledge_bases[idx] = base
  else data.knowledge_bases.push(base)
  await writeFile(workspaceDir, data)
}

export async function removeKnowledgeBase(workspaceDir: string, dir: string): Promise<boolean> {
  const data = await readFile(workspaceDir)
  const target = normalizeDir(resolveToAbsolute(dir, ''))
  const before = data.knowledge_bases.length
  data.knowledge_bases = data.knowledge_bases.filter((b) => normalizeDir(resolveToAbsolute(b.dir, '')) !== target)
  const removed = data.knowledge_bases.length !== before
  if (removed) await writeFile(workspaceDir, data)
  return removed
}

function normalizeDir(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
}

function stripGlob(p: string): string {
  const idx = p.search(/[*?]/)
  if (idx === -1) return p
  return p.slice(0, idx)
}

function resolveToAbsolute(p: string, projectRoot: string): string {
  if (!p) return ''
  if (isAbsolute(p)) return p
  return resolve(projectRoot, p)
}

export function isPathInKnowledgeBase(path: string, bases: KnowledgeBase[], projectRoot: string): boolean {
  const target = normalizeDir(stripGlob(resolveToAbsolute(path, projectRoot)))
  if (!target) return false
  return bases.some((base) => {
    const dir = normalizeDir(stripGlob(resolveToAbsolute(base.dir, projectRoot)))
    if (!dir) return false
    return target === dir || target.startsWith(dir + '/')
  })
}

export function buildKnowledgeBasePrompt(bases: KnowledgeBase[]): string {
  const lines = bases.map((b, i) => `${i + 1}. 目录：${b.dir}\n   说明：${b.description}`)
  return ['## 知识库', '', '当前工作空间配置了以下知识库目录，可在需要时读取参考：', '', ...lines].join('\n')
}
