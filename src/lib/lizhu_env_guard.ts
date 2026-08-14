import { resolve, sep } from 'node:path'

export const LIZHU_ENV_DIR = '.lizhu_env'

const ENV_BUILD_PATTERN = new RegExp(
  [
    String.raw`\b(npm|pnpm|yarn|bun)\s+(install|i|ci|add|init|create)\b`,
    String.raw`\bnpx\s+(create-|--yes|-y)`,
    String.raw`\bpip3?\s+install\b`,
    String.raw`\bpython3?\s+-m\s+(pip|venv)\b`,
    String.raw`\bpoetry\s+(install|add|init|new)\b`,
    String.raw`\buv\s+(pip|venv|add|init)\b`,
    String.raw`\bgo\s+(get|mod)\b`,
    String.raw`\bcargo\s+(add|new|init)\b`,
    String.raw`\bplaywright\s+install\b`,
  ].join('|'),
  'i',
)

export function isEnvBuildCommand(command: string): boolean {
  return ENV_BUILD_PATTERN.test(command)
}

export function isInsideLizhuEnv(projectDir: string, dir: string | undefined): boolean {
  const envRoot = resolve(projectDir, LIZHU_ENV_DIR)
  const target = resolve(projectDir, dir ?? '.')
  return target === envRoot || target.startsWith(envRoot + sep)
}

/**
 * 离朱 bash 环境守卫：环境构建类命令（install/init/create 等）仅允许在
 * {@link LIZHU_ENV_DIR} 内执行且禁止 cd 切换目录。不合法返回拒绝理由，合法返回 null。
 */
export function validateLizhuEnvCommand(
  projectDir: string,
  command: string,
  workingDir: string | undefined,
): string | null {
  if (!isEnvBuildCommand(command)) return null
  if (/\bcd\b|\bset-location\b|\bsl\b|\bpushd\b/i.test(command)) {
    return `环境构建类命令禁止在命令中切换目录，请通过 working_dir/workdir 参数指定 ${LIZHU_ENV_DIR}/ 目录内的路径。`
  }
  if (isInsideLizhuEnv(projectDir, workingDir)) return null
  return `环境构建类命令（install/init/create 等）仅允许在 ${LIZHU_ENV_DIR}/ 目录内执行。请将 working_dir 设置为 ${LIZHU_ENV_DIR}/ 下的路径后重试。`
}
