import { resolveWorkspace, getWorkspaceDir } from './workspace.ts'
import { getPlanIdBySession } from './session_plan_map.ts'
import { readPlan, readAllMetadata } from './development_plan.ts'

/**
 * 力牧计划有效性守卫：会话必须已关联工作空间、存在未完成的开发计划。
 * 不合法时返回拒绝理由（工具拒绝信息），合法返回 null。
 */
export async function limuPlanGuard(directory: string, sessionId: string): Promise<string | null> {
  const ws = await resolveWorkspace(directory, sessionId)
  if (!ws) {
    return '当前会话未关联工作空间'
  }

  const wsDir = getWorkspaceDir(directory, ws)
  const planId = await getPlanIdBySession(wsDir, sessionId)
  if (!planId) {
    return '当前会话未关联任何开发计划，无法执行操作。'
  }

  const plan = await readPlan(wsDir, planId)
  if (!plan) {
    return `计划 ${planId} 不存在。`
  }

  const metadata = await readAllMetadata(wsDir)
  const meta = metadata.find(m => m.plan_id === planId)
  if (meta?.plan_completed) {
    return `计划 ${planId} 已完成，无法继续操作。`
  }

  return null
}

/** 计划无效时抛错（供 tools/pre-execute 异步守卫使用）。 */
export async function checkLimuPlanActive(directory: string, sessionId: string): Promise<void> {
  const reason = await limuPlanGuard(directory, sessionId)
  if (reason !== null) {
    throw new Error(reason)
  }
}
