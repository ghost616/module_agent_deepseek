import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, isFrameworkSubagentMode, type AgentMode, type SessionState } from '../lib/session_state.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import {
  getLimuStarter,
  getGaotaoStarter,
  getBoundStarter,
  getKuiStarter,
} from '../lib/module_session_tracker.ts'
import { isWorking, recordActivity } from '../lib/limu_monitor.ts'
import {
  statusReportExists,
  writeStatusReport,
  readStatusReport,
  deleteStatusReport,
} from '../lib/status_report.ts'
import { SubagentHost } from '../lib/subagent_host.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'
import { recoverAgentMode } from './module_agent_executor.ts'

export interface ModuleAgentStatusToolOptions {
  /** 插件根上下文（subagents / sessions / agents / logger）。 */
  readonly ctx: Context
  /** 会话模式注册表（用于校验调用者身份与解析目标角色）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
  /** 启动子智能体使用的 subagent provider 名。 */
  readonly subagentProvider: string
}

interface StatusArgs {
  action?: string
  session_id?: string
  content?: string
}

/** 按目标角色在绑定表中查询其启动者（真实父级的持久化记录）。 */
function starterOf(workspaceDir: string, sessionId: string, mode: AgentMode | undefined): string | null {
  switch (mode) {
    case 'limu':
      return getLimuStarter(workspaceDir, sessionId)
    case 'gaotao':
      return getGaotaoStarter(workspaceDir, sessionId)
    case 'lizhu':
      return getBoundStarter(workspaceDir, sessionId)
    case 'kui':
      return getKuiStarter(workspaceDir, sessionId)
    default:
      return null
  }
}

/**
 * 校验调用者是否为目标的真实父级：绑定表记录的启动者（若存在）必须等于调用者，
 * 且 dsh 父子关系（host.childAlive）成立。绑定表缺失时仅以 dsh 父子关系判定。
 */
async function isRealParent(
  host: SubagentHost,
  workspaceDir: string,
  sessionId: string,
  callerId: string,
  targetMode: AgentMode | undefined,
): Promise<boolean> {
  const starter = starterOf(workspaceDir, sessionId, targetMode)
  if (starter !== null && starter !== callerId) return false
  return host.childAlive(sessionId, callerId)
}

/**
 * 父子会话状态问询工具：父会话（风后/夔/力牧）经 ask 唤醒子会话概括进度并写入状态文件，
 * 子会话经 write 写入状态文件，父会话经 read 读取并消费（删除）状态文件。状态文件的存在
 * 与否可作为子会话结束返回的信号。ask/read 仅供风后/夔/力牧，write 仅供框架子会话。
 */
export function createModuleAgentStatusTool(options: ModuleAgentStatusToolOptions) {
  return defineTool({
    name: 'module_agent_status',
    description: '父子会话状态问询：ask 唤醒子会话概括进度并写入状态文件，write 由子会话写入状态文件，read 由父会话读取并消费状态文件。ask/read 仅供风后/夔/力牧，write 仅供框架子会话。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['ask', 'write', 'read'],
        description: 'ask 父会话向子会话询问状态（参数 session_id），write 子会话写入状态（参数 content），read 父会话读取状态（参数 session_id）',
      },
      session_id: { type: 'string', description: '目标子会话 ID（action=ask/read 时必填）' },
      content: { type: 'string', description: '状态摘要内容（action=write 时必填）' },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const caller = exec.agent
      const callerId = caller?.id ?? ''
      if (!caller) {
        return { status: 'error', error: 'module_agent_status 需要在 agent 上下文中调用。' }
      }

      const directory = directoryOfAgent(caller, options.dataDir)
      const ctx = options.ctx
      const sessionState = options.sessionState
      const statusArgs = args as StatusArgs
      const action = statusArgs.action ?? ''
      const callerMode = sessionState.getAgentMode(callerId) ?? (await recoverAgentMode(ctx, directory, callerId))

      if (action === 'write') {
        if (!isFrameworkSubagentMode(callerMode)) {
          return { status: 'error', error: 'module_agent_status action="write" 仅供框架子会话（力牧/皋陶/离朱/夔）调用。' }
        }
        const content = statusArgs.content
        if (!content) {
          return { status: 'error', error: 'action="write" 需提供 content。' }
        }
        const wsName = resolveWorkspace(directory, callerId)
        if (!wsName) {
          return { status: 'error', error: '无法解析当前会话的工作空间，请确认已绑定工作空间。' }
        }
        writeStatusReport(getWorkspaceDir(directory, wsName), callerId, content, callerMode)
        return { status: 'ok', session_id: callerId, message: '已写入当前会话状态。' }
      }

      if (action !== 'ask' && action !== 'read') {
        return { status: 'error', error: `未知 action: ${action}` }
      }

      if (callerMode !== 'fengzhou' && callerMode !== 'kui' && callerMode !== 'limu') {
        return { status: 'error', error: 'module_agent_status 仅供风后、夔或力牧调用。' }
      }

      const sessionId = statusArgs.session_id
      if (!sessionId) {
        return { status: 'error', error: `action="${action}" 需提供 session_id。` }
      }

      const host = new SubagentHost(ctx, options.subagentProvider)
      if (!(await host.isAlive(sessionId))) {
        return { status: 'error', error: `会话 ${sessionId} 不存在。` }
      }

      const targetMode = sessionState.getAgentMode(sessionId) ?? (await recoverAgentMode(ctx, directory, sessionId))
      const wsName = resolveWorkspace(directory, sessionId) ?? resolveWorkspace(directory, callerId)
      if (!wsName) {
        return { status: 'error', error: `无法解析会话 ${sessionId} 的工作空间。` }
      }
      const workspaceDir = getWorkspaceDir(directory, wsName)

      if (!(await isRealParent(host, workspaceDir, sessionId, callerId, targetMode))) {
        return { status: 'error', error: `会话 ${sessionId} 不是当前会话的直接子会话，无法操作。` }
      }

      if (action === 'ask') {
        if (isWorking(sessionId)) {
          return { status: 'error', error: '子会话正在执行中，请稍后 ask。' }
        }
        await host.followup(
          caller,
          sessionId,
          '请概括你当前进度，并调用 module_agent_status(action="write", content="...") 写入状态。',
          exec.signal,
        )
        recordActivity(sessionId)
        return { status: 'ok', session_id: sessionId, message: `已向子会话 ${sessionId} 发送状态问询。` }
      }

      if (!statusReportExists(workspaceDir, sessionId)) {
        return { status: 'error', error: '当前子会话没有状态文件可读，请先 ask 或等待。' }
      }
      const report = readStatusReport(workspaceDir, sessionId)
      deleteStatusReport(workspaceDir, sessionId)
      if (!report) {
        return { status: 'error', error: '状态文件无法解析，已清理，请重新 ask。' }
      }
      return {
        status: 'ok',
        session_id: sessionId,
        mode: report.mode,
        content: report.content,
        updated_at: report.updated_at,
      } as unknown as JsonValue
    },
  })
}
