import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { SESSION_WORKSPACE_FILE } from './constants.ts'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

type SessionWorkspaceMap = Record<string, string>

function filePath(directory: string): string {
  return join(directory, SESSION_WORKSPACE_FILE)
}

function readMapSync(directory: string): SessionWorkspaceMap {
  const path = filePath(directory)
  if (!existsSync(path)) return {}
  try {
    return readJsonSync<SessionWorkspaceMap>(path)
  } catch {
    return {}
  }
}

function writeMapSync(directory: string, data: SessionWorkspaceMap): void {
  const path = filePath(directory)
  mkdirSync(join(directory, '.module_agent'), { recursive: true })
  writeJsonSync(path, data)
}

export function setSessionWorkspace(directory: string, sessionId: string, workspaceName: string): void {
  const data = readMapSync(directory)
  data[sessionId] = workspaceName
  writeMapSync(directory, data)
}

export function getSessionWorkspace(directory: string, sessionId: string): string | null {
  const data = readMapSync(directory)
  return data[sessionId] ?? null
}

/**
 * 同步读取会话工作空间映射。systemPrompt.section 的 text provider 是同步的，
 * 需要同步读取，仅在提示词注入路径使用；读取失败返回 null。
 */
export function getSessionWorkspaceSync(directory: string, sessionId: string): string | null {
  return getSessionWorkspace(directory, sessionId)
}

export function removeSessionWorkspace(directory: string, sessionId: string): void {
  const data = readMapSync(directory)
  if (!(sessionId in data)) return
  delete data[sessionId]
  writeMapSync(directory, data)
}

export async function cleanStaleSessionWorkspaces(
  directory: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const data = readMapSync(directory)
  let removed = 0
  for (const sid of Object.keys(data)) {
    if (!(await isAlive(sid))) {
      delete data[sid]
      removed++
    }
  }
  if (removed > 0) writeMapSync(directory, data)
  return removed
}
