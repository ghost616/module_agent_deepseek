import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentAnalyzerToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

type FileMatches = {
  path: string
  matches: { line: number; content: string }[]
  error?: string
}

/** 根据关键字匹配文件中符合条件的行，返回匹配行号与内容。支持批量文件。 */
export function createModuleAgentAnalyzerTool(options: ModuleAgentAnalyzerToolOptions) {
  return defineTool({
    name: 'module_agent_analyzer',
    description: '根据关键字匹配文件中符合条件的行，返回匹配行号与内容。支持批量文件。',
    parameters: {
      file_paths: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: '文件相对路径列表',
      },
      keywords: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: '匹配关键字列表',
      },
      case_sensitive: {
        type: 'boolean',
        description: '区分大小写，默认 true',
      },
      regex: {
        type: 'boolean',
        description: '是否为正则匹配，默认 false',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      if (mode !== 'lishou' && mode !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_analyzer 仅供隶首或风后调用。' }
      }

      const filePaths = args.file_paths
      const keywords = args.keywords
      const caseSensitive = args.case_sensitive ?? true
      const isRegex = args.regex ?? false

      const patterns = keywords.map(k => {
        if (isRegex) return new RegExp(k, caseSensitive ? '' : 'i')
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(escaped, caseSensitive ? '' : 'i')
      })

      const results: FileMatches[] = []
      let totalMatches = 0

      for (const filePath of filePaths) {
        const absPath = join(directory, filePath)

        let content: string
        try {
          content = await readFile(absPath, 'utf-8')
        } catch {
          results.push({ path: filePath, matches: [], error: `文件不存在` })
          continue
        }

        const lines = content.split('\n')
        const matches: { line: number; content: string }[] = []

        for (let i = 0; i < lines.length; i++) {
          const lineContent = (lines[i] ?? '').trim()
          if (!lineContent) continue
          for (const pattern of patterns) {
            if (pattern.test(lineContent)) {
              matches.push({ line: i + 1, content: lines[i] ?? '' })
              break
            }
          }
        }

        results.push({ path: filePath, matches })
        totalMatches += matches.length
      }

      return { status: 'ok', results }
    },
  })
}
