import { join } from 'node:path'
import { MODULE_AGENT_DIR, CODE_CONVENTIONS_FILE } from './constants.ts'
import { exists, readText } from './fs.ts'

/** 读取项目根目录 .module_agent/code_conventions.txt，文件缺失返回空字符串。 */
export async function readCodeConventions(directory: string): Promise<string> {
  const path = join(directory, MODULE_AGENT_DIR, CODE_CONVENTIONS_FILE)
  if (!(await exists(path))) {
    return ''
  }
  return readText(path)
}
