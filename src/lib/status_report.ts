import { mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'

/** 子会话状态文件内容（覆盖写）。 */
export interface StatusReport {
  session_id: string
  mode: string | null
  content: string
  updated_at: string
}

/** 状态文件目录：<workspaceDir>/status_reports/。 */
function statusReportsDir(workspaceDir: string): string {
  return join(workspaceDir, 'status_reports')
}

/** 状态文件路径约定：<workspaceDir>/status_reports/<子会话id>.json。 */
export function statusReportPath(workspaceDir: string, sessionId: string): string {
  return join(statusReportsDir(workspaceDir), `${sanitizeIdSegment(sessionId)}.json`)
}

/** 子会话状态文件是否存在（父会话据此判断子会话是否已汇报状态）。 */
export function statusReportExists(workspaceDir: string, sessionId: string): boolean {
  return existsSync(statusReportPath(workspaceDir, sessionId))
}

/**
 * 覆盖写入子会话状态文件，含 session_id/mode/content/updated_at。
 * @param mode 写入者角色（框架子会话 mode），未知时传 undefined 记为 null
 */
export function writeStatusReport(
  workspaceDir: string,
  sessionId: string,
  content: string,
  mode?: string,
): void {
  const dir = statusReportsDir(workspaceDir)
  mkdirSync(dir, { recursive: true })
  const report: StatusReport = {
    session_id: sessionId,
    mode: mode ?? null,
    content,
    updated_at: new Date().toISOString(),
  }
  writeJsonSync(statusReportPath(workspaceDir, sessionId), report)
}

/** 读取子会话状态文件；文件不存在或损坏返回 null。 */
export function readStatusReport(workspaceDir: string, sessionId: string): StatusReport | null {
  const path = statusReportPath(workspaceDir, sessionId)
  if (!existsSync(path)) return null
  try {
    return readJsonSync<StatusReport>(path)
  } catch {
    return null
  }
}

/** 删除子会话状态文件；文件不存在返回 false。 */
export function deleteStatusReport(workspaceDir: string, sessionId: string): boolean {
  const path = statusReportPath(workspaceDir, sessionId)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

/** 清理引用了已不存在会话的状态文件，返回删除数量。 */
export async function cleanStaleStatusReports(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = statusReportsDir(workspaceDir)
  if (!existsSync(dir)) return 0
  let removed = 0
  const files = readdirSync(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const sid = desanitizeIdSegment(f.slice(0, -5))
    if (!(await isAlive(sid))) {
      unlinkSync(join(dir, f))
      removed++
    }
  }
  return removed
}
