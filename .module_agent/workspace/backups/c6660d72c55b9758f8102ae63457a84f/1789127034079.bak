import type { Context } from '@deepseek-ai/cordis'
import type { SessionState } from '../lib/session_state.ts'
import type { ModelCatalog } from '../lib/agent_model_config.ts'
import { verificationCode } from './verification_code.ts'
import { createModuleAgentBackupTool } from './module_agent_backup.ts'
import { createModuleAgentAdminTool } from './module_agent_admin.ts'
import { createModuleDesignAdminTool } from './module_design_admin.ts'
import { createModuleAgentReaderTool } from './module_agent_reader.ts'
import { createModuleAgentUpdaterTool } from './module_agent_updater.ts'
import { createModuleAgentExplorerTool } from './module_agent_explorer.ts'
import { createModuleAgentAnalyzerTool } from './module_agent_analyzer.ts'
import { createModuleAgentLineReaderTool } from './module_agent_line_reader.ts'
import { createModuleClassificationTool } from './module_classification.ts'
import { createModuleAgentClassifierTool } from './module_agent_classifier.ts'
import { createWorkspaceTool } from './workspace.ts'
import { createKnowledgeBaseTool } from './knowledge_base.ts'
import { createCorrectionTool } from './correction.ts'
import { createAgentModelConfigTool } from './agent_model_config.ts'
import { createAgentModelListTool } from './agent_model_list.ts'
import { createModuleAgentSetupTool } from './module_agent_setup.ts'
import { createModuleAgentPlanTool } from './module_agent_plan.ts'
import { createModuleAgentUpdaterPlanTool } from './module_agent_updater_plan.ts'
import { createModuleAgentUpdaterReviewTool } from './module_agent_updater_review.ts'
import { createModuleAgentTestingTool } from './module_agent_testing.ts'
import { createModuleAgentExecutorTool } from './module_agent_executor.ts'
import { createModuleAgentStartTool } from './module_agent_start.ts'
import { createModuleAgentDoneTool } from './module_agent_done.ts'
import { createModuleAgentCleanupTool } from './module_agent_cleanup.ts'
import { SKELETON_TOOLS, buildSkeletonTool } from './skeleton.ts'

export interface RegisterToolsOptions {
  /** 会话模式注册表（module_agent_backup 等需要校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 模型目录访问（agent_model_list / agent_model_config 读取提供方与模型）。 */
  readonly catalog: ModelCatalog
  /** 项目根目录兜底（允许显式 undefined，兼容 exactOptionalPropertyTypes）。 */
  readonly dataDir?: string | undefined
  /** 启动力牧/皋陶/离朱/夔子智能体使用的 subagent provider 名。 */
  readonly subagentProvider: string
}

/**
 * 注册全部 25 个 module-agent 工具。
 * 本期实现 module-management 与 workspace 模块的工具与库：module_agent_admin、
 * module_design_admin、module_agent_reader、module_agent_updater、
 * module_agent_explorer、module_agent_analyzer、module_agent_line_reader、
 * module_agent_backup、module_classification、module_agent_classifier、workspace、
 * knowledge_base、module_agent_correction、agent_model_config、agent_model_list、
 * module_agent_setup，workflow 模块的 module_agent_plan、module_agent_updater_plan、
 * module_agent_updater_review、module_agent_testing，orchestration 模块的
 * module_agent_executor、module_agent_start、module_agent_done、module_agent_cleanup，
 * 以及 framework 模块的 verification_code；骨架已全部替换为真实实现。
 */
export function registerModuleAgentTools(ctx: Context, options: RegisterToolsOptions): void {
  const opts = {
    sessionState: options.sessionState,
    dataDir: options.dataDir,
  }
  ctx.tools.register(verificationCode)
  ctx.tools.register(createModuleAgentBackupTool(opts))
  ctx.tools.register(createModuleAgentAdminTool(opts))
  ctx.tools.register(createModuleDesignAdminTool(opts))
  ctx.tools.register(createModuleAgentReaderTool(opts))
  ctx.tools.register(createModuleAgentUpdaterTool(opts))
  ctx.tools.register(createModuleAgentExplorerTool(opts))
  ctx.tools.register(createModuleAgentAnalyzerTool(opts))
  ctx.tools.register(createModuleAgentLineReaderTool(opts))
  ctx.tools.register(createModuleClassificationTool(opts))
  ctx.tools.register(createModuleAgentClassifierTool(opts))
  ctx.tools.register(createWorkspaceTool(opts))
  ctx.tools.register(createKnowledgeBaseTool(opts))
  ctx.tools.register(createCorrectionTool(opts))
  ctx.tools.register(createAgentModelConfigTool({ ...opts, catalog: options.catalog }))
  ctx.tools.register(createAgentModelListTool({ catalog: options.catalog }))
  ctx.tools.register(createModuleAgentSetupTool(opts))
  ctx.tools.register(createModuleAgentPlanTool(opts))
  ctx.tools.register(createModuleAgentUpdaterPlanTool(opts))
  ctx.tools.register(createModuleAgentUpdaterReviewTool(opts))
  ctx.tools.register(createModuleAgentTestingTool(opts))
  ctx.tools.register(createModuleAgentExecutorTool({
    ...opts,
    ctx,
    catalog: options.catalog,
    subagentProvider: options.subagentProvider,
  }))
  ctx.tools.register(createModuleAgentStartTool({ ...opts, ctx }))
  ctx.tools.register(createModuleAgentDoneTool({ ...opts, ctx, subagentProvider: options.subagentProvider }))
  ctx.tools.register(createModuleAgentCleanupTool({ ...opts, ctx, subagentProvider: options.subagentProvider }))
  for (const meta of SKELETON_TOOLS) {
    ctx.tools.register(buildSkeletonTool(meta))
  }
}
