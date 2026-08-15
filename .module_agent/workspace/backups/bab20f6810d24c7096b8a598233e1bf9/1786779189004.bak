import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { listWorkspaces, createWorkspace, bindFengzhou, getBoundWorkspace } from '../lib/workspace.ts'
import { getWorkspaceConfig, setDevelopmentMode } from '../lib/workspace_config.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface WorkspaceToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 工作空间管理：列出现有工作空间、创建新空间、绑定空间、查看绑定状态、获取/设置工作空间配置。 */
export function createWorkspaceTool(options: WorkspaceToolOptions) {
  return defineTool({
    name: 'workspace',
    description:
      '工作空间管理。列出现有工作空间、创建新空间、绑定空间、查看当前绑定状态、获取/设置工作空间配置。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'create', 'bind', 'status', 'get_config', 'set_development_mode'],
        description: '操作类型',
      },
      name: {
        type: 'string',
        description: 'create：新空间名称；bind：要绑定的空间名称',
      },
      development_mode: {
        type: 'string',
        enum: ['beginner', 'expert'],
        description: 'set_development_mode：开发模式，beginner=新手模式，expert=老手模式',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const sessionId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(sessionId)
      if (mode !== 'fengzhou') {
        return { status: 'error', error: 'workspace 仅供风后调用。' }
      }

      const action = args.action

      try {
        if (action === 'list') {
          const workspaces = await listWorkspaces(directory)
          const boundName = await getBoundWorkspace(directory, sessionId)
          return { status: 'ok', workspaces: workspaces as unknown as JsonValue, bound: boundName }
        }

        if (action === 'create') {
          const name = args.name
          if (!name) {
            return { status: 'error', error: 'create 需要 name（仅支持英文、数字、下划线）' }
          }
          await createWorkspace(directory, name)
          await bindFengzhou(directory, sessionId, name)
          return { status: 'ok', workspace_name: name, bound: true }
        }

        if (action === 'bind') {
          const name = args.name
          if (!name) {
            return { status: 'error', error: 'bind 需要 workspace_name' }
          }
          await bindFengzhou(directory, sessionId, name)
          return { status: 'ok', workspace_name: name }
        }

        if (action === 'status') {
          const boundName = await getBoundWorkspace(directory, sessionId)
          if (!boundName) {
            return { status: 'ok', bound: null, message: '当前未绑定工作空间，请先调用 create 或 bind' }
          }
          const workspaces = await listWorkspaces(directory)
          const ws = workspaces.find(w => w.name === boundName)
          const config = await getWorkspaceConfig(directory, boundName)
          return {
            status: 'ok',
            bound: boundName,
            workspace: (ws ?? null) as unknown as JsonValue,
            development_mode: config.development_mode,
          }
        }

        if (action === 'get_config') {
          const boundName = await getBoundWorkspace(directory, sessionId)
          if (!boundName) {
            return { status: 'error', error: '当前未绑定工作空间，请先调用 create 或 bind' }
          }
          const config = await getWorkspaceConfig(directory, boundName)
          return { status: 'ok', workspace_name: boundName, development_mode: config.development_mode }
        }

        if (action === 'set_development_mode') {
          const boundName = await getBoundWorkspace(directory, sessionId)
          if (!boundName) {
            return { status: 'error', error: '当前未绑定工作空间，请先调用 create 或 bind' }
          }
          const modeValue = args.development_mode
          if (!modeValue || (modeValue !== 'beginner' && modeValue !== 'expert')) {
            return { status: 'error', error: 'development_mode 必须为 beginner 或 expert' }
          }
          await setDevelopmentMode(directory, boundName, modeValue)
          return { status: 'ok', workspace_name: boundName, development_mode: modeValue }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
