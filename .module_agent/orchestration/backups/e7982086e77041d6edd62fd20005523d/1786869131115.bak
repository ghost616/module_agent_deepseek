import { cleanStalePlans } from './development_plan.ts'
import { cleanStaleSessionPlanMap, removeMappingByPlanId } from './session_plan_map.ts'
import {
  cleanStaleModuleSessions,
  cleanStaleGaotaoMap,
  cleanStaleLimuMap,
  cleanStaleLizhuMap,
  cleanStaleLizhuFengzhouMap,
  cleanStaleKuiMap,
} from './module_session_tracker.ts'
import { cleanStaleExecutions } from './execution_result.ts'
import { cleanStaleReviewResults } from './review_result.ts'
import { cleanStaleSessionWorkspaces } from './session_workspace.ts'
import { cleanStaleBindings } from './workspace.ts'
import { cleanStalePlanFilesForModule } from './plan_files.ts'
import { cleanStaleTestSpecs, cleanStaleTestReports } from './testing.ts'
import { cleanStaleKuiPlans } from './kui_plan.ts'
import { readModuleTree } from './module_tree.ts'
import type { IsAlive } from './module_session_tracker.ts'
import type { SessionState } from './session_state.ts'

export interface WorkspaceCleanupStats {
  plans: number
  session_plan_map: number
  module_sessions: number
  gaotao_bindings: number
  limu_bindings: number
  lizhu_bindings: number
  lizhu_fengzhou_bindings: number
  kui_bindings: number
  executions: number
  review_results: number
  kui_plans: number
  test_specs: number
  test_reports: number
}

/** 清理工作空间内引用了已不存在会话的数据。 */
export async function cleanWorkspaceStale(
  isAlive: IsAlive,
  workspaceDir: string,
): Promise<WorkspaceCleanupStats> {
  const deletedPlanIds = await cleanStalePlans(workspaceDir, isAlive)
  for (const planId of deletedPlanIds) {
    await removeMappingByPlanId(workspaceDir, planId)
  }
  const session_plan_map = await cleanStaleSessionPlanMap(workspaceDir, isAlive)
  const module_sessions = await cleanStaleModuleSessions(workspaceDir, isAlive)
  const gaotao_bindings = await cleanStaleGaotaoMap(workspaceDir, isAlive)
  const limu_bindings = await cleanStaleLimuMap(workspaceDir, isAlive)
  const lizhu_bindings = await cleanStaleLizhuMap(workspaceDir, isAlive)
  const lizhu_fengzhou_bindings = await cleanStaleLizhuFengzhouMap(workspaceDir, isAlive)
  const kui_bindings = await cleanStaleKuiMap(workspaceDir, isAlive)
  const executions = await cleanStaleExecutions(workspaceDir, isAlive)
  const review_results = await cleanStaleReviewResults(workspaceDir, isAlive)
  const kui_plans = await cleanStaleKuiPlans(workspaceDir, isAlive)
  const test_specs = await cleanStaleTestSpecs(workspaceDir, isAlive)
  const test_reports = await cleanStaleTestReports(workspaceDir, isAlive)

  return {
    plans: deletedPlanIds.length,
    session_plan_map,
    module_sessions,
    gaotao_bindings,
    limu_bindings,
    lizhu_bindings,
    lizhu_fengzhou_bindings,
    kui_bindings,
    executions,
    review_results,
    kui_plans,
    test_specs,
    test_reports,
  }
}

export interface ExternalCleanupStats {
  session_workspaces: number
  workspace_bindings: number
  plan_files: number
  agent_modes: number
}

/** 清理工作空间外（项目级）引用了已不存在会话的数据，含 session_state 内存中的残留 agent mode。 */
export async function cleanExternalStale(
  isAlive: IsAlive,
  directory: string,
  sessionState: SessionState,
): Promise<ExternalCleanupStats> {
  const session_workspaces = await cleanStaleSessionWorkspaces(directory, isAlive)
  const workspace_bindings = await cleanStaleBindings(directory, isAlive)

  let plan_files = 0
  const tree = await readModuleTree(directory)
  for (const mod of tree.modules) {
    plan_files += await cleanStalePlanFilesForModule(directory, mod.name, isAlive)
  }

  const agent_modes = await sessionState.cleanStaleModes(isAlive)

  return { session_workspaces, workspace_bindings, plan_files, agent_modes }
}
