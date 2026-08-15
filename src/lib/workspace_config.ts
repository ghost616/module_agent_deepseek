import { join } from 'node:path'
import { workspaceDir } from './constants.ts'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

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

export function getWorkspaceConfig(directory: string, workspaceName: string): WorkspaceConfig {
  const path = configPath(directory, workspaceName)
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    return readJsonSync<WorkspaceConfig>(path)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 同步读取工作空间配置。systemPrompt.section 的 text provider 是同步的，
 * 仅在提示词注入路径使用；文件缺失或解析失败回退默认配置。
 */
export function getWorkspaceConfigSync(directory: string, workspaceName: string): WorkspaceConfig {
  return getWorkspaceConfig(directory, workspaceName)
}

export function setWorkspaceConfig(directory: string, workspaceName: string, config: WorkspaceConfig): void {
  writeJsonSync(configPath(directory, workspaceName), config)
}

export function setDevelopmentMode(directory: string, workspaceName: string, mode: 'beginner' | 'expert'): void {
  const config = getWorkspaceConfig(directory, workspaceName)
  config.development_mode = mode
  setWorkspaceConfig(directory, workspaceName, config)
}
