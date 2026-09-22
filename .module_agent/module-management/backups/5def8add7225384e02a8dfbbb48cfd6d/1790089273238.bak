import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { CLASSIFIER_RULES } from '../lib/classifier_rules.ts'
import { directoryOfAgent, persistMode, type SessionState } from '../lib/session_state.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentClassifierToolOptions {
  /** 会话模式注册表（用于校验与写入调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/**
 * 启动隶首文件分析与模块设计补充模式。
 * CRITICAL：若风后力牧或岐伯已激活则禁止使用——隶首与风后力牧、岐伯互斥，同一会话只能激活其一。
 */
export function createModuleAgentClassifierTool(options: ModuleAgentClassifierToolOptions) {
  return defineTool({
    name: 'module_agent_classifier',
    description:
      '启动隶首文件分析与模块设计补充模式。CRITICAL：若风后力牧或岐伯已激活则禁止使用——隶首与风后力牧、岐伯互斥，同一会话只能激活其一。',
    parameters: {},
    output: jsonToolOutput(),
    async execute(_args, exec) {
      const agentId = exec.agent?.id ?? ''
      const current = options.sessionState.getAgentMode(agentId)
      if (current === 'fengzhou') {
        return { status: 'error', error: '风后力牧已在此会话中激活。隶首与风后力牧互斥，无法同时加载。请在新会话中加载隶首。' }
      }
      if (current === 'qibo') {
        return { status: 'error', error: '岐伯已在此会话中激活。隶首与岐伯互斥，无法同时加载。请在新会话中加载隶首。' }
      }
      if (current === 'limu') {
        return { status: 'error', error: '力牧已在此会话中激活，无法启动隶首。请在新会话中操作。' }
      }
      if (current === 'gaotao') {
        return { status: 'error', error: '皋陶已在此会话中激活，无法启动隶首。请在新会话中操作。' }
      }
      if (current === 'lizhu') {
        return { status: 'error', error: '离朱已在此会话中激活，无法启动隶首。请在新会话中操作。' }
      }

      options.sessionState.setAgentMode(agentId, 'lishou')
      // 宿主会话身份经文件持久化，重启后由 agent/session-start 恢复。
      persistMode(directoryOfAgent(exec.agent, options.dataDir), agentId, 'lishou')

      if (CLASSIFIER_RULES.trim()) {
        exec.deferContext(createUserMessage({
          content: [{ type: 'text', text: CLASSIFIER_RULES }] satisfies ContentBlock[],
          source: {
            kind: 'plugin',
            plugin: 'module-agent',
            form: 'instructions',
          },
        }))
      }

      return {
        status: 'ok',
        message: CLASSIFIER_RULES.trim()
          ? '隶首文件分析规则已注入当前会话。'
          : '隶首已激活（提示语待补充）。',
      }
    },
  })
}
