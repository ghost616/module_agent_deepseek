import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { readCorrections, appendCorrection, removeCorrection } from '../lib/corrections.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface CorrectionToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 管理风后的用户纠正与反馈记录。 */
export function createCorrectionTool(options: CorrectionToolOptions) {
  return defineTool({
    name: 'module_agent_correction',
    description:
      '管理风后的用户纠正与反馈记录。add=记录一次用户纠正，read=读取所有历史纠正，remove=按索引删除指定记录。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['add', 'read', 'remove'],
        description: '操作类型：add 记录纠正，read 读取所有记录，remove 按索引删除',
      },
      content: {
        type: 'string',
        description: 'action=add 时必填：用户纠正的具体内容',
      },
      index: {
        type: 'integer',
        description: 'action=remove 时必填：要删除的记录索引（从 read 返回结果中获取）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const sessionId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(sessionId)
      if (mode !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_correction 仅供风后调用。' }
      }

      const ws = resolveWorkspace(directory, sessionId)
      if (!ws) {
        return { status: 'error', error: '未关联工作空间' }
      }
      const workspaceDir = getWorkspaceDir(directory, ws)

      if (args.action === 'add') {
        if (!args.content) {
          return { status: 'error', error: 'action=add 时必须提供 content' }
        }
        appendCorrection(workspaceDir, args.content)
        return { status: 'ok', message: '用户纠正已记录' }
      }

      if (args.action === 'read') {
        const corrections = readCorrections(workspaceDir)
        const entries = corrections.map((c, i) => ({ index: i, content: c.content, timestamp: c.timestamp }))
        return { status: 'ok', corrections: entries }
      }

      if (args.action === 'remove') {
        if (args.index === undefined) {
          return { status: 'error', error: 'action=remove 时必须提供 index' }
        }
        const ok = removeCorrection(workspaceDir, args.index)
        if (!ok) {
          return { status: 'error', error: `索引 ${args.index} 不存在` }
        }
        return { status: 'ok', message: `索引 ${args.index} 的记录已删除` }
      }

      return { status: 'error', error: `未知 action: ${args.action}` }
    },
  })
}
