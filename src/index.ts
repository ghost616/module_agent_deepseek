import { isAbsolute, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import { Config, type Config as ModuleAgentConfig } from './config.ts'
import { registerModuleAgentTools } from './tools/index.ts'
import type { ModelCatalog } from './lib/agent_model_config.ts'
import {
  createSessionState,
  registerSessionState,
  directoryOfAgent,
  isFrameworkSubagentMode,
  AGENT_MODE_LABELS,
  type AgentMode,
  type SessionState,
} from './lib/session_state.ts'
import { getSessionWorkspaceSync } from './lib/session_workspace.ts'
import { resolveWorkspace, getWorkspaceDir, getBoundWorkspaceSync } from './lib/workspace.ts'
import { getWorkspaceConfigSync } from './lib/workspace_config.ts'
import { listKnowledgeBasesSync, buildKnowledgeBasePrompt } from './lib/knowledge_base.ts'
import { BEGINNER_TIPS } from './lib/beginner_tips.ts'
import { registerOrchestrationGuards } from './lib/orchestration_guards.ts'
import { recordActivity, clearActivity } from './lib/limu_monitor.ts'
import { getModuleNameBySession } from './lib/module_session_tracker.ts'

export const name = 'module-agent'
export { Config }
export const inject = ['tools', 'systemPrompt', 'agents', 'subagents', 'llm', 'sessions']

/** 插件自注册的全部自定义工具名（pre-execute 继续 waterfall，交由 orchestration 守卫判定）。 */
const CUSTOM_TOOLS = new Set([
  'module_agent_admin',
  'module_agent_executor',
  'module_agent_updater',
  'module_agent_updater_plan',
  'module_agent_updater_review',
  'module_agent_reader',
  'module_agent_start',
  'module_agent_setup',
  'module_agent_done',
  'module_design_admin',
  'verification_code',
  'module_agent_backup',
  'module_agent_plan',
  'workspace',
  'module_agent_explorer',
  'module_agent_analyzer',
  'module_agent_line_reader',
  'module_classification',
  'module_agent_classifier',
  'module_agent_cleanup',
  'agent_model_list',
  'agent_model_config',
  'module_agent_testing',
  'module_agent_correction',
  'knowledge_base',
])

const BLOCKED_WRITE_TOOLS = ['write', 'edit']

/** 直接修改代码文件对风后/皋陶/隶首/夔一律禁止。 */
const NON_WRITING_MODES: readonly AgentMode[] = ['fengzhou', 'gaotao', 'lishou', 'kui']

/** 夔允许使用的工具白名单。 */
const KUI_ALLOWED_TOOLS = new Set([
  'module_agent_executor',
  'module_agent_reader',
  'module_agent_updater',
  'module_agent_plan',
  'verification_code',
  'read',
  'grep',
])

/** 读取工具参数中的字符串字段（参数已被 registry 深冻结）。 */
function stringArg(args: unknown, key: string): string | undefined {
  if (typeof args === 'object' && args !== null && key in args) {
    const value = (args as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

/** 判断目标路径是否位于 projectRoot 之内（跨盘符相对路径为绝对路径，视为越界）。 */
function assertWithin(directory: string, filePath: string): boolean {
  const rel = relative(directory, resolve(directory, filePath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 挂载权限与拦截层（opencode permission.ask / tool.execute.before 的 dsh 等价物）。
 * - tools/pre-execute：自定义工具继续 waterfall 交由 orchestration 守卫；write/edit 越出工程目录则 deny。
 * - tools.guard：各智能体模式的工具守卫（写文件禁令、力牧 .module_agent 禁令、夔白名单）。
 */
function registerGuards(ctx: Context, state: SessionState, config: ModuleAgentConfig): void {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (CUSTOM_TOOLS.has(exec.name)) {
      // 自定义工具继续走 waterfall，由 orchestration 守卫决定（力牧计划有效性等）。
      return next()
    }
    if (BLOCKED_WRITE_TOOLS.includes(exec.name)) {
      const directory = directoryOfAgent(exec.agent, config.dataDir)
      // dsh 内置 write/edit 工具（@deepseek-ai/dsh-tool-fs）的参数名为 file_path（snake_case）。
      const filePath = stringArg(exec.arguments, 'file_path')
      if (filePath !== undefined && !assertWithin(directory, filePath)) {
        return { kind: 'deny', reason: '不允许修改工程目录之外的文件。' }
      }
    }
    return next()
  })

  ctx.tools.guard((exec: Readonly<ToolExecution>): string | undefined => {
    const agent = exec.agent
    if (!agent) return undefined
    const mode = state.getAgentMode(agent.id)
    if (mode === undefined) return undefined

    if (NON_WRITING_MODES.includes(mode) && BLOCKED_WRITE_TOOLS.includes(exec.name)) {
      return `${AGENT_MODE_LABELS[mode]}不直接修改代码文件。`
    }

    if (mode === 'limu' && !exec.name.startsWith('module_agent_')) {
      if (BLOCKED_WRITE_TOOLS.includes(exec.name)) {
        // dsh 内置 write/edit 工具的参数名为 file_path（snake_case）。
        const filePath = stringArg(exec.arguments, 'file_path') ?? ''
        if (filePath.includes('.module_agent')) {
          return '力牧不直接修改 .module_agent 下的文件，请使用 module_agent_updater 工具。'
        }
      }
    }

    if (mode === 'kui') {
      if (!KUI_ALLOWED_TOOLS.has(exec.name)) {
        return '夔仅允许使用 module_agent_executor、module_agent_reader、module_agent_updater、module_agent_plan、verification_code、read、grep 工具。'
      }
      if (exec.name === 'module_agent_executor') {
        const action = stringArg(exec.arguments, 'action') ?? ''
        const valid = ['start', 'status', 'start_review', 'review_status', 'ping', 'check_reviewer']
        if (!valid.includes(action)) {
          return `夔仅允许 module_agent_executor 的 start、status、start_review、review_status、ping、check_reviewer 操作，当前: ${action}`
        }
      }
      if (exec.name === 'module_agent_reader') {
        const action = stringArg(exec.arguments, 'action') ?? ''
        const valid = ['read_kui_plan', 'read_all_kui_plans', 'read_kui_plan_detail', 'read_plan_files', 'read_definition', 'read_descriptions']
        if (!valid.includes(action)) {
          return `夔仅允许 module_agent_reader 的 read_kui_plan、read_all_kui_plans、read_kui_plan_detail、read_plan_files、read_definition、read_descriptions 操作，当前: ${action}`
        }
      }
      if (exec.name === 'module_agent_updater') {
        const action = stringArg(exec.arguments, 'action') ?? ''
        if (action !== 'update_kui_plan') {
          return `夔仅允许 module_agent_updater 的 update_kui_plan 操作，当前: ${action}`
        }
      }
      if (exec.name === 'module_agent_plan') {
        const action = stringArg(exec.arguments, 'action') ?? ''
        if (action !== 'confirm_plan' && action !== 'review_complete' && action !== 'create_review_plan') {
          return `夔仅允许 module_agent_plan 的 confirm_plan、review_complete、create_review_plan 操作，当前: ${action}`
        }
      }
    }

    return undefined
  })
}

/**
 * 挂载系统提示词注入（opencode experimental.chat.system.transform 的 dsh 等价物）：
 * 框架子智能体注入知识库清单；风后新手模式注入需求引导规则。
 */
function registerPromptInjection(ctx: Context, state: SessionState, config: ModuleAgentConfig): void {
  ctx.systemPrompt.section({
    name: 'module-agent:knowledge-bases',
    order: 210,
    text: (context: AssembleContext): string => {
      const agent = context.agent
      if (!agent) return ''
      if (!isFrameworkSubagentMode(state.getAgentMode(agent.id))) return ''
      const directory = directoryOfAgent(agent, config.dataDir)
      const wsName = getSessionWorkspaceSync(directory, agent.id)
      if (!wsName) return ''
      const bases = listKnowledgeBasesSync(getWorkspaceDir(directory, wsName))
      if (bases.length === 0) return ''
      return buildKnowledgeBasePrompt(bases)
    },
  })

  ctx.systemPrompt.section({
    name: 'module-agent:beginner-tips',
    order: 211,
    text: (context: AssembleContext): string => {
      const agent = context.agent
      if (!agent) return ''
      if (state.getAgentMode(agent.id) !== 'fengzhou') return ''
      const directory = directoryOfAgent(agent, config.dataDir)
      const wsName = getBoundWorkspaceSync(directory, agent.id)
      if (!wsName) return ''
      const configSync = getWorkspaceConfigSync(directory, wsName)
      if (configSync.development_mode !== 'beginner') return ''
      return BEGINNER_TIPS
    },
  })
}

/** 各模式完成时通知其启动者的消息文本。 */
function completionNotice(mode: AgentMode, agentId: string): string {
  switch (mode) {
    case 'lizhu':
      return '离朱测试完毕，请使用 module_agent_reader(action="read_test_results") 读取测试结果。'
    case 'limu':
      return `力牧（会话 ${agentId}）任务完成。请调用 module_agent_executor(action="status", session_id="${agentId}") 获取力牧完成情况。`
    case 'gaotao':
      return `皋陶（会话 ${agentId}）任务完成。请调用 module_agent_executor(action="review_status") 获取审查结果。`
    case 'kui':
      return `夔（会话 ${agentId}）批量编排任务完成。请调用 module_agent_executor(action="kui_status") 获取执行情况。`
    default:
      return `${AGENT_MODE_LABELS[mode]}（会话 ${agentId}）任务完成。`
  }
}

/**
 * 框架子智能体 settle 时替换 subagent-settled 通知的完成消息。
 * 力牧通知补充 module_name（解析失败时用占位 '<模块名>'），其余模式复用
 * {@link completionNotice}。
 */
function frameworkCompletionMessage(
  agent: Agent,
  childId: string,
  mode: AgentMode,
  config: ModuleAgentConfig,
): UserMessage {
  let text = completionNotice(mode, childId)
  if (mode === 'limu') {
    const directory = directoryOfAgent(agent, config.dataDir)
    const wsName = resolveWorkspace(directory, childId)
    let moduleName: string | null = null
    if (wsName !== null) {
      moduleName = getModuleNameBySession(getWorkspaceDir(directory, wsName), childId)
    }
    text = `力牧（会话 ${childId}）任务完成。请调用 module_agent_executor(action="status", module_name="${moduleName ?? '<模块名>'}", session_id="${childId}") 获取力牧完成情况。`
  }
  return createUserMessage({
    content: [{ type: 'text', text }] satisfies ContentBlock[],
    source: {
      kind: 'plugin',
      plugin: 'module-agent',
      form: 'notice',
      summary: `${AGENT_MODE_LABELS[mode]}任务完成通知`,
    },
  })
}

/**
 * 挂载完成通知与子智能体 settle 拦截（dsh 等价物）：
 * - tools/post-execute 在框架子智能体每次工具执行后刷新 lastActivity，防止长任务
 *   被 getSessionIdle 误判 unresponsive；waterfall 语义，必须委托 next()。
 * - agent/status 维护力牧活跃监控：running 记录活动、idle 清除活动。
 * - agent/pre-step 拦截发往框架 owner（风后/夔/力牧等框架子智能体）的 dsh
 *   subagent-settled 通知并替换为框架完成通知，使 owner 只收到一条含 module_name
 *   的完成通知、不再重复（离朱 settle 给力牧发通知时，力牧收到「离朱测试完毕…」
 *   而非原始 subagent-settled）；替换完成后清除已 settle 子代理的 mode（残留
 *   mode 由 cleanStaleModes 兜底）。
 */
function registerCompletionNotification(ctx: Context, state: SessionState, config: ModuleAgentConfig): void {
  ctx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
    const agent = exec.agent
    if (agent !== undefined && isFrameworkSubagentMode(state.getAgentMode(agent.id))) {
      recordActivity(agent.id)
    }
    return next()
  })

  ctx.on('agent/status', ({ agent, status }) => {
    const agentId = agent.id
    const mode = state.getAgentMode(agentId)

    if (status === 'running') {
      if (isFrameworkSubagentMode(mode)) recordActivity(agentId)
      return
    }

    if (isFrameworkSubagentMode(mode)) clearActivity(agentId)
  })

  // dsh 的 continuable 子代理 settle 时自动给直接父 agent 投递 subagent-settled
  // 通知；此处把发往框架 owner（风后/夔/力牧等）的该通知替换为框架完成通知
  // （力牧含 module_name）。
  ctx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision

    const ownerMode = state.getAgentMode(agent.id)
    if (ownerMode !== 'fengzhou' && !isFrameworkSubagentMode(ownerMode)) return decision

    const messages = decision.messages.map((message) => {
      if (message.source.kind !== 'subagent-settled') return message
      const childId = message.source.senderSessionId
      const mode = state.getAgentMode(childId)
      if (!isFrameworkSubagentMode(mode)) return message
      // 替换完成通知后清除已 settle 子代理的 mode，避免残留（agent/disposed 不再清 mode）。
      state.clearAgentMode(childId)
      return frameworkCompletionMessage(agent, childId, mode, config)
    })
    return { kind: 'enter', messages }
  })
}

export function apply(ctx: Context, config: ModuleAgentConfig = {}): void {
  const sessionState = createSessionState()
  registerSessionState(ctx, sessionState, config.dataDir)

  const catalog: ModelCatalog = {
    listProviders: async () => ctx.llm.listProviders(),
    listModels: async (provider) => ctx.llm.listModels(provider),
  }

  registerModuleAgentTools(ctx, {
    sessionState,
    dataDir: config.dataDir,
    catalog,
    subagentProvider: config.subagentProvider ?? 'spawn',
  })
  registerGuards(ctx, sessionState, config)
  registerOrchestrationGuards(ctx, { sessionState, dataDir: config.dataDir })
  registerPromptInjection(ctx, sessionState, config)
  registerCompletionNotification(ctx, sessionState, config)
}
