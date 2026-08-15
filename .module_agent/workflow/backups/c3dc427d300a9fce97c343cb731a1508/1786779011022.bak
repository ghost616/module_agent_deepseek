import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { readReviewResult, writeReviewResult } from '../lib/review_result.ts'
import type { PlanReview, ReviewIssue } from '../lib/types.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentUpdaterReviewToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

async function handleWriteReview(
  workspaceDir: string,
  reviewerSessionId: string,
  args: { plan_id?: string; review_summary?: string; review_issues?: ReviewIssue[]; review_approved?: boolean },
) {
  const planId = args.plan_id
  if (!planId) {
    return { status: 'error', error: 'write_review 需要 plan_id' }
  }

  const existing = await readReviewResult(workspaceDir, reviewerSessionId)
  const planReviews: PlanReview[] = existing?.planReviews ?? []

  const idx = planReviews.findIndex(p => p.plan_id === planId)
  const review: PlanReview = {
    plan_id: planId,
    summary: args.review_summary ?? '',
    issues: args.review_issues ?? [],
    approved: args.review_approved ?? false,
  }

  if (idx >= 0) {
    planReviews[idx] = review
  } else {
    planReviews.push(review)
  }

  await writeReviewResult(workspaceDir, reviewerSessionId, {
    reviewer_session_id: reviewerSessionId,
    planReviews,
  })

  return {
    action: 'write_review',
    status: 'ok',
    plan_id: planId,
    approved: review.approved,
    issues_count: review.issues.length,
  }
}

/** 皋陶代码审查结果写入工具：写入或更新计划的审查结果。 */
export function createModuleAgentUpdaterReviewTool(options: ModuleAgentUpdaterReviewToolOptions) {
  return defineTool({
    name: 'module_agent_updater_review',
    description: '皋陶代码审查结果写入工具。写入或更新计划的审查结果。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['write_review'],
        description: '操作类型（当前仅支持 write_review）',
      },
      plan_id: {
        type: 'string',
        description: '计划 ID',
      },
      review_summary: {
        type: 'string',
        description: '审查总结',
      },
      review_issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            file: { type: 'string', required: true },
            line: { type: 'integer' },
            severity: { type: 'string', enum: ['error', 'warning', 'info'], required: true },
            message: { type: 'string', required: true },
          },
        },
        description: '问题列表，每项包含 file、severity、message 和可选的 line',
      },
      review_approved: {
        type: 'boolean',
        description: '是否通过审查',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)

      if (mode !== 'gaotao') {
        return { status: 'error', error: 'module_agent_updater_review 仅供皋陶调用。' }
      }

      const wsName = await resolveWorkspace(directory, agentId)
      if (!wsName) {
        return { status: 'error', error: '当前会话未关联工作空间' }
      }
      const workspaceDir = getWorkspaceDir(directory, wsName)

      try {
        return await handleWriteReview(workspaceDir, agentId, args)
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}
