import { defineTool } from '@deepseek-ai/dsh-tools'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface SkeletonToolMeta {
  name: string
  description: string
}

/**
 * 尚未由后续模块移植实现的工具清单（本期仅完成注册骨架）。
 * 各模块实现完成后，将其从本清单移除并在 tools/index.ts 注册真实实现。
 */
export const SKELETON_TOOLS: readonly SkeletonToolMeta[] = []

/** 构造一个骨架工具：调用时返回"尚未实现"错误，由后续模块替换真实实现。 */
export function buildSkeletonTool(meta: SkeletonToolMeta) {
  return defineTool({
    name: meta.name,
    description: meta.description,
    parameters: {},
    output: jsonToolOutput(),
    async execute() {
      return {
        status: 'error',
        error: `工具 ${meta.name} 尚未实现，将由后续模块移植实现。`,
      }
    },
  })
}
