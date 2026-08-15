import { join } from 'node:path'
import { moduleAgentDir, PLAN_FILES_FILE } from './constants.ts'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'
import { unlinkSync } from 'node:fs'

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

export function readPlanFiles(directory: string, moduleName: string): PlanFiles | null {
  const path = planFilesPath(directory, moduleName)
  if (!existsSync(path)) return null
  try {
    return readJsonSync<PlanFiles>(path)
  } catch {
    return null
  }
}

export function addPlanFiles(
  directory: string,
  moduleName: string,
  sessionId: string,
  files: string[],
  status: 'started' | 'running',
): void {
  const existing = readPlanFiles(directory, moduleName)
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
  writeJsonSync(path, data)
}

export function removePlanFiles(
  directory: string,
  moduleName: string,
  sessionId: string,
  files: string[],
): void {
  const existing = readPlanFiles(directory, moduleName)
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
    try { unlinkSync(path) } catch { /* 文件已不存在时无需删除 */ }
  } else {
    writeJsonSync(path, existing)
  }
}

export function releasePlanFilesSession(
  directory: string,
  moduleName: string,
  sessionId: string,
): void {
  const existing = readPlanFiles(directory, moduleName)
  if (!existing) return

  const idx = existing.sessions.findIndex((s) => s.session_id === sessionId)
  if (idx === -1) return
  existing.sessions.splice(idx, 1)

  const path = planFilesPath(directory, moduleName)
  if (existing.sessions.length === 0) {
    try { unlinkSync(path) } catch { /* 文件已不存在时无需删除 */ }
  } else {
    writeJsonSync(path, existing)
  }
}

export async function cleanStalePlanFilesForModule(
  directory: string,
  moduleName: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const existing = readPlanFiles(directory, moduleName)
  if (!existing) return 0
  const sessionIds = existing.sessions.map((s) => s.session_id)
  let removed = 0
  for (const sid of sessionIds) {
    if (!(await isAlive(sid))) {
      releasePlanFilesSession(directory, moduleName, sid)
      removed++
    }
  }
  return removed
}
