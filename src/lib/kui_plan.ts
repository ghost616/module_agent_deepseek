import { mkdir, unlink, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { exists, readJson, writeText } from './fs.ts'
import type { KuiPlan } from './types.ts'

function kuiPlansDir(workspaceDir: string): string {
  return join(workspaceDir, 'kui_plans')
}

function fengzhouPlansPath(workspaceDir: string, fengzhouSessionId: string): string {
  return join(kuiPlansDir(workspaceDir), `${fengzhouSessionId}.json`)
}

export async function readFengzhouPlans(workspaceDir: string, fengzhouSessionId: string): Promise<KuiPlan[]> {
  const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
  if (!(await exists(path))) return []
  try {
    return await readJson<KuiPlan[]>(path)
  } catch {
    return []
  }
}

async function writeFengzhouPlans(workspaceDir: string, fengzhouSessionId: string, plans: KuiPlan[]): Promise<void> {
  const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
  await mkdir(dirname(path), { recursive: true })
  await writeText(path, JSON.stringify(plans, null, 2))
}

export async function readKuiPlan(workspaceDir: string, fengzhouSessionId: string, kuiPlanId: string): Promise<KuiPlan | null> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  return plans.find(p => p.kui_plan_id === kuiPlanId) ?? null
}

export async function writeKuiPlan(workspaceDir: string, fengzhouSessionId: string, plan: KuiPlan): Promise<void> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  const idx = plans.findIndex(p => p.kui_plan_id === plan.kui_plan_id)
  if (idx >= 0) {
    plans[idx] = plan
  } else {
    plans.push(plan)
  }
  await writeFengzhouPlans(workspaceDir, fengzhouSessionId, plans)
}

export async function readFirstPendingKuiPlan(workspaceDir: string, fengzhouSessionId: string): Promise<KuiPlan | null> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  return plans.find(p => p.status === 'pending') ?? null
}

export async function hasUncompletedKuiPlan(workspaceDir: string, fengzhouSessionId: string): Promise<boolean> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  return plans.some(p => p.status !== 'completed')
}

export async function getCompletedKuiPlans(workspaceDir: string, fengzhouSessionId: string): Promise<KuiPlan[]> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  return plans.filter(p => p.status === 'completed')
}

export async function appendPlanIdToRunningKuiPlan(
  workspaceDir: string,
  fengzhouSessionId: string,
  kuiSessionId: string,
  planId: string,
): Promise<void> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  const running = plans.find(p => p.status === 'running' && p.kui_session_id === kuiSessionId)
  if (!running) return
  if (!running.plan_ids) running.plan_ids = []
  running.plan_ids.push(planId)
  await writeKuiPlan(workspaceDir, fengzhouSessionId, running)
}

export async function deleteCompletedKuiPlans(workspaceDir: string, fengzhouSessionId: string): Promise<void> {
  const plans = await readFengzhouPlans(workspaceDir, fengzhouSessionId)
  const remaining = plans.filter(p => p.status !== 'completed')
  if (remaining.length === 0) {
    const path = fengzhouPlansPath(workspaceDir, fengzhouSessionId)
    try {
      await unlink(path)
    } catch {
      // 文件已不存在时无需删除
    }
    return
  }
  await writeFengzhouPlans(workspaceDir, fengzhouSessionId, remaining)
}

export async function cleanStaleKuiPlans(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const dir = kuiPlansDir(workspaceDir)
  if (!(await exists(dir))) return 0
  let removed = 0
  const files = await readdir(dir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const fsid = f.slice(0, -5)
    if (!(await isAlive(fsid))) {
      try { await unlink(join(dir, f)) } catch { /* 并发删除时忽略 */ }
      removed++
    }
  }
  return removed
}
