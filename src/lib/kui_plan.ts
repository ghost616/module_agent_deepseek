import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync, sanitizeIdSegment, desanitizeIdSegment } from './fs.ts'
import type { KuiPlan } from './types.ts'

function kuiPlansDir(workspaceDir: string): string {
  return join(workspaceDir, 'kui_plans')
}

function fengzhouPlansPath(workspaceDir: string, fengzhouSessionId: string): string {
  return join(kuiPlansDir(workspaceDir), `${sanitizeIdSegment(fengzhouSessionId)}.json`)
}

export function readFengzhouPlansSync(workspaceDir: string, fengzhouSessionId: string): KuiPlan[] {
  const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
  if (!existsSync(path)) return []
  try {
    return readJsonSync<KuiPlan[]>(path)
  } catch {
    return []
  }
}

function writeFengzhouPlansSync(workspaceDir: string, fengzhouSessionId: string, plans: KuiPlan[]): void {
  const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonSync(path, plans)
}

export function readKuiPlan(workspaceDir: string, fengzhouSessionId: string, kuiPlanId: string): KuiPlan | null {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  return plans.find(p => p.kui_plan_id === kuiPlanId) ?? null
}

export function writeKuiPlan(workspaceDir: string, fengzhouSessionId: string, plan: KuiPlan): void {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  const idx = plans.findIndex(p => p.kui_plan_id === plan.kui_plan_id)
  if (idx >= 0) {
    plans[idx] = plan
  } else {
    plans.push(plan)
  }
  writeFengzhouPlansSync(workspaceDir, fengzhouSessionId, plans)
}

export function readFirstPendingKuiPlan(workspaceDir: string, fengzhouSessionId: string): KuiPlan | null {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  return plans.find(p => p.status === 'pending') ?? null
}

export function hasUncompletedKuiPlan(workspaceDir: string, fengzhouSessionId: string): boolean {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  return plans.some(p => p.status !== 'completed')
}

export function getCompletedKuiPlans(workspaceDir: string, fengzhouSessionId: string): KuiPlan[] {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  return plans.filter(p => p.status === 'completed')
}

export function appendPlanIdToRunningKuiPlan(
  workspaceDir: string,
  fengzhouSessionId: string,
  kuiSessionId: string,
  planId: string,
): void {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  const running = plans.find(p => p.status === 'running' && p.kui_session_id === kuiSessionId)
  if (!running) return
  if (!running.plan_ids) running.plan_ids = []
  running.plan_ids.push(planId)
  writeKuiPlan(workspaceDir, fengzhouSessionId, running)
}

export function deleteCompletedKuiPlans(workspaceDir: string, fengzhouSessionId: string): void {
  const plans = readFengzhouPlansSync(workspaceDir, fengzhouSessionId)
  const remaining = plans.filter(p => p.status !== 'completed')
  if (remaining.length === 0) {
    const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
    try {
      unlinkSync(path)
    } catch {
      // 文件已不存在时无需删除
    }
    return
  }
  writeFengzhouPlansSync(workspaceDir, fengzhouSessionId, remaining)
}

export async function cleanStaleKuiPlans(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = kuiPlansDir(workspaceDir)
  if (!existsSync(dir)) return 0
  let removed = 0
  const files = readdirSync(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const fsid = desanitizeIdSegment(f.slice(0, -5))
    if (!(await isAlive(fsid))) {
      try { unlinkSync(join(dir, f)) } catch { /* 并发删除时忽略 */ }
      removed++
    }
  }
  return removed
}
