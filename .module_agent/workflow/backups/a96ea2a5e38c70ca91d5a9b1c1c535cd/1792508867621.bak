import { join } from 'node:path'
import { exec } from 'node:child_process'
import type { ExecException } from 'node:child_process'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { existsSync, writeJsonSync, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'
import type { TestSpec } from './types.ts'

export interface ShellResult {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

/** exec 回调的退出码：成功（error 为 null）返回 0；数值型 code 为进程退出码；字符串型（如 ETIMEDOUT）视为非 0。 */
function exitCodeOf(error: ExecException | null): number {
  if (error === null || error === undefined) return 0
  const code = error.code
  return typeof code === 'number' ? code : 1
}

export function runShellCommand(command: string, cwd: string, timeout: number, maxBuffer: number): Promise<ShellResult> {
  const startTime = Date.now()
  return new Promise((resolve) => {
    exec(command, { cwd, timeout, maxBuffer }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        exit_code: exitCodeOf(error),
        duration_ms: Date.now() - startTime,
      })
    })
  })
}

export function writeTestReport(
  workspaceDir: string,
  sessionId: string,
  content: string,
): void {
  const dir = join(workspaceDir, 'test_reports')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sanitizeIdSegment(sessionId)}.json`)
  const record = {
    lizhu_session_id: sessionId,
    content,
    timestamp: new Date().toISOString(),
  }
  writeJsonSync(path, record)
}

export function writeTestSpec(
  workspaceDir: string,
  sessionId: string,
  content: string,
): void {
  const dir = join(workspaceDir, 'test_specs')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sanitizeIdSegment(sessionId)}.json`)
  const record: TestSpec = {
    session_id: sessionId,
    content,
    timestamp: new Date().toISOString(),
  }
  writeJsonSync(path, record)
}

export async function cleanStaleTestSpecs(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = join(workspaceDir, 'test_specs')
  if (!existsSync(dir)) return 0
  let removed = 0
  const files = readdirSync(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const sid = desanitizeIdSegment(f.slice(0, -5))
    if (!(await isAlive(sid))) {
      try { unlinkSync(join(dir, f)) } catch { /* 并发删除时忽略 */ }
      removed++
    }
  }
  return removed
}

export async function cleanStaleTestReports(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = join(workspaceDir, 'test_reports')
  if (!existsSync(dir)) return 0
  let removed = 0
  const files = readdirSync(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const sid = desanitizeIdSegment(f.slice(0, -5))
    if (!(await isAlive(sid))) {
      try { unlinkSync(join(dir, f)) } catch { /* 并发删除时忽略 */ }
      removed++
    }
  }
  return removed
}
