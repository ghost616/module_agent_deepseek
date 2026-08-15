import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { getBoundWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import {
  readAgentModelConfig,
  writeAgentModelConfig,
  validateModelConfig,
  type AgentModelConfig,
  type ModelCatalog,
} from '../lib/agent_model_config.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface AgentModelConfigToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 模型目录访问（读取已配置的提供方与模型）。 */
  readonly catalog: ModelCatalog
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 管理当前工作空间中力牧、皋陶、离朱和夔的默认模型配置。 */
export function createAgentModelConfigTool(options: AgentModelConfigToolOptions) {
  return defineTool({
    name: 'agent_model_config',
    description: '管理当前工作空间中力牧、皋陶、离朱和夔的默认模型配置。仅风后可调用，需已绑定工作空间。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['get', 'set'],
        description: 'get=查看当前配置，set=设置默认模型',
      },
      limu_provider_id: { type: 'string', description: '力牧使用的模型提供方 ID（action=set 时使用）' },
      limu_model_id: { type: 'string', description: '力牧使用的模型 ID（action=set 时使用）' },
      gaotao_provider_id: { type: 'string', description: '皋陶使用的模型提供方 ID（action=set 时使用）' },
      gaotao_model_id: { type: 'string', description: '皋陶使用的模型 ID（action=set 时使用）' },
      lizhu_provider_id: { type: 'string', description: '离朱使用的模型提供方 ID（action=set 时使用）' },
      lizhu_model_id: { type: 'string', description: '离朱使用的模型 ID（action=set 时使用）' },
      kui_provider_id: { type: 'string', description: '夔使用的模型提供方 ID（action=set 时使用）' },
      kui_model_id: { type: 'string', description: '夔使用的模型 ID（action=set 时使用）' },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const sessionId = exec.agent?.id ?? ''
      if (options.sessionState.getAgentMode(sessionId) !== 'fengzhou') {
        return { status: 'error', error: 'agent_model_config 仅供风后调用。' }
      }

      const action = args.action

      const boundWs = await getBoundWorkspace(directory, sessionId)
      if (!boundWs) {
        return { status: 'error', error: '请先通过 workspace(action="create"|"bind") 绑定工作空间' }
      }
      const workspaceDir = getWorkspaceDir(directory, boundWs)

      try {
        if (action === 'get') {
          const config = await readAgentModelConfig(workspaceDir)
          return { status: 'ok', config: (config ?? null) as unknown as JsonValue }
        }

        if (action === 'set') {
          const existing: AgentModelConfig = (await readAgentModelConfig(workspaceDir)) ?? {}

          const limuProviderId = args.limu_provider_id
          const limuModelId = args.limu_model_id
          const gaotaoProviderId = args.gaotao_provider_id
          const gaotaoModelId = args.gaotao_model_id
          const lizhuProviderId = args.lizhu_provider_id
          const lizhuModelId = args.lizhu_model_id
          const kuiProviderId = args.kui_provider_id
          const kuiModelId = args.kui_model_id

          if (
            !limuProviderId && !limuModelId && !gaotaoProviderId && !gaotaoModelId &&
            !lizhuProviderId && !lizhuModelId && !kuiProviderId && !kuiModelId
          ) {
            return { status: 'error', error: 'set 至少需要设置 limu、gaotao、lizhu 或 kui 的模型参数' }
          }

          const candidate: AgentModelConfig = { ...existing }

          if (limuProviderId || limuModelId) {
            if (!limuProviderId || !limuModelId) {
              return { status: 'error', error: '设置力牧模型需同时提供 limu_provider_id 和 limu_model_id' }
            }
            candidate.limu = { providerID: limuProviderId, modelID: limuModelId }
          }

          if (gaotaoProviderId || gaotaoModelId) {
            if (!gaotaoProviderId || !gaotaoModelId) {
              return { status: 'error', error: '设置皋陶模型需同时提供 gaotao_provider_id 和 gaotao_model_id' }
            }
            candidate.gaotao = { providerID: gaotaoProviderId, modelID: gaotaoModelId }
          }

          if (lizhuProviderId || lizhuModelId) {
            if (!lizhuProviderId || !lizhuModelId) {
              return { status: 'error', error: '设置离朱模型需同时提供 lizhu_provider_id 和 lizhu_model_id' }
            }
            candidate.lizhu = { providerID: lizhuProviderId, modelID: lizhuModelId }
          }

          if (kuiProviderId || kuiModelId) {
            if (!kuiProviderId || !kuiModelId) {
              return { status: 'error', error: '设置夔模型需同时提供 kui_provider_id 和 kui_model_id' }
            }
            candidate.kui = { providerID: kuiProviderId, modelID: kuiModelId }
          }

          const validationErrors = await validateModelConfig(options.catalog, candidate)
          if (validationErrors.length > 0) {
            return { status: 'error', errors: validationErrors as unknown as JsonValue }
          }

          await writeAgentModelConfig(workspaceDir, candidate)

          return { status: 'ok', config: candidate as unknown as JsonValue }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
