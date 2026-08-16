import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { getBoundWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { cleanWorkspaceStale, cleanExternalStale } from '../lib/stale_cleanup.ts'
import { SubagentHost } from '../lib/subagent_host.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentCleanupToolOptions {
  /** 插件根上下文（sessions / sessionPersistence / subagents）。 */
  readonly ctx: Context
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
  /** 启动子智能体使用的 subagent provider 名。 */
  readonly subagentProvider: string
}

/**
 * 清理失效数据（引用了已不存在会话的数据）。clean_workspace 清理当前绑定
 * 工作空间内的失效数据；clean_external 清理工作空间外（项目级）的失效数据。仅供风后调用。
 */
export function createModuleAgentCleanupTool(options: ModuleAgentCleanupToolOptions) {
  return defineTool({
    name: 'module_agent_cleanup',
    description: '清理失效数据（引用了已不存在会话的数据）。clean_workspace 清理当前绑定工作空间内的失效数据；clean_external 清理工作空间外（项目级）的失效数据。仅供风后调用。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['clean_workspace', 'clean_external'],
        description: 'clean_workspace 清理空间内失效数据；clean_external 清理空间外失效数据',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const agent = exec.agent
      const agentId = agent?.id ?? ''
      if (options.sessionState.getAgentMode(agentId) !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_cleanup 仅供风后调用。请先使用 module_agent_start 激活风后力牧模式。' }
      }

      const directory = directoryOfAgent(agent, options.dataDir)
      const action = (args as { action?: string }).action ?? ''
      const host = new SubagentHost(options.ctx, options.subagentProvider)
      const isAlive = host.isAlive.bind(host)

      if (action === 'clean_workspace') {
        const boundWs = await getBoundWorkspace(directory, agentId)
        if (!boundWs) {
          return { status: 'error', error: '请先通过 workspace(action="create"|"bind") 绑定工作空间' }
        }
        const workspaceDir = getWorkspaceDir(directory, boundWs)
        const removed = await cleanWorkspaceStale(isAlive, workspaceDir)
        return { status: 'ok', scope: 'workspace', removed: removed as unknown as JsonValue }
      }

      if (action === 'clean_external') {
        const removed = await cleanExternalStale(isAlive, directory)
        return { status: 'ok', scope: 'external', removed: removed as unknown as JsonValue }
      }

      return { status: 'error', error: `未知 action: ${action}` }
    },
  })
}
