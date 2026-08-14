import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { addModule, findModule } from '../lib/module_tree.ts'
import { readModuleDefinition, writeModuleDefinition } from '../lib/module_definition.ts'
import { addOrUpdateModule } from '../lib/module_design.ts'
import { exists, readJson, writeText, sanitizeIdSegment } from '../lib/fs.ts'
import {
  moduleAgentDir,
  AGENT_PROFILE_FILE,
  CURRENT_SPEC_FILE,
  CHANGE_HISTORY_FILE,
  EXECUTION_RESULTS_DIR,
  INITIAL_CHANGE_HISTORY,
  defaultCurrentSpec,
} from '../lib/constants.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleClassificationToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

interface ClassificationFile {
  path: string
  description: string
}

interface ClassificationEntry {
  name: string
  files: ClassificationFile[]
  bound_module: string | null
  is_new_module: boolean
}

interface ClassificationData {
  session_id: string
  directory: string
  classifications: ClassificationEntry[]
}

function getFilePath(directory: string, sessionId: string): string {
  return join(directory, '.module_agent', '.classifications', `${sanitizeIdSegment(sessionId)}.json`)
}

async function readData(directory: string, sessionId: string): Promise<ClassificationData> {
  const path = getFilePath(directory, sessionId)
  if (!(await exists(path))) {
    return { session_id: sessionId, directory: '', classifications: [] }
  }
  try {
    return await readJson<ClassificationData>(path)
  } catch {
    return { session_id: sessionId, directory: '', classifications: [] }
  }
}

async function writeData(directory: string, sessionId: string, data: ClassificationData): Promise<void> {
  const path = getFilePath(directory, sessionId)
  await mkdir(dirname(path), { recursive: true })
  await writeText(path, JSON.stringify(data, null, 2))
}

/** 管理分类结果：添加/修改/删除分类、绑定模块、将分类写入 module_definition。仅供隶首调用。 */
export function createModuleClassificationTool(options: ModuleClassificationToolOptions) {
  return defineTool({
    name: 'module_classification',
    description: '管理分类结果：添加/修改/删除分类、绑定模块、将分类写入 module_definition。仅供隶首调用。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['add', 'update', 'delete', 'bind_module', 'apply'],
        description: '操作类型',
      },
      directory_path: {
        type: 'string',
        description: 'add：当前扫描的目录路径',
      },
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            files: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  description: { type: 'string', required: true },
                },
              },
            },
          },
        },
        description: 'add：要添加的分类条目',
      },
      classification_name: {
        type: 'string',
        description: 'update/delete/bind_module/apply：分类名称',
      },
      name: {
        type: 'string',
        description: 'update：新分类名称',
      },
      files_to_add: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            description: { type: 'string', required: true },
          },
        },
        description: 'update：新增文件',
      },
      files_to_remove: {
        type: 'array',
        items: { type: 'string' },
        description: 'update：按 path 移除文件',
      },
      files_to_update: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            description: { type: 'string', required: true },
          },
        },
        description: 'update：按 path 更新文件 description',
      },
      module_name: {
        type: 'string',
        description: 'bind_module：绑定到的模块名',
      },
      module_description: {
        type: 'string',
        description: 'bind_module：新建模块时的模块描述',
      },
      agent_profile_content: {
        type: 'string',
        description: 'bind_module：新建模块时的 agent_profile 内容',
      },
      responsibilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'bind_module：新建模块时的职责列表',
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
        description: 'bind_module：新建模块时的功能列表',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      if (mode !== 'lishou') {
        return { status: 'error', error: 'module_classification 仅供隶首调用。' }
      }

      const action = args.action
      const sessionId = agentId

      try {
        if (action === 'add') {
          const data = await readData(directory, sessionId)
          const dirPath = args.directory_path ?? data.directory
          data.directory = dirPath

          const newEntries = args.classifications ?? []

          for (const entry of newEntries) {
            data.classifications.push({
              name: entry.name,
              files: entry.files,
              bound_module: null,
              is_new_module: false,
            })
          }

          await writeData(directory, sessionId, data)

          return { status: 'ok', added: newEntries.length, total: data.classifications.length }
        }

        if (action === 'update') {
          const classificationName = args.classification_name
          if (!classificationName) {
            return { status: 'error', error: 'update 需提供 classification_name' }
          }
          const data = await readData(directory, sessionId)
          const idx = data.classifications.findIndex(c => c.name === classificationName)
          if (idx === -1) {
            return { status: 'error', error: `分类 '${classificationName}' 不存在。` }
          }

          const entry = data.classifications[idx]
          if (entry === undefined) {
            return { status: 'error', error: `分类 '${classificationName}' 不存在。` }
          }

          const newName = args.name
          if (newName !== undefined && newName !== classificationName) {
            if (data.classifications.some(c => c.name === newName)) {
              return { status: 'error', error: `分类名 '${newName}' 已存在。` }
            }
            entry.name = newName
          }

          const filesToAdd = args.files_to_add
          if (filesToAdd) {
            const existingPaths = new Set(entry.files.map(f => f.path))
            for (const f of filesToAdd) {
              if (!existingPaths.has(f.path)) {
                entry.files.push(f)
                existingPaths.add(f.path)
              }
            }
          }

          const filesToRemove = args.files_to_remove
          if (filesToRemove) {
            const removeSet = new Set(filesToRemove)
            entry.files = entry.files.filter(f => !removeSet.has(f.path))
          }

          const filesToUpdate = args.files_to_update
          if (filesToUpdate) {
            const updateMap = new Map(filesToUpdate.map(f => [f.path, f.description]))
            entry.files = entry.files.map(f => {
              if (updateMap.has(f.path)) {
                return { path: f.path, description: updateMap.get(f.path)! }
              }
              return f
            })
          }

          await writeData(directory, sessionId, data)

          return { status: 'ok', classification_name: entry.name, file_count: entry.files.length }
        }

        if (action === 'delete') {
          const classificationName = args.classification_name
          if (!classificationName) {
            return { status: 'error', error: 'delete 需提供 classification_name' }
          }
          const data = await readData(directory, sessionId)
          const len = data.classifications.length
          data.classifications = data.classifications.filter(c => c.name !== classificationName)
          if (data.classifications.length === len) {
            return { status: 'error', error: `分类 '${classificationName}' 不存在。` }
          }

          await writeData(directory, sessionId, data)

          return { status: 'ok', classification_name: classificationName }
        }

        if (action === 'bind_module') {
          const classificationName = args.classification_name
          const moduleName = args.module_name
          if (!classificationName) {
            return { status: 'error', error: 'bind_module 需提供 classification_name' }
          }
          if (!moduleName) {
            return { status: 'error', error: 'module_name 必填' }
          }

          const data = await readData(directory, sessionId)
          const entry = data.classifications.find(c => c.name === classificationName)
          if (!entry) {
            return { status: 'error', error: `分类 '${classificationName}' 不存在。` }
          }

          const existingModule = await findModule(directory, moduleName)
          let isNewModule = false

          if (!existingModule) {
            const moduleDescription = args.module_description
            const agentProfileContent = args.agent_profile_content
            if (!moduleDescription || !agentProfileContent) {
              return { status: 'error', error: '新建模块需要 module_description 和 agent_profile_content。' }
            }

            const agentDir = moduleAgentDir(directory, moduleName)
            const resultsDir = join(agentDir, EXECUTION_RESULTS_DIR)
            await mkdir(agentDir, { recursive: true })
            await mkdir(resultsDir, { recursive: true })

            await writeText(join(agentDir, AGENT_PROFILE_FILE), agentProfileContent)
            await writeText(join(agentDir, CURRENT_SPEC_FILE), defaultCurrentSpec(moduleName))
            await writeText(join(agentDir, CHANGE_HISTORY_FILE), INITIAL_CHANGE_HISTORY)

            await addModule(directory, { name: moduleName, description: moduleDescription })

            const designEntry: { name: string; description: string; responsibilities?: string[]; functions?: { name: string; description: string }[] } = {
              name: moduleName,
              description: moduleDescription,
            }
            if (args.responsibilities !== undefined) designEntry.responsibilities = args.responsibilities
            if (args.functions !== undefined) designEntry.functions = args.functions
            await addOrUpdateModule(directory, designEntry, false)

            isNewModule = true
          }

          entry.bound_module = moduleName
          entry.is_new_module = isNewModule

          await writeData(directory, sessionId, data)

          return { status: 'ok', classification_name: classificationName, module_name: moduleName, is_new_module: isNewModule }
        }

        if (action === 'apply') {
          const classificationName = args.classification_name
          const data = await readData(directory, sessionId)

          const targets = classificationName
            ? data.classifications.filter(c => c.name === classificationName && c.bound_module !== null)
            : data.classifications.filter(c => c.bound_module !== null)

          if (targets.length === 0) {
            return { status: 'ok', message: '没有已绑定模块的分类。' }
          }

          const summary: { module_name: string; files_added: number }[] = []
          const appliedNames: string[] = []

          for (const entry of targets) {
            const currentDef = await readModuleDefinition(directory, entry.bound_module!)
            const existingPaths = new Set(currentDef.files.map(f => f.path))

            const newFiles = entry.files.filter(f => !existingPaths.has(f.path))

            if (newFiles.length > 0) {
              await writeModuleDefinition(directory, entry.bound_module!, {
                module_name: entry.bound_module!,
                files: [
                  ...currentDef.files,
                  ...newFiles.map(f => ({ path: f.path, description: f.description })),
                ],
              })
            }

            summary.push({ module_name: entry.bound_module!, files_added: newFiles.length })
            appliedNames.push(entry.name)
          }

          data.classifications = data.classifications.filter(c => !appliedNames.includes(c.name))
          await writeData(directory, sessionId, data)

          return { status: 'ok', applied_count: targets.length, summary }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
