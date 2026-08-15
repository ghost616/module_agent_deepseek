import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { SESSION_WORKSPACE_FILE } from './constants.ts'
import { exists, existsSync, readJson, readJsonSync, writeText } from './fs.ts'

type SessionWorkspaceMap = Record<string, string>

function filePath(directory: string): string {
  return join(directory, SESSION_WORKSPACE_FILE)
}

async function readMap(directory: string): Promise<SessionWorkspaceMap> {
  const path = filePath(directory)
  if (!(await exists(path))) return {}
  try {
    return await readJson<SessionWorkspaceMap>(path)
  } catch {
    return {}
  }
}

async function writeMap(directory: string, data: SessionWorkspaceMap): Promise<void> {
  const path = filePath(directory)
  await mkdir(join(directory, '.module_agent'), { recursive: true })
  await writeText(path, JSON.stringify(data, null, 2))
}

export async function setSessionWorkspace(directory: string, sessionId: string, workspaceName: string): Promise<void> {
  const data = await readMap(directory)
  data[sessionId] = workspaceName
  await writeMap(directory, data)
}

export async function getSessionWorkspace(directory: string, sessionId: string): Promise<string | null> {
  const data = await readMap(directory)
  return data[sessionId] ?? null
}

/**
 * 同步读取会话工作空间映射。systemPrompt.section 的 text provider 是同步的，
 * 需要同步读取，仅在提示词注入路径使用；读取失败返回 null。
 */
export function getSessionWorkspaceSync(directory: string, sessionId: string): string | null {
  const path = filePath(directory)
  if (!existsSync(path)) return null
  try {
    const data = readJsonSync<SessionWorkspaceMap>(path)
    return data[sessionId] ?? null
  } catch {
    return null
  }
}

export async function removeSessionWorkspace(directory: string, sessionId: string): Promise<void> {
  const data = await readMap(directory)
  if (!(sessionId in data)) return
  delete data[sessionId]
  await writeMap(directory, data)
}

export async function cleanStaleSessionWorkspaces(
  directory: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const data = await readMap(directory)
  let removed = 0
  for (const sid of Object.keys(data)) {
    if (!(await isAlive(sid))) {
      delete data[sid]
      removed++
    }
  }
  if (removed > 0) await writeMap(directory, data)
  return removed
}
