import { join } from 'node:path'
import { moduleAgentDir, PLAN_FILES_FILE } from './constants.ts'
import { exists, readJson, writeText } from './fs.ts'
import { unlink } from 'node:fs/promises'

export interface PlanSession {
  session_id: string
  status: 'started' | 'running'
  files: string[]
}

export interface PlanFiles {
  sessions: PlanSession[]
}

function planFilesPath(directory: string, moduleName: string): string {
  return join(moduleAgentDir(directory, moduleName), PLAN_FILES_FILE)
}

function emptyPlanFiles(): PlanFiles {
  return { sessions: [] }
}

export async function readPlanFiles(directory: string, moduleName: string): Promise<PlanFiles | null> {
  const path = planFilesPath(directory, moduleName)
  if (!(await exists(path))) return null
  try {
    return await readJson<PlanFiles>(path)
  } catch {
    return null
  }
}

export async function addPlanFiles(
  directory: string,
  moduleName: string,
  sessionId: string,
  files: string[],
  status: 'started' | 'running',
): Promise<void> {
  const existing = await readPlanFiles(directory, moduleName)
  const data: PlanFiles = existing || emptyPlanFiles()

  // 查找匹配的 session 条目
  let session = data.sessions.find((s) => s.session_id === sessionId)
  if (!session) {
    session = { session_id: sessionId, status, files: [] }
    data.sessions.push(session)
  }
  session.status = status
  const existingSet = new Set(session.files)
  for (const f of files) {
    if (!existingSet.has(f)) {
      session.files.push(f)
      existingSet.add(f)
    }
  }

  const path = planFilesPath(directory, moduleName)
  await writeText(path, JSON.stringify(data, null, 2))
}

export async function removePlanFiles(
  directory: string,
  moduleName: string,
  sessionId: string,
  files: string[],
): Promise<void> {
  const existing = await readPlanFiles(directory, moduleName)
  if (!existing) return

  const sessionIdx = existing.sessions.findIndex((s) => s.session_id === sessionId)
  if (sessionIdx === -1) return

  const session = existing.sessions[sessionIdx]
  if (session === undefined) return
  const removeSet = new Set(files)
  session.files = session.files.filter((f) => !removeSet.has(f))

  if (session.files.length === 0) {
    existing.sessions.splice(sessionIdx, 1)
  }

  const path = planFilesPath(directory, moduleName)
  if (existing.sessions.length === 0) {
    try { await unlink(path) } catch { /* 文件已不存在时无需删除 */ }
  } else {
    await writeText(path, JSON.stringify(existing, null, 2))
  }
}

export async function releasePlanFilesSession(
  directory: string,
  moduleName: string,
  sessionId: string,
): Promise<void> {
  const existing = await readPlanFiles(directory, moduleName)
  if (!existing) return

  const idx = existing.sessions.findIndex((s) => s.session_id === sessionId)
  if (idx === -1) return
  existing.sessions.splice(idx, 1)

  const path = planFilesPath(directory, moduleName)
  if (existing.sessions.length === 0) {
    try { await unlink(path) } catch { /* 文件已不存在时无需删除 */ }
  } else {
    await writeText(path, JSON.stringify(existing, null, 2))
  }
}

export async function cleanStalePlanFilesForModule(
  directory: string,
  moduleName: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const existing = await readPlanFiles(directory, moduleName)
  if (!existing) return 0
  const sessionIds = existing.sessions.map((s) => s.session_id)
  let removed = 0
  for (const sid of sessionIds) {
    if (!(await isAlive(sid))) {
      await releasePlanFilesSession(directory, moduleName, sid)
      removed++
    }
  }
  return removed
}
