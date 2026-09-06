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
 * 让 dsh 普通顶层 fork 子会话继承父会话的工作空间绑定（幂等、静默）：
 * 父绑定非空时把 `bindings[childSessionId] = 父绑定` 写入工作空间 index；若
 * child 已有绑定则跳过不改。不做 bindFengzhou 的「已绑定抛错」校验，也不写
 * session_workspaces（那是子代理映射面）。
 * @param directory 项目根目录。
 * @param parentSessionId 父会话 id（fork 源）。
 * @param childSessionId fork 子会话 id。
 * @returns child 绑定到的工作空间名（父绑定非空时为继承结果或既有 child 绑定）；
 *   父会话无绑定返回 null。
 */
export function inheritWorkspaceBinding(
  directory: string,
  parentSessionId: string,
  childSessionId: string,
): string | null {
  const idx = readIndexSync(directory)
  const parentWorkspace = idx.bindings[parentSessionId] ?? null
  if (parentWorkspace === null) return null
  const existing = idx.bindings[childSessionId]
  if (existing !== undefined) return existing
  idx.bindings[childSessionId] = parentWorkspace
  writeIndexSync(directory, idx)
  return parentWorkspace
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
