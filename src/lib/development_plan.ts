import { join } from 'node:path'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'
import type { PlanDetail, PlanMeta } from './types.ts'

function getPlanDir(workspaceDir: string): string {
  return join(workspaceDir, 'development_plan')
}

function getMetadataPath(workspaceDir: string): string {
  return join(workspaceDir, 'development_plan', 'metadata.json')
}

function getPlanFilePath(workspaceDir: string, planId: string): string {
  return join(workspaceDir, 'development_plan', `${planId}.json`)
}

function ensureDir(workspaceDir: string): void {
  const dir = getPlanDir(workspaceDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/** 同步读取 metadata.json（PlanMeta 数组），缺失或解析失败返回空数组。 */
export function readAllMetadataSync(workspaceDir: string): PlanMeta[] {
  const path = getMetadataPath(workspaceDir)
  if (!existsSync(path)) return []
  try {
    return readJsonSync<PlanMeta[]>(path)
  } catch {
    return []
  }
}

/** 同步写入 metadata.json。 */
export function writeMetadataSync(workspaceDir: string, metadata: PlanMeta[]): void {
  ensureDir(workspaceDir)
  writeJsonSync(getMetadataPath(workspaceDir), metadata)
}

export function readAllMetadata(workspaceDir: string): PlanMeta[] {
  return readAllMetadataSync(workspaceDir)
}

export function readPlan(workspaceDir: string, planId: string): PlanDetail | null {
  const path = getPlanFilePath(workspaceDir, planId)
  if (!existsSync(path)) return null
  try {
    return readJsonSync<PlanDetail>(path)
  } catch {
    return null
  }
}

export function savePlan(
  workspaceDir: string,
  planId: string,
  planData: PlanDetail,
  planSummary: string,
  starterSessionId: string,
): void {
  ensureDir(workspaceDir)

  writeJsonSync(getPlanFilePath(workspaceDir, planId), planData)

  const metadata = readAllMetadataSync(workspaceDir)
  const existing = metadata.findIndex(m => m.plan_id === planId)
  const entry: PlanMeta = {
    plan_id: planId,
    plan_summary: planSummary,
    starter_session_id: starterSessionId,
    code_reviewed: false,
    plan_completed: false,
    test_passed: false,
  }
  if (existing >= 0) {
    metadata[existing] = entry
  } else {
    metadata.push(entry)
  }
  writeMetadataSync(workspaceDir, metadata)
}

export function createReviewPlan(
  workspaceDir: string,
  planId: string,
  filePaths: string[],
  reviewDescription: string,
  planSummary: string,
  starterSessionId: string,
): void {
  savePlan(workspaceDir, planId, {
    plan_id: planId,
    module_name: '',
    development_plan: reviewDescription,
    session_id: '',
    modified_files: filePaths,
  }, planSummary, starterSessionId)

  markPlanComplete(workspaceDir, planId, filePaths)
}

export function markPlanComplete(
  workspaceDir: string,
  planId: string,
  files: string[],
): boolean {
  const plan = readPlan(workspaceDir, planId)
  if (!plan) return false

  plan.modified_files = files
  writeJsonSync(getPlanFilePath(workspaceDir, planId), plan)

  const metadata = readAllMetadataSync(workspaceDir)
  const entry = metadata.find(m => m.plan_id === planId)
  if (entry) {
    entry.plan_completed = true
    writeMetadataSync(workspaceDir, metadata)
  }
  return true
}

export function markTestPassed(
  workspaceDir: string,
  planId: string,
  testPassed: boolean,
): boolean {
  const metadata = readAllMetadataSync(workspaceDir)
  const entry = metadata.find(m => m.plan_id === planId)
  if (!entry) return false
  entry.test_passed = testPassed
  writeMetadataSync(workspaceDir, metadata)
  return true
}

export function getFirstPendingReview(workspaceDir: string, starterSessionId?: string): PlanDetail | null {
  const metadata = readAllMetadataSync(workspaceDir)
  for (const meta of metadata) {
    if (!meta.plan_completed || meta.code_reviewed) continue
    if (starterSessionId && meta.starter_session_id !== starterSessionId) continue
    return readPlan(workspaceDir, meta.plan_id)
  }
  return null
}

export function markReviewComplete(workspaceDir: string, planId: string): boolean {
  const metadata = readAllMetadataSync(workspaceDir)
  const entry = metadata.find(m => m.plan_id === planId)
  if (!entry) return false
  entry.code_reviewed = true
  writeMetadataSync(workspaceDir, metadata)
  return true
}

export function deletePlan(workspaceDir: string, planId: string): boolean {
  const planPath = getPlanFilePath(workspaceDir, planId)
  let deleted = false

  if (existsSync(planPath)) {
    unlinkSync(planPath)
    deleted = true
  }

  const metadata = readAllMetadataSync(workspaceDir)
  const filtered = metadata.filter(m => m.plan_id !== planId)
  if (filtered.length !== metadata.length) {
    writeMetadataSync(workspaceDir, filtered)
    deleted = true
  }

  return deleted
}

export function deleteCompletedPlans(workspaceDir: string): number {
  const metadata = readAllMetadataSync(workspaceDir)
  let deleted = 0
  for (const meta of metadata) {
    if (meta.plan_completed && meta.code_reviewed) {
      if (deletePlan(workspaceDir, meta.plan_id)) {
        deleted++
      }
    }
  }
  return deleted
}

export async function cleanStalePlans(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<string[]> {
  const dir = getPlanDir(workspaceDir)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  const deleted: string[] = []
  for (const f of files) {
    if (!f.endsWith('.json') || f === 'metadata.json') continue
    const planId = f.slice(0, -5)
    const plan = readPlan(workspaceDir, planId)
    if (!plan || !(await isAlive(plan.session_id))) {
      if (deletePlan(workspaceDir, planId)) {
        deleted.push(planId)
      }
    }
  }
  return deleted
}
