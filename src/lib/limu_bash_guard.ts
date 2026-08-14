const ALLOWED_VERBS = new Set([
  'remove-item',
  'rename-item',
  'move-item',
  'rm',
  'del',
  'erase',
  'rd',
  'rmdir',
  'ri',
  'ren',
  'rename',
  'rni',
  'mv',
  'move',
  'mi',
])

const BLOCKED_PATTERN = /[;|&<>]|\$\(|`|\r|\n/

/**
 * 校验力牧的 bash 命令：仅允许单条文件删除/重命名/移动命令。
 * 不合法时抛错，由挂载方（tools.guard）转为工具拒绝理由。
 */
export function validateLimuBashCommand(command: string): void {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('力牧的 bash 命令为空，已拦截。')
  }
  if (BLOCKED_PATTERN.test(trimmed)) {
    throw new Error('力牧的 bash 命令包含链式/管道/重定向等字符，已拦截。仅允许单条文件删除/重命名/移动命令。如需编译测试，请使用 module_agent_executor(action="start_lizhu") 启动离朱。')
  }
  const verb = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!ALLOWED_VERBS.has(verb)) {
    throw new Error(`力牧仅允许使用 bash 执行文件删除/重命名/移动命令（Remove-Item / Rename-Item / Move-Item / rm / del / ren / mv / move 等），已拦截命令: ${verb}。如需编译测试，请使用 module_agent_executor(action="start_lizhu") 启动离朱。`)
  }
}
