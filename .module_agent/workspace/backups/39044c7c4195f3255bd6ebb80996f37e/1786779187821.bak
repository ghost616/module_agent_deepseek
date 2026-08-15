import { join } from 'node:path'
import { workspaceDir } from './constants.ts'
import { exists, existsSync, readJson, readJsonSync, writeText } from './fs.ts'

export interface WorkspaceConfig {
  development_mode: 'beginner' | 'expert' | ''
}

const CONFIG_FILE = 'config.json'

function configPath(directory: string, workspaceName: string): string {
  return join(workspaceDir(directory, workspaceName), CONFIG_FILE)
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  development_mode: '',
}

export async function getWorkspaceConfig(directory: string, workspaceName: string): Promise<WorkspaceConfig> {
  const path = configPath(directory, workspaceName)
  if (!(await exists(path))) return { ...DEFAULT_CONFIG }
  try {
    return await readJson<WorkspaceConfig>(path)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 同步读取工作空间配置。systemPrompt.section 的 text provider 是同步的，
 * 仅在提示词注入路径使用；文件缺失或解析失败回退默认配置。
 */
export function getWorkspaceConfigSync(directory: string, workspaceName: string): WorkspaceConfig {
  const path = configPath(directory, workspaceName)
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    return readJsonSync<WorkspaceConfig>(path)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function setWorkspaceConfig(directory: string, workspaceName: string, config: WorkspaceConfig): Promise<void> {
  const path = configPath(directory, workspaceName)
  await writeText(path, JSON.stringify(config, null, 2))
}

export async function setDevelopmentMode(directory: string, workspaceName: string, mode: 'beginner' | 'expert'): Promise<void> {
  const config = await getWorkspaceConfig(directory, workspaceName)
  config.development_mode = mode
  await setWorkspaceConfig(directory, workspaceName, config)
}
