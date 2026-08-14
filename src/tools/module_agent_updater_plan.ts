import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { findModule } from '../lib/module_tree.ts'
import { writeExecutionRecord } from '../lib/execution_result.ts'
import { addPlanFiles, removePlanFiles } from '../lib/plan_files.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { getPlanIdBySession } from '../lib/session_plan_map.ts'
import { readPlan, readAllMetadata } from '../lib/development_plan.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentUpdaterPlanToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

async function ensureModule(directory: string, moduleName: string): Promise<void> {
  const mod = await findModule(directory, moduleName)
  if (!mod) throw new Error(`模块 '${moduleName}' 不存在`)
}

async function handleWriteResult(
  directory: string,
  sessionId: string,
  args: { module_name?: string; plan?: string; modified_files?: string[]; summary?: string; errors?: string[] },
) {
  const { module_name, plan, modified_files, summary, errors } = args
  if (!module_name || !plan || !modified_files || !summary) {
    return { status: 'error', error: 'write_result 需提供 module_name、plan、modified_files、summary' }
  }

  const wsName = await resolveWorkspace(directory, sessionId)
  if (!wsName) {
    return { status: 'error', error: '当前会话未关联工作空间' }
  }
  const workspaceDir = getWorkspaceDir(directory, wsName)

  const plan_id = await getPlanIdBySession(workspaceDir, sessionId)
  if (!plan_id) {
    return { status: 'error', error: `会话 ${sessionId} 未绑定计划` }
  }
  await ensureModule(directory, module_name)
  await writeExecutionRecord(workspaceDir, module_name, sessionId, {
    plan_id,
    plan,
    modified_files,
    summary,
    errors: errors ?? [],
  })
  return { action: 'write_result', status: 'ok' }
}

async function handleAddPlanFiles(
  directory: string,
  sessionId: string,
  args: { module_name?: string; files?: string[]; status?: 'started' | 'running' },
) {
  const { module_name, files, status } = args
  if (!module_name || !files || !status) {
    return { status: 'error', error: 'add_plan_files 需提供 module_name、files、status' }
  }
  await ensureModule(directory, module_name)
  await addPlanFiles(directory, module_name, sessionId, files, status)
  return { action: 'add_plan_files', status: 'ok', files_count: files.length }
}

async function handleRemovePlanFiles(
  directory: string,
  sessionId: string,
  args: { module_name?: string; files?: string[] },
) {
  const { module_name, files } = args
  if (!module_name || !files) {
    return { status: 'error', error: 'remove_plan_files 需提供 module_name、files' }
  }
  await ensureModule(directory, module_name)
  await removePlanFiles(directory, module_name, sessionId, files)
  return { action: 'remove_plan_files', status: 'ok', removed: files.length }
}

async function handleCheckActivePlan(directory: string, sessionId: string) {
  const wsName = await resolveWorkspace(directory, sessionId)
  if (!wsName) {
    return { status: 'error', error: '当前会话未关联工作空间' }
  }
  const workspaceDir = getWorkspaceDir(directory, wsName)

  const planId = await getPlanIdBySession(workspaceDir, sessionId)
  if (!planId) {
    return { status: 'error', error: '当前会话未关联任何开发计划，无法执行文件修改。' }
  }

  const plan = await readPlan(workspaceDir, planId)
  if (!plan) {
    return { status: 'error', error: `计划 ${planId} 不存在。` }
  }

  const metadata = await readAllMetadata(workspaceDir)
  const meta = metadata.find(m => m.plan_id === planId)
  if (meta?.plan_completed) {
    return { status: 'error', error: `计划 ${planId} 已标记完成，无法继续修改文件。` }
  }

  return { status: 'ok', plan_id: planId, module_name: plan.module_name, plan_completed: false }
}

/**
 * 力牧执行进度管理工具：写入执行记录、写入/移除计划修改文件列表、检测计划有效性。
 * 力牧计划有效性守卫（limuPlanGuard）由 orchestration 模块通过 tools.guard 挂载。
 */
export function createModuleAgentUpdaterPlanTool(options: ModuleAgentUpdaterPlanToolOptions) {
  return defineTool({
    name: 'module_agent_updater_plan',
    description: `
力牧执行进度管理工具。
支持操作：
- write_result：写入执行记录
- add_plan_files：写入计划修改的文件列表
- remove_plan_files：移除已修改完成的文件
- check_active_plan：检测计划有效性`,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['write_result', 'add_plan_files', 'remove_plan_files', 'check_active_plan'],
        description: '操作类型',
      },
      module_name: {
        type: 'string',
        description: '模块唯一标识名称',
      },
      plan: {
        type: 'string',
        description: 'write_result：开发计划摘要',
      },
      summary: {
        type: 'string',
        description: 'write_result：执行总结',
      },
      modified_files: {
        type: 'array',
        items: { type: 'string' },
        description: 'write_result：修改文件列表',
      },
      errors: {
        type: 'array',
        items: { type: 'string' },
        description: 'write_result：错误信息列表',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'add_plan_files / remove_plan_files：文件路径列表',
      },
      status: {
        type: 'string',
        enum: ['started', 'running'],
        description: 'add_plan_files：执行状态',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const action = args.action
      const mode = options.sessionState.getAgentMode(agentId)

      if (mode !== 'limu') {
        return { status: 'error', error: 'module_agent_updater_plan 仅供力牧调用。' }
      }

      // TODO(orchestration)：力牧计划有效性守卫（limuPlanGuard）由 orchestration
      // 模块通过 tools.guard 挂载，本模块不重复实现。

      try {
        if (action === 'write_result') return handleWriteResult(directory, agentId, args)
        if (action === 'add_plan_files') return handleAddPlanFiles(directory, agentId, args)
        if (action === 'remove_plan_files') return handleRemovePlanFiles(directory, agentId, args)
        if (action === 'check_active_plan') return handleCheckActivePlan(directory, agentId)
        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
