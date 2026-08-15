import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { getBoundWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import {
  listKnowledgeBases,
  setKnowledgeBases,
  addKnowledgeBase,
  removeKnowledgeBase,
  type KnowledgeBase,
} from '../lib/knowledge_base.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface KnowledgeBaseToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 知识库管理：设置、查看、删除当前工作空间的知识库列表。 */
export function createKnowledgeBaseTool(options: KnowledgeBaseToolOptions) {
  return defineTool({
    name: 'knowledge_base',
    description:
      '知识库管理。设置、查看、删除当前工作空间的知识库列表（每条含知识库目录 dir 和说明 description）。知识库信息会注入到子代理（夔/力牧/皋陶/离朱）的系统提示词中，供子代理参考（dsh 中读操作默认放行，子代理可直接读取知识库目录）。仅供风后调用。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'set', 'add', 'remove'],
        description: '操作类型',
      },
      knowledge_bases: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dir: { type: 'string', required: true, description: '知识库目录（绝对路径或相对项目根目录）' },
            description: { type: 'string', required: true, description: '知识库说明' },
          },
        },
        description: 'set：完整知识库列表（整表替换）',
      },
      dir: {
        type: 'string',
        description: 'add/remove：知识库目录',
      },
      description: {
        type: 'string',
        description: 'add：知识库说明',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const sessionId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(sessionId)
      if (mode !== 'fengzhou') {
        return { status: 'error', error: 'knowledge_base 仅供风后调用。' }
      }

      const action = args.action

      try {
        const boundName = await getBoundWorkspace(directory, sessionId)
        if (!boundName) {
          return { status: 'error', error: '当前未绑定工作空间，请先调用 workspace(action="create"|"bind")' }
        }
        const wsDir = getWorkspaceDir(directory, boundName)

        if (action === 'list') {
          const bases = await listKnowledgeBases(wsDir)
          return { status: 'ok', workspace_name: boundName, knowledge_bases: bases as unknown as JsonValue }
        }

        if (action === 'set') {
          const list = args.knowledge_bases
          if (!Array.isArray(list)) {
            return { status: 'error', error: 'set 需要 knowledge_bases 数组' }
          }
          for (const b of list) {
            if (!b || !b.dir || !b.description) {
              return { status: 'error', error: '每个知识库需包含 dir 和 description' }
            }
          }
          await setKnowledgeBases(wsDir, list as KnowledgeBase[])
          return { status: 'ok', workspace_name: boundName, knowledge_bases: list as unknown as JsonValue }
        }

        if (action === 'add') {
          const dir = args.dir
          const description = args.description
          if (!dir || !description) {
            return { status: 'error', error: 'add 需要 dir 和 description' }
          }
          await addKnowledgeBase(wsDir, { dir, description })
          const bases = await listKnowledgeBases(wsDir)
          return { status: 'ok', workspace_name: boundName, knowledge_bases: bases as unknown as JsonValue }
        }

        if (action === 'remove') {
          const dir = args.dir
          if (!dir) {
            return { status: 'error', error: 'remove 需要 dir' }
          }
          const removed = await removeKnowledgeBase(wsDir, dir)
          const bases = await listKnowledgeBases(wsDir)
          return { status: 'ok', removed, workspace_name: boundName, knowledge_bases: bases as unknown as JsonValue }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
