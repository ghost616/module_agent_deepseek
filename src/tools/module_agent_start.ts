import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ORCHESTRATOR_RULES } from '../lib/orchestrator_rules.ts'
import { type SessionState } from '../lib/session_state.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentStartToolOptions {
  /** 插件根上下文（logger）。 */
  readonly ctx: Context
  /** 会话模式注册表（用于标记当前会话为风后身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/**
 * 启动力牧编排模式：校验互斥身份后，将当前会话标记为风后并向其注入风后力牧规则。
 * dsh 侧以 sessionState.setAgentMode + agent.inject 替代 opencode 的
 * setAgentMode + client.session.prompt(noReply)。
 */
export function createModuleAgentStartTool(options: ModuleAgentStartToolOptions) {
  return defineTool({
    name: 'module_agent_start',
    description: '启动力牧编排模式，注入风后力牧规则。CRITICAL：若岐伯（module_agent_setup）已激活则禁止使用——风后力牧与岐伯互斥，同一会话只能激活其一。仅在岐伯未激活时可用。',
    parameters: {},
    output: jsonToolOutput(),
    async execute(_args, exec) {
      const agent = exec.agent
      const agentId = agent?.id ?? ''
      const current = options.sessionState.getAgentMode(agentId)
      if (current === 'qibo') {
        return { status: 'error', error: '岐伯已在此会话中激活。风后力牧与岐伯互斥，无法同时加载。请在新会话中加载风后力牧。' }
      }
      if (current === 'limu') {
        return { status: 'error', error: '力牧已在此会话中激活，无法启动风后力牧。请在新会话中操作。' }
      }
      if (current === 'gaotao') {
        return { status: 'error', error: '皋陶已在此会话中激活，无法启动风后力牧。请在新会话中操作。' }
      }
      if (current === 'lishou') {
        return { status: 'error', error: '隶首已在此会话中激活。风后力牧与隶首互斥，无法同时加载。请在新会话中加载风后力牧。' }
      }
      if (current === 'lizhu') {
        return { status: 'error', error: '离朱已在此会话中激活，无法启动风后力牧。请在新会话中操作。' }
      }

      options.sessionState.setAgentMode(agentId, 'fengzhou')

      if (agent) {
        agent.inject(createUserMessage({
          content: [{ type: 'text', text: ORCHESTRATOR_RULES }],
          source: {
            kind: 'plugin',
            plugin: 'module-agent',
            form: 'notice',
            summary: '风后力牧规则注入',
          },
        }))
      }

      options.ctx.logger.info('module-agent: Orchestrator rules injected into session', { sessionID: agentId })

      return { status: 'ok', message: '风后力牧开发规则已注入当前会话，现在可以开始模块开发工作。' }
    },
  })
}
