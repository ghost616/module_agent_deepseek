import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { WORKSPACE_INDEX_FILE, workspaceDir as wsDir } from './constants.ts'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'
import { getSessionWorkspace } from './session_workspace.ts'

export interface WorkspaceEntry {
  name: string
  created_at: string
}

interface WorkspaceIndex {
  workspaces: WorkspaceEntry[]
  bindings: Record<string, string>
}

const NAME_REGEX = /^[a-zA-Z0-9_]{1,50}$/

function indexPath(directory: string): string {
  return join(directory, WORKSPACE_INDEX_FILE)
}

function readIndexSync(directory: string): WorkspaceIndex {
  const path = indexPath(directory)
  if (!existsSync(path)) return { workspaces: [], bindings: {} }
  try {
    return readJsonSync<WorkspaceIndex>(path)
  } catch {
    return { workspaces: [], bindings: {} }
  }
}

function writeIndexSync(directory: string, data: WorkspaceIndex): void {
  const path = indexPath(directory)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonSync(path, data)
}

export function listWorkspaces(directory: string): WorkspaceEntry[] {
  return readIndexSync(directory).workspaces
}

export function createWorkspace(directory: string, name: string): string {
  if (!NAME_REGEX.test(name)) {
    throw new Error(`工作空间名称仅支持英文、数字、下划线，长度 1-50。`)
  }
  const idx = readIndexSync(directory)
  if (idx.workspaces.some(w => w.name === name)) {
    throw new Error(`工作空间 '${name}' 已存在。`)
  }
  const dir = wsDir(directory, name)
  mkdirSync(dir, { recursive: true })
  idx.workspaces.push({ name, created_at: new Date().toISOString() })
  writeIndexSync(directory, idx)
  return name
}

export function bindFengzhou(directory: string, fengzhouSessionId: string, workspaceName: string): void {
  const idx = readIndexSync(directory)
  if (!idx.workspaces.some(w => w.name === workspaceName)) {
    throw new Error(`工作空间 '${workspaceName}' 不存在。`)
  }
  if (idx.bindings[fengzhouSessionId]) {
    throw new Error('当前风后已绑定工作空间，不可修改。')
  }
  idx.bindings[fengzhouSessionId] = workspaceName
  writeIndexSync(directory, idx)
}

export function getBoundWorkspace(directory: string, fengzhouSessionId: string): string | null {
  return readIndexSync(directory).bindings[fengzhouSessionId] ?? null
}

/**
 * 同步读取风后绑定工作空间。systemPrompt.section 的 text provider 是同步的，
 * 仅在提示词注入路径使用；文件缺失或解析失败返回 null。
 */
export function getBoundWorkspaceSync(directory: string, fengzhouSessionId: string): string | null {
  return getBoundWorkspace(directory, fengzhouSessionId)
}

export function getWorkspaceDir(directory: string, workspaceName: string): string {
  return wsDir(directory, workspaceName)
}

export function resolveWorkspace(directory: string, sessionId: string): string | null {
  // First try fengzhou binding
  const bound = getBoundWorkspace(directory, sessionId)
  if (bound) return bound

  // Then try limu/gaotao session mapping
  return getSessionWorkspace(directory, sessionId)
}

export async function cleanStaleBindings(
  directory: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const idx = readIndexSync(directory)
  let removed = 0
  for (const fengzhouSessionId of Object.keys(idx.bindings)) {
    if (!(await isAlive(fengzhouSessionId))) {
      delete idx.bindings[fengzhouSessionId]
      removed++
    }
  }
  if (removed > 0) writeIndexSync(directory, idx)
  return removed
}
