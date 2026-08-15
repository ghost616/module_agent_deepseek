import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { exists, readJson, writeText } from './fs.ts'

export interface AgentModelEntry {
  providerID: string
  modelID: string
}

export interface AgentModelConfig {
  limu?: AgentModelEntry
  gaotao?: AgentModelEntry
  lizhu?: AgentModelEntry
  kui?: AgentModelEntry
}

export interface ModelValidationError {
  agent: 'limu' | 'gaotao' | 'lizhu' | 'kui'
  error: string
}

/**
 * 模型目录访问抽象：供 agent_model_config / agent_model_list 工具读取
 * 已配置的模型提供方及其模型列表，替代 opencode 的 client.config.providers()。
 * dsh 侧由 ctx.llm（LlmRuntime）实现。
 */
export interface ModelCatalog {
  /** 列出已注册（已激活）的模型提供方。 */
  listProviders(): Promise<Array<{ id: string; name: string }>>
  /** 列出某提供方当前可用的模型。 */
  listModels(provider: string): Promise<Array<{ id: string; name: string }>>
}

const FILE_NAME = 'agent_model_config.json'

function configPath(workspaceDir: string): string {
  return join(workspaceDir, FILE_NAME)
}

export async function readAgentModelConfig(workspaceDir: string): Promise<AgentModelConfig | null> {
  const path = configPath(workspaceDir)
  if (!(await exists(path))) return null
  try {
    return await readJson<AgentModelConfig>(path)
  } catch {
    return null
  }
}

export async function writeAgentModelConfig(workspaceDir: string, config: AgentModelConfig): Promise<void> {
  const path = configPath(workspaceDir)
  await mkdir(workspaceDir, { recursive: true })
  await writeText(path, JSON.stringify(config, null, 2))
}

export async function validateModelConfig(
  catalog: ModelCatalog,
  config: AgentModelConfig,
): Promise<ModelValidationError[]> {
  const providers = await catalog.listProviders()
  const errors: ModelValidationError[] = []

  const agents: Array<{ key: 'limu' | 'gaotao' | 'lizhu' | 'kui'; entry: AgentModelEntry | undefined; label: string }> = [
    { key: 'limu', entry: config.limu, label: '力牧' },
    { key: 'gaotao', entry: config.gaotao, label: '皋陶' },
    { key: 'lizhu', entry: config.lizhu, label: '离朱' },
    { key: 'kui', entry: config.kui, label: '夔' },
  ]

  for (const { key, entry, label } of agents) {
    if (!entry) {
      errors.push({ agent: key, error: `缺少 ${label} 默认模型配置` })
      continue
    }

    const provider = providers.find(p => p.id === entry.providerID)
    if (!provider) {
      errors.push({ agent: key, error: `模型提供方 '${entry.providerID}' 未在当前配置中找到` })
      continue
    }

    const models = await catalog.listModels(entry.providerID)
    if (!models.some(m => m.id === entry.modelID)) {
      const availableModels = models.map(m => m.id).join(', ')
      errors.push({
        agent: key,
        error: `模型 '${entry.modelID}' 未在提供方 '${entry.providerID}' 中找到。可用模型: ${availableModels}`,
      })
    }
  }

  return errors
}
