import { mkdir, unlink, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { exists, readJson, writeText, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'
import type { ReviewResult } from './types.ts'

function reviewDir(workspaceDir: string): string {
  return join(workspaceDir, 'review_results')
}

function reviewPath(workspaceDir: string, reviewerSessionId: string): string {
  return join(reviewDir(workspaceDir), `${sanitizeIdSegment(reviewerSessionId)}.json`)
}

export async function writeReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
  result: ReviewResult,
): Promise<void> {
  const dir = reviewDir(workspaceDir)
  await mkdir(dir, { recursive: true })
  await writeText(reviewPath(workspaceDir, reviewerSessionId), JSON.stringify(result, null, 2))
}

export async function readReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
): Promise<ReviewResult | null> {
  const path = reviewPath(workspaceDir, reviewerSessionId)
  if (!(await exists(path))) return null
  try {
    return await readJson<ReviewResult>(path)
  } catch {
    return null
  }
}

export async function deleteReviewResult(
  workspaceDir: string,
  reviewerSessionId: string,
): Promise<boolean> {
  const path = reviewPath(workspaceDir, reviewerSessionId)
  if (!(await exists(path))) return false
  await unlink(path)
  return true
}

export async function cleanStaleReviewResults(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = reviewDir(workspaceDir)
  if (!(await exists(dir))) return 0
  let removed = 0
  const files = await readdir(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const sid = desanitizeIdSegment(f.slice(0, -5))
    if (!(await isAlive(sid))) {
      await unlink(join(dir, f))
      removed++
    }
  }
  return removed
}
