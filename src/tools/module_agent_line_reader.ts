import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentLineReaderToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

type RangeResult = {
  line: number
  start: number
  end: number
  lines: { line: number; content: string }[]
}

/** 根据行号范围和上下文读取文件指定行内容。 */
export function createModuleAgentLineReaderTool(options: ModuleAgentLineReaderToolOptions) {
  return defineTool({
    name: 'module_agent_line_reader',
    description: '根据行号范围和上下文读取文件指定行内容。',
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: '文件相对路径',
      },
      ranges: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            line: { type: 'integer', required: true },
            before: { type: 'integer' },
            after: { type: 'integer' },
          },
        },
        description: '读取范围列表：line 基准行号，before 前 N 行（默认 0），after 后 N 行（默认 0）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      if (mode !== 'lishou' && mode !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_line_reader 仅供隶首或风后调用。' }
      }

      const filePath = args.file_path
      const ranges = args.ranges
      const absPath = join(directory, filePath)

      let content: string
      try {
        content = await readFile(absPath, 'utf-8')
      } catch {
        return { status: 'error', error: `文件 ${filePath} 不存在。` }
      }

      const lines = content.split('\n')
      const totalLines = lines.length
      const results: RangeResult[] = []

      for (const range of ranges) {
        const before = range.before ?? 0
        const after = range.after ?? 0
        const start = Math.max(1, range.line - before)
        const end = Math.min(totalLines, range.line + after)

        const rangeLines: { line: number; content: string }[] = []
        for (let i = start; i <= end; i++) {
          rangeLines.push({ line: i, content: lines[i - 1] ?? '' })
        }

        results.push({ line: range.line, start, end, lines: rangeLines })
      }

      return { status: 'ok', path: filePath, ranges: results }
    },
  })
}
