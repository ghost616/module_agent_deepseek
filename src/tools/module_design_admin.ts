import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { readDesignSync, addOrUpdateModule } from '../lib/module_design.ts'
import { MODULE_AGENT_DIR, REQUIREMENTS_DESIGN_FILE, CODE_CONVENTIONS_FILE } from '../lib/constants.ts'
import { exists, readText, writeText } from '../lib/fs.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleDesignAdminToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

async function checkPrerequisites(directory: string, mode: string | undefined) {
  if (mode === 'lishou') return null
  const requirementsPath = join(directory, MODULE_AGENT_DIR, REQUIREMENTS_DESIGN_FILE)
  if (!(await exists(requirementsPath))) {
    return {
      status: 'error',
      error: '.module_agent/requirements_design.md 不存在。请先完成 Phase 1: 需求设计后重试。',
    }
  }
  const conventionsPath = join(directory, MODULE_AGENT_DIR, CODE_CONVENTIONS_FILE)
  if (!(await exists(conventionsPath))) {
    return {
      status: 'error',
      error: '.module_agent/code_conventions.txt 不存在。请先完成 Phase 2: 代码规范后重试。',
    }
  }
  return null
}

/** 管理 module_design.json 中的模块设计条目。用于按模块增加和修改模块设计。 */
export function createModuleDesignAdminTool(options: ModuleDesignAdminToolOptions) {
  return defineTool({
    name: 'module_design_admin',
    description: '管理 module_design.json 中的模块设计条目。用于按模块增加和修改模块设计。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['add_module', 'update_module', 'read', 'read_code_conventions', 'update_code_conventions', 'read_requirements_design', 'update_requirements_design'],
        description: '操作类型',
      },
      module_name: {
        type: 'string',
        description: '模块名称',
      },
      description: {
        type: 'string',
        description: '模块描述（一句话）',
      },
      responsibilities: {
        type: 'array',
        items: { type: 'string' },
        description: '职责列表',
      },
      dependencies: {
        type: 'array',
        items: { type: 'string' },
        description: '依赖模块名列表',
      },
      functions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
          },
        },
        description: '模块功能列表，包含功能名称和详细说明',
      },
      content: {
        type: 'string',
        description: 'update_code_conventions / update_requirements_design：文件内容',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      if (mode !== 'fengzhou' && mode !== 'qibo' && mode !== 'lishou') {
        return {
          status: 'error',
          error: 'module_design_admin 仅供风后、岐伯或隶首调用。请先使用 module_agent_start、module_agent_setup 或 module_agent_classifier 激活对应模式。',
        }
      }

      const action = args.action

      try {
        if (action === 'read') {
          const design = readDesignSync(directory)
          // module_design.json 读取自 JSON 文件，天然符合 lossless JSON；
          // 其条目含可选字段，按 JsonValue 返回以匹配 output.schema。
          return { status: 'ok', design: design as unknown as JsonValue }
        }

        if (action === 'read_code_conventions') {
          const path = join(directory, MODULE_AGENT_DIR, CODE_CONVENTIONS_FILE)
          if (!(await exists(path))) {
            return { status: 'ok', content: '' }
          }
          return { status: 'ok', content: await readText(path) }
        }

        if (action === 'update_code_conventions') {
          const content = args.content
          if (!content) {
            return { status: 'error', error: 'content 必填' }
          }
          await writeText(join(directory, MODULE_AGENT_DIR, CODE_CONVENTIONS_FILE), content)
          return { status: 'ok', action: 'update_code_conventions' }
        }

        if (action === 'read_requirements_design') {
          const path = join(directory, MODULE_AGENT_DIR, REQUIREMENTS_DESIGN_FILE)
          if (!(await exists(path))) {
            return { status: 'ok', content: '' }
          }
          return { status: 'ok', content: await readText(path) }
        }

        if (action === 'update_requirements_design') {
          const content = args.content
          if (!content) {
            return { status: 'error', error: 'content 必填' }
          }
          await writeText(join(directory, MODULE_AGENT_DIR, REQUIREMENTS_DESIGN_FILE), content)
          return { status: 'ok', action: 'update_requirements_design' }
        }

        const moduleName = args.module_name
        if (!moduleName) {
          return { status: 'error', error: 'module_name 必填' }
        }

        if (action === 'add_module') {
          const result = await checkPrerequisites(directory, mode)
          if (result) return result
          addOrUpdateModule(directory, buildDesignEntry(moduleName, args), false)
          return { status: 'ok', action: 'add_module', module_name: moduleName }
        }

        if (action === 'update_module') {
          const result = await checkPrerequisites(directory, mode)
          if (result) return result
          addOrUpdateModule(directory, buildDesignEntry(moduleName, args), true)
          return { status: 'ok', action: 'update_module', module_name: moduleName }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}

/**
 * 组装模块设计条目，仅包含调用方提供的字段。
 * 避免向 ModuleDesignEntry 的可选字段传入 undefined（exactOptionalPropertyTypes）。
 */
function buildDesignEntry(
  moduleName: string,
  args: {
    description?: string
    responsibilities?: string[]
    dependencies?: string[]
    functions?: { name: string; description: string }[]
  },
) {
  const entry: { name: string; description?: string; responsibilities?: string[]; dependencies?: string[]; functions?: { name: string; description: string }[] } = { name: moduleName }
  if (args.description !== undefined) entry.description = args.description
  if (args.responsibilities !== undefined) entry.responsibilities = args.responsibilities
  if (args.dependencies !== undefined) entry.dependencies = args.dependencies
  if (args.functions !== undefined) entry.functions = args.functions
  return entry
}
