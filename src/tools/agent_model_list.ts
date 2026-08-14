import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ModelCatalog } from '../lib/agent_model_config.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface AgentModelListToolOptions {
  /** 模型目录访问（读取已配置的提供方与模型）。 */
  readonly catalog: ModelCatalog
}

/** 获取当前配置的模型提供方和可用模型列表。 */
export function createAgentModelListTool(options: AgentModelListToolOptions) {
  return defineTool({
    name: 'agent_model_list',
    description: '获取当前配置的模型提供方和可用模型列表。返回所有已配置的 provider 及其支持的 model。',
    parameters: {},
    output: jsonToolOutput(),
    async execute() {
      try {
        const providers = await options.catalog.listProviders()
        const providersWithModels = await Promise.all(
          providers.map(async (p) => {
            let models: Array<{ id: string; name: string }> = []
            try {
              models = await options.catalog.listModels(p.id)
            } catch {
              models = []
            }
            return { id: p.id, name: p.name, models: models.map(m => ({ id: m.id, name: m.name })) }
          }),
        )
        return { status: 'ok', providers: providersWithModels }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
