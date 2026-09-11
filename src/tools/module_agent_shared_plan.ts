import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { readSharedPlans, appendSharedPlan, removeSharedPlan } from '../lib/shared_plan.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface SharedPlanToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 风后共享计划：在工作空间内写入/读取/删除计划，其他风后会话可读取。 */
export function createModuleAgentSharedPlanTool(options: SharedPlanToolOptions) {
  return defineTool({
    name: 'module_agent_shared_plan',
    description:
      '风后共享计划管理。write=向当前工作空间追加一条纯文本计划并返回新计划 id，read=读取当前工作空间全部计划，delete=按 id 删除计划。仅风后可调用。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['write', 'read', 'delete'],
        description: '操作类型：write 写入计划，read 读取全部计划，delete 按 id 删除计划',
      },
      content: {
        type: 'string',
        description: 'action=write 时必填：计划内容（纯文本）',
      },
      id: {
        type: 'string',
        description: 'action=delete 时必填：要删除的计划 id（从 read 返回结果中获取）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const sessionId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(sessionId)
      if (mode !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_shared_plan 仅供风后调用。' }
      }

      const ws = resolveWorkspace(directory, sessionId)
      if (!ws) {
        return { status: 'error', error: '未关联工作空间' }
      }
      const workspaceDir = getWorkspaceDir(directory, ws)

      if (args.action === 'write') {
        if (!args.content) {
          return { status: 'error', error: 'action=write 时必须提供 content' }
        }
        const entry = appendSharedPlan(workspaceDir, args.content, sessionId)
        return { status: 'ok', id: entry.id, created_at: entry.created_at }
      }

      if (args.action === 'read') {
        const plans = readSharedPlans(workspaceDir)
        const entries = plans.map((p, i) => ({
          index: i,
          id: p.id,
          content: p.content,
          created_by: p.created_by,
          created_at: p.created_at,
        }))
        return { status: 'ok', plans: entries }
      }

      if (args.action === 'delete') {
        if (!args.id) {
          return { status: 'error', error: 'action=delete 时必须提供 id' }
        }
        const ok = removeSharedPlan(workspaceDir, args.id)
        if (!ok) {
          return { status: 'error', error: `计划 id ${args.id} 不存在` }
        }
        return { status: 'ok', message: `计划 ${args.id} 已删除` }
      }

      return { status: 'error', error: `未知 action: ${args.action}` }
    },
  })
}
