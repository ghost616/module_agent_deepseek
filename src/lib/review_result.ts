import { mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'
import type { ReviewResult } from './types.ts'

function reviewDir(workspaceDir: string): string {
  return join(workspaceDir, 'review_results')
}

function reviewPath(workspaceDir: string, reviewerSessionId: string): string {
  return join(reviewDir(workspaceDir), `${sanitizeIdSegment(reviewerSessionId)}.json`)
}

export function writeReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
  result: ReviewResult,
): void {
  const dir = reviewDir(workspaceDir)
  mkdirSync(dir, { recursive: true })
  writeJsonSync(reviewPath(workspaceDir, reviewerSessionId), result)
}

export function readReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
): ReviewResult | null {
  const path = reviewPath(workspaceDir, reviewerSessionId)
  if (!existsSync(path)) return null
  try {
    return readJsonSync<ReviewResult>(path)
  } catch {
    return null
  }
}

export function deleteReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
): boolean {
  const path = reviewPath(workspaceDir, reviewerSessionId)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

export async function cleanStaleReviewResults(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = reviewDir(workspaceDir)
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
