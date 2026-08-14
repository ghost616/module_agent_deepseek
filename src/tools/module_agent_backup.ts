import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { findModule } from '../lib/module_tree.ts'
import { backupFile, listBackups, readBackupContent } from '../lib/file_backup.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentBackupToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 力牧修改文件前对文件进行备份，风后可读取备份文件列表及内容。 */
export function createModuleAgentBackupTool(options: ModuleAgentBackupToolOptions) {
  return defineTool({
    name: 'module_agent_backup',
    description: '力牧修改文件前对文件进行备份，风后可读取备份文件列表及内容。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['backup', 'list', 'read_backup_content'],
        description: '操作类型：backup 备份文件（力牧调用），list 获取备份文件名列表（风后/力牧/皋陶调用），read_backup_content 按备份文件名和行范围读取内容（风后/力牧/皋陶调用）',
      },
      module_name: {
        type: 'string',
        required: true,
        description: '模块唯一标识名称',
      },
      file_path: {
        type: 'string',
        required: true,
        description: '相对文件路径（如 src/auth/login.ts）',
      },
      backup_file_name: {
        type: 'string',
        description: 'read_backup_content：备份文件名（从 list 返回的 files 列表中获取，仅为文件名如 1734567890123.bak）',
      },
      start_line: {
        type: 'integer',
        description: 'read_backup_content：起始行号（0-based，默认 0）',
      },
      end_line: {
        type: 'integer',
        description: 'read_backup_content：结束行号（0-based，默认到末尾）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const { action, module_name: moduleName, file_path: filePath } = args

      const mod = await findModule(directory, moduleName)
      if (!mod) {
        return { status: 'error', error: `模块 '${moduleName}' 不存在` }
      }

      if (action === 'backup') {
        if (options.sessionState.getAgentMode(agentId) !== 'limu') {
          return { status: 'error', error: 'backup 操作仅供力牧调用。' }
        }

        // TODO(orchestration)：力牧计划有效性守卫（limuPlanGuard）由 orchestration
        // 模块通过 tools.guard 挂载，本模块不重复实现。
        const result = await backupFile(directory, moduleName, filePath)
        return {
          status: result.success ? 'ok' : 'error',
          message: result.message,
        }
      }

      if (action === 'list' || action === 'read_backup_content') {
        const mode = options.sessionState.getAgentMode(agentId)
        if (mode !== 'fengzhou' && mode !== 'limu' && mode !== 'gaotao') {
          return {
            status: 'error',
            error: `${action} 操作仅供风后、力牧或皋陶调用。`,
          }
        }

        if (action === 'list') {
          const result = await listBackups(directory, moduleName, filePath)
          return {
            status: result.success ? 'ok' : 'error',
            message: result.message,
            files: result.files ?? [],
          }
        }

        // action === 'read_backup_content'
        const backupFileName = args.backup_file_name
        if (!backupFileName) {
          return { status: 'error', error: 'read_backup_content 需提供 backup_file_name' }
        }
        const startLine = args.start_line ?? 0
        const endLine = args.end_line
        const result = await readBackupContent(directory, moduleName, filePath, backupFileName, startLine, endLine)
        if (!result.success) {
          return { status: 'error', message: result.message }
        }
        return {
          status: 'ok',
          message: result.message,
          backup_file_name: backupFileName,
          ...result.content === undefined ? {} : { content: result.content },
        }
      }

      return { status: 'error', error: `未知 action: ${action}` }
    },
  })
}
