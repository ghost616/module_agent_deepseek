import { mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ExecutionRecord, ExecutionRecords } from './types.ts'
import { existsSync, readJsonSync, writeJsonSync, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'

function resultsDir(workspaceDir: string, moduleName: string): string {
  return join(workspaceDir, 'executions', moduleName)
}

function resultPath(workspaceDir: string, moduleName: string, sessionId: string): string {
  return join(resultsDir(workspaceDir, moduleName), `${sanitizeIdSegment(sessionId)}.json`)
}

export function writeExecutionRecord(
  workspaceDir: string,
  moduleName: string,
  sessionId: string,
  record: ExecutionRecord,
): void {
  const dir = resultsDir(workspaceDir, moduleName)
  mkdirSync(dir, { recursive: true })
  const path = resultPath(workspaceDir, moduleName, sessionId)

  let records: ExecutionRecords = []
  if (existsSync(path)) {
    try {
      records = readJsonSync<ExecutionRecords>(path)
    } catch {
      records = []
    }
  }

  if (records.length > 0) {
    const last = records[records.length - 1]
    if (last === undefined || last.plan_id !== record.plan_id) {
      records.push(record)
    } else {
      records[records.length - 1] = record
    }
  } else {
    records.push(record)
  }

  writeJsonSync(path, records)
}

export function readAndCleanExecutionRecords(
  workspaceDir: string,
  moduleName: string,
  sessionId: string,
): ExecutionRecord[] {
  const path = resultPath(workspaceDir, moduleName, sessionId)
  if (!existsSync(path)) return []

  let records: ExecutionRecords
  try {
    records = readJsonSync<ExecutionRecords>(path)
  } catch {
    return []
  }

  return records
}

export function deleteExecutionRecords(
  workspaceDir: string,
  moduleName: string,
  sessionId: string,
): boolean {
  const path = resultPath(workspaceDir, moduleName, sessionId)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

export async function cleanStaleExecutions(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const root = join(workspaceDir, 'executions')
  if (!existsSync(root)) return 0
  let removed = 0
  const modules = readdirSync(root, { withFileTypes: true })
  for (const m of modules) {
    if (!m.isDirectory()) continue
    const modDir = join(root, m.name)
    const files = readdirSync(modDir)
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const sid = desanitizeIdSegment(f.slice(0, -5))
      if (!(await isAlive(sid))) {
        unlinkSync(join(modDir, f))
        removed++
      }
    }
  }
  return removed
}
