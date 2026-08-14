import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { moduleAgentDir, CHANGE_HISTORY_FILE } from '../lib/constants.ts'
import { findModule } from '../lib/module_tree.ts'
import { updateSpecSection } from '../lib/module_spec.ts'
import { modifyDefinition, readModuleDefinition, writeModuleDefinition } from '../lib/module_definition.ts'
import { exists, readText, writeText } from '../lib/fs.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { getKuiStarter } from '../lib/module_session_tracker.ts'
import { readKuiPlan, writeKuiPlan } from '../lib/kui_plan.ts'
import { readAllMetadata, readPlan } from '../lib/development_plan.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentUpdaterToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

async function ensureModule(directory: string, moduleName: string): Promise<void> {
  const mod = await findModule(directory, moduleName)
  if (!mod) throw new Error(`模块 '${moduleName}' 不存在`)
}

async function doAppendHistory(directory: string, moduleName: string, sessionId: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [session: ${sessionId}] ${message}\n`
  const logPath = join(moduleAgentDir(directory, moduleName), CHANGE_HISTORY_FILE)
  let current = ''
  if (await exists(logPath)) current = await readText(logPath)
  await writeText(logPath, current + line)
}

/**
 * 增量更新模块元数据文件（current_spec / module_definition / change_history），
 * 以及夔计划的 update_kui_plan 操作（更新状态与结果，仅供夔调用）。
 */
export function createModuleAgentUpdaterTool(options: ModuleAgentUpdaterToolOptions) {
  return defineTool({
    name: 'module_agent_updater',
    description: `
增量更新模块元数据文件。
支持操作：
- update_spec： 增/改 current_spec.md 中指定 heading 下的内容。heading 必须为功能领域描述（如"数据访问层"、"会话管理"），禁止使用类名或文件名如 JsonMapper/SessionManager
- update_definition： 增/删/改 module_definition.json 中的文件条目
- move_definition： 将文件定义从一个模块移动到另一个模块，并在双方追加日志
- append_history： 向 change_history.log 追加变更记录
- update_kui_plan： 更新夔计划的状态和结果（仅供夔调用）`,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['update_spec', 'update_definition', 'move_definition', 'append_history', 'update_kui_plan'],
        description: '操作类型',
      },
      module_name: {
        type: 'string',
        description: '模块唯一标识名称',
      },
      heading: {
        type: 'string',
        description: 'update_spec：要修改的二级标题名（不含 ## 前缀）。必须是功能领域描述（如"数据访问层"、"会话管理"），禁止使用类名或文件名',
      },
      content: {
        type: 'string',
        description: 'update_spec：该 section 的新增内容',
      },
      mode: {
        type: 'string',
        enum: ['set', 'add'],
        description: 'update_spec：set=替换；add=追加（默认 add）',
      },
      files_to_add: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            description: { type: 'string', required: true },
          },
        },
        description: 'update_definition：新增文件条目（description 为该文件整体功能职责的完整说明）',
      },
      files_to_remove: {
        type: 'array',
        items: { type: 'string' },
        description: 'update_definition：按路径删除文件条目',
      },
      files_to_update: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            description: { type: 'string', required: true },
          },
        },
        description: 'update_definition：按路径更新 description（会整体替换旧 description，须提供包含文件已有职责的完整累积说明，避免覆盖历史说明；本次计划变更请记入 append_history）',
      },
      target_module_name: {
        type: 'string',
        description: 'move_definition：目标模块名称',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'move_definition：要移动的文件路径列表',
      },
      entry: {
        type: 'string',
        description: 'append_history：变更描述',
      },
      kui_plan_id: {
        type: 'string',
        description: 'update_kui_plan：夔计划 ID（从 read_kui_plan 返回的计划中获取）',
      },
      status: {
        type: 'string',
        enum: ['pending', 'running', 'completed'],
        description: 'update_kui_plan：夔计划状态',
      },
      result: {
        type: 'string',
        description: 'update_kui_plan：夔计划执行结果',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      const action = args.action

      const fengzhouAllowed = ['update_definition', 'move_definition', 'update_spec']
      const lishouAllowed = ['update_spec']

      if (action === 'update_kui_plan') {
        if (mode !== 'kui') {
          return { status: 'error', error: 'module_agent_updater action="update_kui_plan" 仅供夔调用。' }
        }
        return handleUpdateKuiPlan(directory, agentId, args)
      }

      if (mode === 'fengzhou' && !fengzhouAllowed.includes(action)) {
        return { status: 'error', error: '风后仅可使用 module_agent_updater 的 update_definition、move_definition 和 update_spec 操作。' }
      }
      if (mode === 'lishou' && !lishouAllowed.includes(action)) {
        return { status: 'error', error: '隶首仅可使用 module_agent_updater 的 update_spec 操作。' }
      }
      if (mode !== 'limu' && mode !== 'fengzhou' && mode !== 'lishou') {
        return { status: 'error', error: `module_agent_updater action="${action}" 权限不足。` }
      }

      // TODO(orchestration)：力牧计划有效性守卫（limuPlanGuard）由 orchestration
      // 模块通过 tools.guard 挂载，本模块不重复实现。

      try {
        if (action === 'update_spec') return handleUpdateSpec(directory, args)
        if (action === 'update_definition') return handleUpdateDefinition(directory, args)
        if (action === 'move_definition') return handleMoveDefinition(directory, agentId, args)
        if (action === 'append_history') return handleAppendHistory(directory, agentId, args)
        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}

async function handleUpdateSpec(
  directory: string,
  args: { module_name?: string; heading?: string; content?: string; mode?: 'set' | 'add' },
) {
  const { module_name, heading, content } = args
  const mode = args.mode ?? 'add'
  if (!module_name || !heading || content === undefined) {
    return { status: 'error', error: 'update_spec 需提供 module_name、heading、content' }
  }
  await ensureModule(directory, module_name)
  await updateSpecSection(directory, module_name, heading, mode, content)
  return {
    action: 'update_spec',
    status: 'ok',
    heading,
    path: `.module_agent/${module_name}/current_spec.md`,
  }
}

async function handleUpdateDefinition(
  directory: string,
  args: {
    module_name?: string
    files_to_add?: { path: string; description: string }[]
    files_to_remove?: string[]
    files_to_update?: { path: string; description: string }[]
  },
) {
  const { files_to_add, files_to_remove, files_to_update } = args
  const module_name = args.module_name
  if (!module_name) {
    return { status: 'error', error: 'update_definition 需提供 module_name' }
  }
  if (!files_to_add && !files_to_remove && !files_to_update) {
    return { status: 'error', error: '至少提供一个操作：files_to_add / files_to_remove / files_to_update' }
  }
  await ensureModule(directory, module_name)
  const defArgs: {
    files_to_add?: { path: string; description: string }[]
    files_to_remove?: string[]
    files_to_update?: { path: string; description: string }[]
  } = {}
  if (files_to_add !== undefined) defArgs.files_to_add = files_to_add
  if (files_to_remove !== undefined) defArgs.files_to_remove = files_to_remove
  if (files_to_update !== undefined) defArgs.files_to_update = files_to_update
  await modifyDefinition(directory, module_name, defArgs)
  const changes: string[] = []
  if (files_to_add?.length) changes.push(`新增 ${files_to_add.length} 个文件`)
  if (files_to_remove?.length) changes.push(`移除 ${files_to_remove.length} 个文件`)
  if (files_to_update?.length) changes.push(`更新 ${files_to_update.length} 个文件`)
  return { action: 'update_definition', status: 'ok', changes }
}

async function handleMoveDefinition(
  directory: string,
  sessionId: string,
  args: { module_name?: string; target_module_name?: string; paths?: string[] },
) {
  const { module_name, target_module_name, paths } = args
  if (!module_name || !target_module_name || !paths || paths.length === 0) {
    return { status: 'error', error: 'move_definition 需提供 module_name、target_module_name、paths' }
  }
  await ensureModule(directory, module_name)
  await ensureModule(directory, target_module_name)
  const srcDef = await readModuleDefinition(directory, module_name)
  const moveSet = new Set(paths)
  const movedFiles = srcDef.files.filter((f) => moveSet.has(f.path))
  const remaining = srcDef.files.filter((f) => !moveSet.has(f.path))
  await writeModuleDefinition(directory, module_name, { module_name, files: remaining })
  const targetDef = await readModuleDefinition(directory, target_module_name)
  const targetExisting = new Set(targetDef.files.map((f) => f.path))
  const newFiles = movedFiles.filter((f) => !targetExisting.has(f.path))
  await writeModuleDefinition(directory, target_module_name, { module_name: target_module_name, files: [...targetDef.files, ...newFiles] })
  const movedList = movedFiles.map((f) => f.path).join(', ')
  await doAppendHistory(directory, module_name, sessionId, `移出文件定义到 [${target_module_name}]: ${movedList}`)
  await doAppendHistory(directory, target_module_name, sessionId, `从 [${module_name}] 移入文件定义: ${movedList}`)
  return {
    action: 'move_definition',
    status: 'ok',
    moved: movedFiles.map((f) => f.path),
    from: module_name,
    to: target_module_name,
  }
}

async function handleAppendHistory(
  directory: string,
  sessionId: string,
  args: { module_name?: string; entry?: string },
) {
  const { module_name, entry } = args
  if (!module_name || !entry) {
    return { status: 'error', error: 'append_history 需提供 module_name、entry' }
  }
  await ensureModule(directory, module_name)
  await doAppendHistory(directory, module_name, sessionId, entry)
  return { action: 'append_history', status: 'ok', entry }
}

async function handleUpdateKuiPlan(
  directory: string,
  sessionId: string,
  args: { kui_plan_id?: string; status?: 'pending' | 'running' | 'completed'; result?: string },
) {
  const { kui_plan_id, status, result } = args
  if (!kui_plan_id) {
    return { status: 'error', error: 'update_kui_plan 需提供 kui_plan_id' }
  }
  if (!status && result === undefined) {
    return { status: 'error', error: 'update_kui_plan 需至少提供 status 或 result' }
  }

  const boundWs = await resolveWorkspace(directory, sessionId)
  if (!boundWs) {
    return { status: 'error', error: '未绑定工作空间' }
  }
  const wsDir = getWorkspaceDir(directory, boundWs)

  const fengzhouSessionId = await getKuiStarter(wsDir, sessionId)
  if (!fengzhouSessionId) {
    return { status: 'error', error: '夔未绑定到风后' }
  }

  const plan = await readKuiPlan(wsDir, fengzhouSessionId, kui_plan_id)
  if (!plan) {
    return { status: 'error', error: `夔计划 ${kui_plan_id} 不存在` }
  }

  if (status === 'completed' && plan.plan_ids && plan.plan_ids.length > 0) {
    const allMeta = await readAllMetadata(wsDir)
    const pendingComplete: { plan_id: string; module_name: string; session_id: string }[] = []
    const pendingReview: { plan_id: string; module_name: string }[] = []

    for (const pid of plan.plan_ids) {
      const meta = allMeta.find(m => m.plan_id === pid)
      if (!meta) continue

      if (!meta.plan_completed) {
        const detail = await readPlan(wsDir, pid)
        pendingComplete.push({
          plan_id: pid,
          module_name: detail?.module_name ?? '',
          session_id: detail?.session_id ?? '',
        })
      } else if (!meta.code_reviewed) {
        const detail = await readPlan(wsDir, pid)
        pendingReview.push({ plan_id: pid, module_name: detail?.module_name ?? '' })
      }
    }

    if (pendingComplete.length > 0 || pendingReview.length > 0) {
      return {
        status: 'error',
        pending_complete: pendingComplete,
        pending_review: pendingReview,
      }
    }
  }

  if (status) plan.status = status
  if (status === 'running') plan.kui_session_id = sessionId
  if (result !== undefined) plan.result = result

  await writeKuiPlan(wsDir, fengzhouSessionId, plan)

  return { action: 'update_kui_plan', status: 'ok', kui_plan_id }
}
