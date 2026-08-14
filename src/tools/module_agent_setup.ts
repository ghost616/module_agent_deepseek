import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SETUP_GUIDE } from '../lib/setup_guide.ts'
import { type SessionState } from '../lib/session_state.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentSetupToolOptions {
  /** 会话模式注册表（校验互斥并写入 qibo 模式）。 */
  readonly sessionState: SessionState
}

/** 启动岐伯项目设置向导，注入设置规则。 */
export function createModuleAgentSetupTool(options: ModuleAgentSetupToolOptions) {
  return defineTool({
    name: 'module_agent_setup',
    description:
      '启动岐伯项目设置向导，注入设置规则。CRITICAL：若风后力牧（module_agent_start）已激活则禁止使用——风后力牧与岐伯互斥，同一会话只能激活其一。仅在风后力牧未激活时可用。',
    parameters: {},
    output: jsonToolOutput(),
    async execute(_args, exec) {
      const agent = exec.agent
      const sessionId = agent?.id ?? ''
      const current = options.sessionState.getAgentMode(sessionId)

      if (current === 'fengzhou') {
        return { status: 'error', error: '风后力牧已在此会话中激活。岐伯与风后力牧互斥，无法同时加载。请在新会话中加载岐伯。' }
      }
      if (current === 'limu') {
        return { status: 'error', error: '力牧已在此会话中激活，无法启动岐伯。请在新会话中操作。' }
      }
      if (current === 'gaotao') {
        return { status: 'error', error: '皋陶已在此会话中激活，无法启动岐伯。请在新会话中操作。' }
      }
      if (current === 'lishou') {
        return { status: 'error', error: '隶首已在此会话中激活。岐伯与隶首互斥，无法同时加载。请在新会话中加载岐伯。' }
      }
      if (current === 'lizhu') {
        return { status: 'error', error: '离朱已在此会话中激活，无法启动岐伯。请在新会话中操作。' }
      }

      options.sessionState.setAgentMode(sessionId, 'qibo')

      if (agent) {
        const message = createUserMessage({
          content: [{ type: 'text', text: SETUP_GUIDE }] satisfies ContentBlock[],
          source: {
            kind: 'plugin',
            plugin: 'module-agent',
            form: 'notice',
            summary: '岐伯设置向导已注入',
          },
        })
        agent.inject(message)
      }

      return { status: 'ok', message: '岐伯已注入当前会话，AI 将引导你逐步完成代码规范、需求设计和模块设计。' }
    },
  })
}
