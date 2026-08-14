import { join } from 'node:path'
import {
  moduleAgentDir,
  AGENT_PROFILE_FILE,
  defaultAgentProfile,
} from './constants.ts'
import { exists, readText, writeText } from './fs.ts'

function profilePath(directory: string, moduleName: string): string {
  return join(moduleAgentDir(directory, moduleName), AGENT_PROFILE_FILE)
}

export async function readAgentProfile(directory: string, moduleName: string): Promise<string> {
  const path = profilePath(directory, moduleName)
  if (!(await exists(path))) {
    return ''
  }
  return readText(path)
}

export async function writeAgentProfile(
  directory: string,
  moduleName: string,
  content: string,
): Promise<void> {
  const path = profilePath(directory, moduleName)
  await writeText(path, content)
}

export async function ensureAgentProfile(
  directory: string,
  moduleName: string,
): Promise<string> {
  const existing = await readAgentProfile(directory, moduleName)
  if (existing) {
    return existing
  }
  const content = defaultAgentProfile(moduleName)
  await writeAgentProfile(directory, moduleName, content)
  return content
}
