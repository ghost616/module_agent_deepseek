import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { foldSubagentDescriptor, type ContinuableStart } from '@deepseek-ai/dsh-subagent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, modeFromPersona, personaForMode, type AgentMode, type SessionState } from '../lib/session_state.ts'
import { findModule } from '../lib/module_tree.ts'
import { readAgentProfile } from '../lib/agent_profile.ts'
import { readCodeConventions } from '../lib/code_conventions.ts'
import {
  readAndCleanExecutionRecords,
  writeExecutionRecord,
} from '../lib/execution_result.ts'
import { readReviewResult, deleteReviewResult } from '../lib/review_result.ts'
import { savePlan, getFirstPendingReview, readAllMetadata } from '../lib/development_plan.ts'
import { recordMapping, getPlanIdBySession } from '../lib/session_plan_map.ts'
import {
  writeKuiPlan,
  readFengzhouPlansSync,
  hasUncompletedKuiPlan,
  getCompletedKuiPlans,
  deleteCompletedKuiPlans,
  appendPlanIdToRunningKuiPlan,
} from '../lib/kui_plan.ts'
import {
  getModuleLimuSession,
  addModuleSession,
  markSessionChecked,
  clearSessionChecked,
  getBoundGaotao,
  bindGaotao,
  getBoundLizhu,
  bindLizhu,
  getAvailableLizhuSession,
  getAllUnboundLizhuSessions,
  addLizhuSession,
  bindLimuStarter,
  getLimuStarter,
  bindLizhuFengzhou,
  bindKui,
  getBoundKui,
  getKuiSubAgentsStatus,
  getKuiStarter,
  type IsAlive,
} from '../lib/module_session_tracker.ts'
import { recordActivity, getSessionIdle, isWorking } from '../lib/limu_monitor.ts'
import { REVIEWER_RULES } from '../lib/reviewer_rules.ts'
import { LIZHU_RULES } from '../lib/lizhu_rules.ts'
import { KUI_RULES } from '../lib/kui_rules.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { setSessionWorkspace } from '../lib/session_workspace.ts'
import { readAgentModelConfig, validateModelConfig, type ModelCatalog } from '../lib/agent_model_config.ts'
import { SubagentHost } from '../lib/subagent_host.ts'
import {
  validateConfirmationCode,
  CODE_CONSUMED_NOTICE,
  getPlanConfirmation,
  consumePlanConfirmation,
  generateId,
} from './verification_code.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentExecutorToolOptions {
  /** 插件根上下文（subagents / sessions / agents / logger）。 */
  readonly ctx: Context
  /** 会话模式注册表（用于校验调用者身份与标记子智能体身份）。 */
  readonly sessionState: SessionState
  /** 模型目录访问（校验力牧/皋陶/离朱/夔默认模型）。 */
  readonly catalog: ModelCatalog
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
  /** 启动子智能体使用的 subagent provider 名（可在 cordis.yml 配置）。 */
  readonly subagentProvider: string
}

interface ExecutorArgs {
  action?: string
  module_name?: string
  development_plan?: string
  plan_id?: string
  plan_summary?: string
  session_id?: string
  code_conventions?: string
  plans?: Array<{ module_name: string; development_plan: string }>
}

interface HandlerContext {
  ctx: Context
  host: SubagentHost
  sessionState: SessionState
  directory: string
  workspaceDir: string
  workspaceName: string
  caller: Agent
  callerId: string
  signal: AbortSignal
  catalog: ModelCatalog
  isAlive: IsAlive
}

/** 会话存活判定（内存活跃或已持久化），带进程内缓存。 */
function makeAliveChecker(host: SubagentHost): IsAlive {
  const cache = new Map<string, boolean>()
  return async (sessionId: string): Promise<boolean> => {
    const cached = cache.get(sessionId)
    if (cached !== undefined) return cached
    const alive = await host.isAlive(sessionId)
    cache.set(sessionId, alive)
    return alive
  }
}

function buildModuleAgentSystem(agentProfile: string, codeConventions: string, moduleName: string): string {
  let prompt = `${agentProfile}`

  if (codeConventions) {
    prompt += `\n\n## 项目代码规范\n\n${codeConventions}`
  }

  prompt += `

## 执行流程指令

 你是力牧将作为「${moduleName}」模块专家，按以下流程执行开发计划：

1. **加载上下文**：使用 module_agent_reader 工具读取模块信息 —— action="read_spec" 了解功能、action="read_definition" 获取文件路径列表、action="read_descriptions"（paths=[...]）了解相关文件职责、action="read_history" 了解变更历史。

2. **跟踪执行进度 — 每次调用文件编辑工具后必须执行以下步骤**：
   - 开始执行时立即写入执行状态和计划修改的文件列表：
      a. module_agent_updater_plan(action="write_result", summary="xx任务已启动")
      b. module_agent_updater_plan(action="add_plan_files", files=["src/auth/login.ts", ...], status="started")
   - 每次调用文件编辑工具后更新执行状态：
      module_agent_updater_plan(action="write_result", summary="更新了 xxx 文件")
   - 每次完成文件修改后释放对应文件锁：
      module_agent_updater_plan(action="remove_plan_files", files=["src/auth/login.ts"])
   - 最终完成全部任务后写入执行总结：
      module_agent_updater_plan(action="write_result", summary="执行总结")

3. **执行开发计划**：根据用户消息中的开发计划，进行代码编写、文件修改等操作。每次文件操作后必须先执行步骤 2 更新进度。
    - **重要：每次调用文件编辑工具修改文件前，必须先调用 module_agent_updater_plan(action="check_active_plan", module_name="${moduleName}") 检测计划有效性。若返回 status="error"，说明计划已失效（已完成或被清理），必须立即停止所有文件修改操作并报告。**
   - **重要：每次调用文件编辑工具修改已有文件前，必须先调用 module_agent_backup(action="backup", module_name="${moduleName}", file_path="<相对路径>") 备份该文件。新建文件无需备份。**
   - **重要：当修改已有方法的输入参数或返回值类型（即方法签名变更）时，必须使用文件搜索与读取工具搜索项目中所有引用该方法的地方（包括测试文件），确保所有调用方同步更新。**

4. **完成代码变更或调用文件编辑工具后，若变更涉及以下情况才调用 module_agent_updater 记录**：

   a. 调用 module_agent_updater(action="update_spec", ...)
        —— **仅当本次变更影响了模块的功能边界/职责范围时才需要更新**（如新增功能模块、新增对外接口、职责拆分合并等）。
        纯 bug 修复、代码重构、格式调整、性能优化（不改变对外行为）等无需更新 current_spec.md。
        **heading 命名规则**：heading 必须是功能领域描述（如"数据访问层"、"会话管理"、"JSON 序列化"、"事件总线"），**禁止使用类名或文件名**（如 JsonMapper、SessionManager、MyService）。一个 heading 下可聚合多个相关类。
        需要更新时：
        - 调用 module_agent_reader(action="read_spec_headings", module_name="${moduleName}") 获取已有标题列表
        - 若 heading 已存在：再调用 module_agent_reader(action="read_spec_section", module_name="${moduleName}", heading="xxx") 获取该 section 现有内容，根据现有内容决定更新策略（mode='add' 追加或 mode='set' 替换）
        - 若 heading 不存在（新建 section）：直接使用 mode='add'，无需调用 read_spec_section。新建 heading 必须遵循上述命名规则

   b. 调用 module_agent_updater(action="update_definition", ...)
       —— **仅当文件新增/删除或文件整体功能职责发生变化时才需要更新**。
       —— 若有新文件：传入 files_to_add（description 为该文件【整体功能职责】的完整说明）
       —— 若有文件删除：传入 files_to_remove
       —— 若文件功能说明需要变化：传入 files_to_update
       —— 重要：description 是该文件【整体职责的累积性完整说明】，不是本次计划的变更记录；
          files_to_update 会整体替换旧 description。必须先通过 read_descriptions 读取待更新文件的现有说明，
          在保留文件原有职责的基础上合并本次新增/变化的功能，禁止只写本次计划内容而覆盖历史说明。
          本次计划的具体变更请记录在步骤 c 的 append_history 中。

   c. 调用 module_agent_updater(action="append_history", ...)
       —— **每次代码变更都必须调用**，传入变更描述

5. **严格遵循项目代码规范和 agent_profile 中的约定**。

    - **bash 工具使用限制**：你只能使用 bash 执行单条文件删除/重命名/移动命令（Remove-Item / Rename-Item / Move-Item / rm / del / ren / mv / move 等），禁止链式命令（; | & 重定向等）。其他命令（安装依赖、构建、lint、git 等）会被拦截，如确有需要请在执行总结中报告，由用户手动执行。

 6. **完成代码变更后，先判断是否需要测试，再决定走哪条路径**：

    A. 根据开发计划描述的功能，对照以下标准逐项判断是否适用：

        | 测试类型 | 适用条件 |
        |---------|---------|
        | 单元测试 | 涉及函数/方法的具体代码实现（非空函数体/占位符）、算法或业务规则。补充：仅添加空函数签名/接口声明/占位符不在此列；对已有空函数填充具体实现视为需编写测试 |
        | 接口测试 | 涉及 HTTP API 端点或其关联业务功能的代码变更（有请求参数、返回值或状态码） |
        | 编译测试 | 涉及编译型语言或有类型检查/构建配置的代码变更（TypeScript、Go、Rust、Java 等） |
        | E2E 测试 | 涉及页面样式或页面操作逻辑的代码变更 |


    B. 若所有测试类型均不适用（如纯文档编写、占位符、简单配置变更等），直接执行：
       module_agent_plan(action="set_test_passed", plan_id="xxx", test_passed=true)
       module_agent_plan(action="plan_complete", files=["..."])
       → 然后结束流程，系统会自动向风后发送计划完成消息。

    C. 若任一测试类型适用，执行以下测试流程：

    a. 调用 module_agent_testing(action="write_spec", content="待测试功能说明（仅列举需要测试的功能和涉及的代码文件，不包含测试方案）")
       —— 写入本次变更涉及的可测试功能和代码文件

    b. 调用 module_agent_executor(action="start_lizhu")
       —— 启动离朱测试智能体并绑定

    c. 启动离朱后，立即停止一切操作。不要主动查询离朱状态，不要调用 read_test_results 轮询。离朱完成测试后，系统会自动向你发送通知。

    d. 收到系统通知后，调用 module_agent_reader(action="read_test_results")
        —— 读取离朱测试报告（报告内容会返回给你，读取后会自动解除绑定）。
        —— **重要**：read_test_results 返回的就是离朱的完整测试报告（Markdown 格式），你会直接看到报告全文，请保存其中的关键信息（通过/失败/跳过统计、环境问题说明、失败用例等）用于后续 write_result。

    e. 根据测试结果决定（write_result 的 summary 必须包含"执行总结"和"测试总结"两部分，供风后和夔一次性了解完整情况）：
       —— 若全部测试通过：调用 module_agent_plan(action="set_test_passed", plan_id="xxx", test_passed=true); module_agent_updater_plan(action="write_result", summary="执行总结：{本轮共修改了哪些文件、实现了什么功能}\n测试总结：全部测试通过，通过 X 项，失败 0 项，跳过 0 项。{粘贴 read_test_results 返回的报告关键内容}"); 然后调用 module_agent_plan(action="plan_complete", files=["..."])，结束流程。

       —— 若因环境原因无法测试（如依赖安装失败、数据库/服务未启动、必需环境变量缺失、平台不兼容等）：调用 module_agent_plan(action="set_test_passed", plan_id="xxx", test_passed=true); module_agent_updater_plan(action="write_result", summary="执行总结：{本轮共修改了哪些文件、实现了什么功能}\n测试总结：因环境原因无法执行，skip_count=N, passed_count=0, failed_count=0。{环境错误详情：粘贴 read_test_results 返回的环境问题内容}"); 然后调用 module_agent_plan(action="plan_complete", files=["..."]), 结束流程。注意：环境原因导致无法测试不视为代码质量问题，无需重复执行测试流程。

       —— 若有测试失败：不调用 write_result，直接根据失败信息修复代码，然后回到步骤 a 重新写入测试说明并启动离朱，直到全部通过。

     注意：不要直接使用文件编辑工具修改 .module_agent/ 下的文件，必须通过 module_agent_updater / module_agent_updater_plan / module_agent_plan 工具操作。
`

  return prompt
}

function buildReviewerSystem(codeConventions: string): string {
  let prompt = REVIEWER_RULES

  if (codeConventions) {
    prompt += `\n\n## 项目代码规范\n\n${codeConventions}`
  }

  return prompt
}

/** 为 persona 拼接身份标记，供框架通过 persona 识别子智能体身份。 */
function personaFor(mode: Parameters<typeof personaForMode>[0], body: string): string {
  return `${personaForMode(mode)}\n\n${body}`
}

/** 由 agent 会话的启动者身份决定：调用者必须是风后或夔。 */
function checkGenericPermission(mode: string | undefined): string | null {
  if (mode !== 'fengzhou' && mode !== 'kui') {
    return 'module_agent_executor 仅供风后或夔调用。请先使用 module_agent_start 激活风后力牧模式。'
  }
  return null
}

/**
 * 智能体调度执行工具：启动力牧/皋陶/离朱/夔子会话、查询状态、ping 提醒、批量编排。
 * dsh 侧通过 ctx.subagents.startContinuable + followup 实现会话的建立与复用，
 * 会话身份通过 sessionState.setAgentMode 与 persona 标记记录。
 */
export function createModuleAgentExecutorTool(options: ModuleAgentExecutorToolOptions) {
  return defineTool({
    name: 'module_agent_executor',
    description: '启动力牧会话或查询执行状态。用于分配开发计划给力牧并追踪执行结果。支持启动夔智能体进行批量计划编排。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['start', 'status', 'ping', 'start_review', 'review_status', 'check_reviewer', 'kui_status', 'start_lizhu', 'list_unbound_lizhu', 'start_kui'],
        description: '操作类型：start 启动执行，status 查询力牧状态，ping 二次检查提醒力牧写入执行总结，start_review 启动皋陶代码审查，review_status 查询皋陶审查结果，check_reviewer 检查皋陶是否空闲，kui_status 查询夔状态并获取已完成的夔计划（获取后自动删除，仅供风后），start_lizhu 风后或力牧启动离朱测试，list_unbound_lizhu 获取当前工作空间中所有未绑定的离朱会话 ID，start_kui 启动夔批量编排智能体',
      },
      module_name: { type: 'string', description: '模块唯一标识名称（action=start/status 时必填）' },
      development_plan: { type: 'string', description: '开发计划文本（action=start 时必填）' },
      plan_id: { type: 'string', description: '计划 ID，由 module_agent_plan(action="confirm_plan") 返回（action=start 时必填）' },
      plan_summary: { type: 'string', description: '计划简要说明（action=start 时必填）' },
      session_id: { type: 'string', description: '会话 ID（action=status 时必填）' },
      code_conventions: { type: 'string', description: '风后传入的代码规范，若代码规范文件为空时必须传入，文件不为空则无需传入' },
      plans: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            module_name: { type: 'string', description: '模块唯一标识名称' },
            development_plan: { type: 'string', description: '该模块的开发计划文本' },
          },
        },
        description: '批量计划列表（action=start_kui 时必填）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const caller = exec.agent
      const callerId = caller?.id ?? ''
      const mode = options.sessionState.getAgentMode(callerId)
      const action = (args as ExecutorArgs).action ?? ''

      const lizhuActions = ['start_lizhu']

      if (action === 'list_unbound_lizhu' || action === 'kui_status') {
        if (mode !== 'fengzhou') {
          return { status: 'error', error: `module_agent_executor action="${action}" 仅供风后调用。` }
        }
      } else if (lizhuActions.includes(action)) {
        if (mode !== 'fengzhou' && mode !== 'limu') {
          return { status: 'error', error: `module_agent_executor action="${action}" 仅供风后或力牧调用。` }
        }
      } else {
        const permError = checkGenericPermission(mode)
        if (permError) return { status: 'error', error: permError }
      }

      if (!caller) {
        return { status: 'error', error: 'module_agent_executor 需要在 agent 上下文中调用。' }
      }

      const directory = directoryOfAgent(caller, options.dataDir)

      const wsName = await resolveWorkspace(directory, callerId)
      if (!wsName) {
        return { status: 'error', error: '请先通过 workspace(action="create"|"bind") 绑定工作空间' }
      }
      const workspaceDir = getWorkspaceDir(directory, wsName)

      const host = new SubagentHost(options.ctx, options.subagentProvider)
      const handler: HandlerContext = {
        ctx: options.ctx,
        host,
        sessionState: options.sessionState,
        directory,
        workspaceDir,
        workspaceName: wsName,
        caller,
        callerId,
        signal: exec.signal,
        catalog: options.catalog,
        isAlive: makeAliveChecker(host),
      }

      try {
        if (action === 'start') {
          const argsAny = args as ExecutorArgs
          if (!argsAny.module_name || !argsAny.development_plan || !argsAny.plan_id || !argsAny.plan_summary) {
            return { status: 'error', error: 'action="start" 需提供 module_name、development_plan、plan_id、plan_summary' }
          }
          return handleStart(handler, argsAny)
        }

        if (action === 'ping') {
          return handlePing(handler, args as ExecutorArgs)
        }

        if (action === 'start_review') {
          return handleStartReview(handler)
        }

        if (action === 'review_status') {
          return handleGaotaoStatus(handler)
        }

        if (action === 'check_reviewer') {
          return handleCheckReviewer(handler)
        }

        if (action === 'kui_status') {
          return handleKuiStatus(handler)
        }

        if (action === 'start_lizhu') {
          return handleStartLizhu(handler)
        }

        if (action === 'list_unbound_lizhu') {
          const sessions = getAllUnboundLizhuSessions(workspaceDir)
          return { unbound_lizhu_sessions: sessions }
        }

        if (action === 'start_kui') {
          const plans = (args as ExecutorArgs).plans
          if (!plans || plans.length === 0) {
            return { status: 'error', error: 'action="start_kui" 需提供非空的 plans 列表' }
          }
          return handleStartKui(handler, plans)
        }

        if (action === 'status') {
          const argsAny = args as ExecutorArgs
          if (!argsAny.module_name || !argsAny.session_id) {
            return { status: 'error', error: 'action="status" 需提供 module_name、session_id' }
          }
          return handleStatus(handler, argsAny)
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}

async function handleStart(handler: HandlerContext, args: ExecutorArgs): Promise<JsonValue> {
  const { ctx, host, sessionState, directory, workspaceDir, workspaceName, caller, callerId, signal, isAlive } = handler
  const { module_name, development_plan, plan_id, plan_summary, code_conventions } = args
  if (!module_name || !development_plan || !plan_id || !plan_summary) {
    return { status: 'error', error: 'action="start" 需提供 module_name、development_plan、plan_id、plan_summary' }
  }

  const mod = await findModule(directory, module_name)
  if (!mod) {
    return { status: 'error', error: `模块 '${module_name}' 不存在，请先用 module_agent_admin 创建` }
  }

  const planConfirmationCode = getPlanConfirmation(plan_id)
  if (!planConfirmationCode) {
    return { status: 'error', error: `计划 ${plan_id} 尚未通过 module_agent_plan(action="confirm_plan") 确认，请先确认计划后再启动力牧。` }
  }
  const codeError = validateConfirmationCode(planConfirmationCode, callerId)
  if (codeError) {
    return { status: 'error', error: `确认码已过期，请重新通过 verification_code 生成确认码，用户确认后调用 module_agent_plan(action="confirm_plan", plan_id="${plan_id}") 重新确认计划，再启动力牧。当前 plan_id: ${plan_id}` }
  }
  consumePlanConfirmation(plan_id)

  const modelConfig = await readAgentModelConfig(workspaceDir)

  const reusable = await getModuleLimuSession(workspaceDir, module_name, isAlive, callerId)

  if (reusable) {
    clearSessionChecked(workspaceDir, reusable)
    bindLimuStarter(workspaceDir, callerId, reusable)
    sessionState.setAgentMode(reusable, 'limu')

    try {
      await host.followup(caller, reusable, development_plan, signal)
    } catch (error) {
      return { status: 'error', error: `向已有力牧注入计划失败: ${String(error)}`, session_id: reusable }
    }

    recordActivity(reusable)

    await writeExecutionRecord(workspaceDir, module_name, reusable, {
      plan_id,
      plan: development_plan,
      modified_files: [],
      summary: '力牧已接收新计划',
      errors: [],
    })

    await savePlan(workspaceDir, plan_id, {
      plan_id,
      module_name,
      development_plan,
      session_id: reusable,
      modified_files: [],
    }, plan_summary, callerId)

    await recordMapping(workspaceDir, reusable, plan_id)

    const callerMode = sessionState.getAgentMode(callerId)
    if (callerMode === 'kui') {
      const kuiFengzhouSid = getKuiStarter(workspaceDir, callerId)
      if (kuiFengzhouSid) {
        appendPlanIdToRunningKuiPlan(workspaceDir, kuiFengzhouSid, callerId, plan_id)
      }
    }

    await setSessionWorkspace(directory, reusable, workspaceName)

    ctx.logger.info(`module-agent: Reused module agent for '${module_name}'`, { module_name, session_id: reusable, plan_id })

    return { session_id: reusable, plan_id, reused: true, notice: CODE_CONSUMED_NOTICE }
  }

  if (!modelConfig?.limu) {
    return { status: 'error', error: '请先使用 agent_model_config(action="set", limu_provider_id="...", limu_model_id="...") 为当前工作空间设置力牧默认模型' }
  }

  const limuValidation = await validateModelConfig(handler.catalog, modelConfig)
  const limuError = limuValidation.find(e => e.agent === 'limu')
  if (limuError) {
    return { status: 'error', error: limuError.error, hint: '配置的模型可能在当前环境中不可用，请使用 agent_model_config(action="get") 查看当前配置，再通过 agent_model_config(action="set", ...) 重新设置' }
  }

  const agentProfile = await readAgentProfile(directory, module_name)
  if (!agentProfile) {
    return { status: 'error', error: `模块 '${module_name}' 缺少 agent_profile.txt，请先用 module_agent_admin 初始化` }
  }

  let finalCodeConventions = code_conventions ?? ''
  if (!finalCodeConventions) {
    finalCodeConventions = await readCodeConventions(directory)
  }
  if (!finalCodeConventions) {
    return { status: 'error', error: '代码规范文件为空，请在调用时传入 code_conventions 参数。' }
  }

  const persona = personaFor('limu', buildModuleAgentSystem(agentProfile, finalCodeConventions, module_name))

  let started: ContinuableStart
  try {
    started = await host.startChild(
      caller,
      `力牧-${module_name}`,
      development_plan,
      {
        persona,
        agentOptions: { provider: modelConfig.limu.providerID, model: modelConfig.limu.modelID },
      },
      signal,
    )
  } catch (error) {
    return { status: 'error', error: `启动力牧失败: ${String(error)}` }
  }

  const sessionId = started.childId
  sessionState.setAgentMode(sessionId, 'limu')
  addModuleSession(workspaceDir, module_name, sessionId)
  bindLimuStarter(workspaceDir, callerId, sessionId)

  recordActivity(sessionId)

  await writeExecutionRecord(workspaceDir, module_name, sessionId, {
    plan_id,
    plan: development_plan,
    modified_files: [],
    summary: '力牧已启动',
    errors: [],
  })

  await savePlan(workspaceDir, plan_id, {
    plan_id,
    module_name,
    development_plan,
    session_id: sessionId,
    modified_files: [],
  }, plan_summary, callerId)

  await recordMapping(workspaceDir, sessionId, plan_id)

  const callerMode = sessionState.getAgentMode(callerId)
  if (callerMode === 'kui') {
    const kuiFengzhouSid = getKuiStarter(workspaceDir, callerId)
    if (kuiFengzhouSid) {
      appendPlanIdToRunningKuiPlan(workspaceDir, kuiFengzhouSid, callerId, plan_id)
    }
  }

  await setSessionWorkspace(directory, sessionId, workspaceName)

  ctx.logger.info(`module-agent: Started module agent for '${module_name}'`, { module_name, session_id: sessionId, plan_id })

  return { session_id: sessionId, plan_id, reused: false, notice: CODE_CONSUMED_NOTICE }
}

async function handleStartReview(handler: HandlerContext): Promise<JsonValue> {
  const { ctx, host, sessionState, directory, workspaceDir, workspaceName, caller, callerId, signal, isAlive } = handler

  let codeConventions = await readCodeConventions(directory)
  if (!codeConventions) codeConventions = ''

  const modelConfig = await readAgentModelConfig(workspaceDir)

  const boundGaotao = await getBoundGaotao(workspaceDir, callerId, isAlive)

  if (boundGaotao) {
    if (isWorking(boundGaotao)) {
      return { status: 'ok', message: '皋陶正在审查中，请稍后重试。', reviewer_session_id: boundGaotao }
    }

    const pending = await getFirstPendingReview(workspaceDir, callerId)
    if (!pending) {
      return { status: 'ok', message: '当前没有需要代码审查的计划。', reviewer_session_id: boundGaotao, notice: CODE_CONSUMED_NOTICE }
    }

    await host.followup(caller, boundGaotao, '请检查是否有待审查计划并执行审查循环。', signal)
    sessionState.setAgentMode(boundGaotao, 'gaotao')
    recordActivity(boundGaotao)

    return { reviewer_session_id: boundGaotao, reused: true, notice: CODE_CONSUMED_NOTICE }
  }

  if (!modelConfig?.gaotao) {
    return { status: 'error', error: '请先使用 agent_model_config(action="set", gaotao_provider_id="...", gaotao_model_id="...") 为当前工作空间设置皋陶默认模型' }
  }

  const gaotaoValidation = await validateModelConfig(handler.catalog, modelConfig)
  const gaotaoError = gaotaoValidation.find(e => e.agent === 'gaotao')
  if (gaotaoError) {
    return { status: 'error', error: gaotaoError.error, hint: '配置的模型可能在当前环境中不可用，请使用 agent_model_config(action="get") 查看当前配置，再通过 agent_model_config(action="set", ...) 重新设置' }
  }

  const persona = personaFor('gaotao', buildReviewerSystem(codeConventions))

  let started: ContinuableStart
  try {
    started = await host.startChild(
      caller,
      '皋陶审查',
      '请执行代码审查循环：调用 module_agent_plan(action="get_pending_review") 获取待审查计划并执行审查，直到无待审查计划为止。',
      {
        persona,
        agentOptions: { provider: modelConfig.gaotao.providerID, model: modelConfig.gaotao.modelID },
        toolFilter: { deny: ['write', 'edit'] },
      },
      signal,
    )
  } catch (error) {
    return { status: 'error', error: `启动皋陶失败: ${String(error)}` }
  }

  const reviewerSessionId = started.childId
  sessionState.setAgentMode(reviewerSessionId, 'gaotao')
  bindGaotao(workspaceDir, callerId, reviewerSessionId)

  recordActivity(reviewerSessionId)

  await setSessionWorkspace(directory, reviewerSessionId, workspaceName)

  ctx.logger.info(`module-agent: Started reviewer session ${reviewerSessionId}`, { reviewer_session_id: reviewerSessionId })

  return { reviewer_session_id: reviewerSessionId, notice: CODE_CONSUMED_NOTICE }
}

async function handleStatus(handler: HandlerContext, args: ExecutorArgs): Promise<JsonValue> {
  const { directory, workspaceDir, isAlive } = handler
  const { module_name, session_id } = args
  if (!module_name || !session_id) {
    return { status: 'error', error: 'action="status" 需提供 module_name、session_id' }
  }

  const mod = await findModule(directory, module_name)
  if (!mod) {
    return { status: 'error', error: `模块 '${module_name}' 不存在` }
  }

  const mainIdle = getSessionIdle(session_id)
  let activity: number | null | undefined = mainIdle.lastActivity
  let idleSeconds: number | null = mainIdle.idleSeconds
  let unresponsive = mainIdle.unresponsive

  const allRecords = await readAndCleanExecutionRecords(workspaceDir, module_name, session_id)

  const lizhuSid = getBoundLizhu(workspaceDir, session_id)
  const lizhuWorking = lizhuSid ? isWorking(lizhuSid) : false

  const planId = getPlanIdBySession(workspaceDir, session_id)
  const meta = planId ? readAllMetadata(workspaceDir).find(m => m.plan_id === planId) : undefined

  if (allRecords.length > 0) {
    let isActive = meta ? !meta.plan_completed : false
    const limuActive = isActive
    if (!isActive && lizhuWorking) {
      isActive = true
    }

    if (!limuActive && lizhuWorking && lizhuSid) {
      const lizhuIdle = getSessionIdle(lizhuSid)
      idleSeconds = lizhuIdle.idleSeconds
      unresponsive = lizhuIdle.unresponsive
      activity = lizhuIdle.lastActivity
    }
    if (!isActive) {
      clearSessionChecked(workspaceDir, session_id)
    }
    const lastRecord = allRecords[allRecords.length - 1]
    return {
      type: 'limu',
      finished: !isActive,
      plan_id: planId,
      plan_summary: meta?.plan_summary ?? null,
      plan_completed: meta?.plan_completed ?? false,
      records: allRecords as unknown as JsonValue,
      ...(isActive ? { current_work: lizhuWorking ? '等待离朱测试完成' : (lastRecord?.summary ?? null) } : {}),
      ...(lizhuSid ? { lizhu_session_id: lizhuSid, lizhu_working: lizhuWorking } : {}),
      last_activity: activity ?? null,
      idle_seconds: idleSeconds,
      unresponsive: isActive ? unresponsive : false,
    }
  }

  if (!(await isAlive(session_id))) {
    return { type: 'limu', finished: true, plan_id: planId, plan_summary: meta?.plan_summary ?? null, error: `会话 ${session_id} 的力牧已关闭，请人工确认。`, last_activity: activity ?? null, idle_seconds: idleSeconds, unresponsive: false }
  }

  if (!meta) {
    return { type: 'limu', finished: true, plan_id: null, plan_summary: null, message: `模块 '${module_name}' 没有执行计划。`, ...(lizhuSid ? { lizhu_session_id: lizhuSid, lizhu_working: lizhuWorking } : {}), last_activity: activity ?? null, idle_seconds: idleSeconds, unresponsive: false }
  }

  if (meta.plan_completed) {
    clearSessionChecked(workspaceDir, session_id)
    return { type: 'limu', finished: true, plan_id: planId, plan_summary: meta.plan_summary, plan_completed: true, ...(lizhuSid ? { lizhu_session_id: lizhuSid, lizhu_working: lizhuWorking } : {}), last_activity: activity ?? null, idle_seconds: idleSeconds, unresponsive: false }
  }

  return { type: 'limu', finished: false, plan_id: planId, plan_summary: meta.plan_summary, plan_completed: false, message: '力牧正在执行，暂无执行结果记录。', ...(lizhuSid ? { lizhu_session_id: lizhuSid, lizhu_working: lizhuWorking } : {}), last_activity: activity ?? null, idle_seconds: idleSeconds, unresponsive }
}

async function handleGaotaoStatus(handler: HandlerContext): Promise<JsonValue> {
  const { workspaceDir, callerId, isAlive } = handler
  const gaotaoSid = await getBoundGaotao(workspaceDir, callerId, isAlive)
  if (!gaotaoSid) {
    return { status: 'ok', message: '当前未绑定皋陶会话' }
  }

  const idleInfo = getSessionIdle(gaotaoSid)
  if (idleInfo.lastActivity) {
    if (!idleInfo.unresponsive) {
      return { finished: false, unresponsive: false, message: '皋陶正在审查中' }
    }
    return { finished: false, message: '皋陶空闲超过5分钟，无响应', unresponsive: true }
  }

  const result = await readReviewResult(workspaceDir, gaotaoSid)
  if (!result || result.planReviews.length === 0) {
    const pending = await getFirstPendingReview(workspaceDir, callerId)
    if (pending) {
      if (!idleInfo.lastActivity) {
        return { finished: false, idle: true, message: '皋陶空闲，有待审查计划未完成，请调用 ping 提醒。', pending_review: true }
      }
      return { finished: false, unresponsive: false, message: '皋陶正在审查中，有待审查计划。' }
    }
    return { finished: true, message: '皋陶无审查结果，且无待审查计划。' }
  }

  await deleteReviewResult(workspaceDir, gaotaoSid)

  return { finished: true, planReviews: result.planReviews as unknown as JsonValue }
}

async function handleCheckReviewer(handler: HandlerContext): Promise<JsonValue> {
  const { workspaceDir, callerId, isAlive } = handler
  const gaotaoSid = await getBoundGaotao(workspaceDir, callerId, isAlive)
  if (!gaotaoSid) {
    return { bound: false, idle: false, unresponsive: false, message: '皋陶未创建，可调用 start_review 启动' }
  }

  const idleInfo = getSessionIdle(gaotaoSid)
  if (idleInfo.lastActivity && !idleInfo.unresponsive) {
    return { bound: true, idle: false, unresponsive: false, reviewer_session_id: gaotaoSid, message: '皋陶正在审查中' }
  }

  if (idleInfo.lastActivity) {
    return { bound: true, idle: false, unresponsive: true, reviewer_session_id: gaotaoSid, message: '皋陶空闲超过5分钟，无响应' }
  }

  const result = await readReviewResult(workspaceDir, gaotaoSid)
  if (!idleInfo.lastActivity) {
    const pending = await getFirstPendingReview(workspaceDir, callerId)
    if (pending) {
      return { bound: true, idle: true, unresponsive: true, reviewer_session_id: gaotaoSid, message: '皋陶空闲，有待审查计划未完成，请调用 ping 提醒。' }
    }
  }
  if (!result || result.planReviews.length === 0) {
    return { bound: true, idle: true, unresponsive: false, reviewer_session_id: gaotaoSid, message: '皋陶空闲，审查结果为空' }
  }

  return { bound: true, idle: true, unresponsive: false, reviewer_session_id: gaotaoSid, message: '皋陶空闲，可调用 start_review 继续使用' }
}

async function handleKuiStatus(handler: HandlerContext): Promise<JsonValue> {
  const { workspaceDir, callerId, isAlive } = handler
  const kuiSid = await getBoundKui(workspaceDir, callerId, isAlive)
  if (!kuiSid) {
    return { bound: false, message: '夔未创建，可调用 start_kui 启动' }
  }

  const kuiIdle = getSessionIdle(kuiSid)
  if (kuiIdle.lastActivity && !kuiIdle.unresponsive) {
    return { bound: true, idle: false, message: '夔正在工作中' }
  }

  if (kuiIdle.lastActivity && kuiIdle.unresponsive) {
    return { bound: true, idle: false, unresponsive: true, message: '夔空闲超过5分钟，无响应' }
  }

  const subStatus = await getKuiSubAgentsStatus(workspaceDir, kuiSid, isAlive)

  if (!subStatus.allIdle) {
    return {
      bound: true,
      idle: true,
      running_sub_agents: subStatus.runningAgents as JsonValue,
      message: `夔空闲，但有以下子智能体仍在运行：${subStatus.runningAgents.join('、')}`,
    }
  }

  const hasUncompleted = hasUncompletedKuiPlan(workspaceDir, callerId)
  const completedPlans = getCompletedKuiPlans(workspaceDir, callerId)

  const output: Record<string, unknown> = {
    bound: true,
    idle: true,
    all_idle: true,
    completed_plans: completedPlans.length > 0 ? completedPlans.map(p => ({
      kui_plan_id: p.kui_plan_id,
      result: p.result,
    })) : [],
  }

  if (completedPlans.length > 0) {
    deleteCompletedKuiPlans(workspaceDir, callerId)
    output.message = `夔及所有子智能体均已空闲，已获取 ${completedPlans.length} 个已完成的夔计划（已清理）。`
  } else if (hasUncompleted) {
    output.unresponsive = true
    output.message = '夔及所有子智能体均已空闲，但存在未完成的夔计划，请调用 ping 提醒夔。'
  } else {
    output.message = '夔及所有子智能体均已空闲，无夔计划。'
  }

  return output as JsonValue
}

/**
 * 从会话身份恢复子智能体角色：mode 被清除（子智能体 settle 后）或从未标记
 * （普通会话）时，从 persona 中识别 module-agent:role=<mode> marker 重建身份。
 * 内存活跃会话经 ctx.agents 取回 agent，用 session.ownEvents()（fork 继承
 * 前缀之后的 child 自有事件）折叠 subagent descriptor；内存无 agent（已持久化
 * 冷会话）经 sessionPersistence.open(id, 'read') 取得 handle，按
 * handle.inheritedEventCount 截断 events 后同样折叠识别。
 * @returns 识别出的角色，无法识别返回 undefined
 */
async function recoverAgentMode(ctx: Context, sessionId: string): Promise<AgentMode | undefined> {
  const agent = ctx.agents.get(SessionId(sessionId))
  if (agent !== undefined) {
    const descriptor = foldSubagentDescriptor(agent.session.ownEvents())
    if (descriptor?.mode !== 'continuable') return undefined
    return modeFromPersona(descriptor.persona ?? '')
  }
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return undefined
  try {
    const handle = await persistence.open(SessionId(sessionId), 'read')
    try {
      const events = await handle.read(0)
      const descriptor = foldSubagentDescriptor(events.slice(handle.inheritedEventCount))
      if (descriptor?.mode !== 'continuable') return undefined
      return modeFromPersona(descriptor.persona ?? '')
    } finally {
      await handle.close()
    }
  } catch {
    // open/read/close 失败（会话不存在或损坏）视为无法识别身份。
    return undefined
  }
}

async function handlePing(handler: HandlerContext, args: ExecutorArgs): Promise<JsonValue> {
  const { ctx, host, sessionState, workspaceDir, caller, signal } = handler
  const sessionId = args.session_id

  if (!sessionId) {
    return { status: 'error', error: 'session_id 必填' }
  }

  if (!(await handler.isAlive(sessionId))) {
    return { status: 'error', error: `会话 ${sessionId} 不存在。` }
  }

  let targetMode = sessionState.getAgentMode(sessionId)
  if (targetMode === undefined) {
    targetMode = await recoverAgentMode(ctx, sessionId)
    if (targetMode !== undefined) {
      sessionState.setAgentMode(sessionId, targetMode)
    }
  }
  const callerMode = sessionState.getAgentMode(handler.callerId)
  const prefix = callerMode === 'kui' ? '夔提醒' : '风后提醒'

  const idleInfo = getSessionIdle(sessionId)
  if (!idleInfo.unresponsive) {
    return { status: 'ok', message: `会话 ${sessionId} 未超时（空闲 ${idleInfo.idleSeconds} 秒），无需 ping。` }
  }

  if (targetMode === 'limu') {
    const lizhuSid = getBoundLizhu(workspaceDir, sessionId)
    if (lizhuSid) {
      const lizhuIdle = getSessionIdle(lizhuSid)
      if (!lizhuIdle.unresponsive) {
        return { status: 'ok', message: `力牧 ${sessionId} 绑定的离朱 ${lizhuSid} 仍在工作（空闲 ${lizhuIdle.idleSeconds} 秒），力牧可能在等待测试结果，无需 ping。`, lizhu_session_id: lizhuSid }
      }
    }
    await host.followup(caller, sessionId, `${prefix}：请尽快完成当前任务并写入执行总结 module_agent_updater_plan(action="write_result", summary="执行总结")。如果没有测试，请先判断是否需要测试，再调用 module_agent_plan(action="plan_complete", files=["..."])。`, signal)
    recordActivity(sessionId)
    markSessionChecked(workspaceDir, sessionId)
    return { status: 'ok', message: `已向力牧会话 ${sessionId} 发送提醒并标记二次检查。` }
  }

  if (targetMode === 'gaotao') {
    await host.followup(caller, sessionId, `${prefix}：请先调用 module_agent_plan(action="get_pending_review") 获取待审查计划。若返回计划，执行审查流程；若无，汇报"所有计划已审查完毕"后结束。`, signal)
    recordActivity(sessionId)
    return { status: 'ok', message: `已向皋陶会话 ${sessionId} 发送提醒。` }
  }

  if (targetMode === 'lizhu') {
    await host.followup(caller, sessionId, `${prefix}：请尽快完成测试并通过 module_agent_testing(action="write_report", content="...") 生成测试报告。`, signal)
    recordActivity(sessionId)
    return { status: 'ok', message: `已向离朱会话 ${sessionId} 发送提醒。` }
  }

  if (targetMode === 'kui') {
    await host.followup(caller, sessionId, `${prefix}：请先调用 module_agent_reader(action="read_all_kui_plans") 获取所有夔计划的状态，优先执行 status="running" 的夔计划。如果没有 status 为 pending 或 running 的夔计划，则结束会话。`, signal)
    recordActivity(sessionId)
    markSessionChecked(workspaceDir, sessionId)
    return { status: 'ok', message: `已向夔会话 ${sessionId} 发送提醒。` }
  }

  return { status: 'error', error: `会话 ${sessionId} 的角色无法识别，请确认会话状态后再 ping。` }
}

async function handleStartLizhu(handler: HandlerContext): Promise<JsonValue> {
  const { ctx, host, sessionState, directory, workspaceDir, workspaceName, caller, callerId, signal, isAlive } = handler

  const modelConfig = await readAgentModelConfig(workspaceDir)

  const starterSessionId = callerId

  const boundLizhu = getBoundLizhu(workspaceDir, starterSessionId)
  if (boundLizhu) {
    return { status: 'error', error: '已有绑定的离朱，请先调用 module_agent_reader(action="read_test_results") 读取测试结果后重试。', lizhu_session_id: boundLizhu }
  }

  const available = await getAvailableLizhuSession(workspaceDir, isAlive, starterSessionId, (childId, parentId) => host.childAlive(childId, parentId))
  if (available) {
    bindLizhu(workspaceDir, starterSessionId, available)
    sessionState.setAgentMode(available, 'lizhu')

    await host.followup(caller, available, '请读取测试说明并执行测试：调用 module_agent_reader(action="read_test_specs") 获取待测试功能说明，然后按需执行测试。', signal)

    recordActivity(available)

    ctx.logger.info(`module-agent: Reused lizhu session ${available}`, { lizhu_session_id: available, starter_session_id: starterSessionId })

    return { lizhu_session_id: available, reused: true }
  }

  if (!modelConfig?.lizhu) {
    return { status: 'error', error: '请先使用 agent_model_config(action="set", lizhu_provider_id="...", lizhu_model_id="...") 为当前工作空间设置离朱默认模型' }
  }

  const lizhuValidation = await validateModelConfig(handler.catalog, modelConfig)
  const lizhuError = lizhuValidation.find(e => e.agent === 'lizhu')
  if (lizhuError) {
    return { status: 'error', error: lizhuError.error, hint: '配置的模型可能在当前环境中不可用，请使用 agent_model_config(action="get") 查看当前配置，再通过 agent_model_config(action="set", ...) 重新设置' }
  }

  const persona = personaFor('lizhu', LIZHU_RULES)

  let started: ContinuableStart
  try {
    started = await host.startChild(
      caller,
      '离朱测试',
      '请读取测试说明并执行测试：调用 module_agent_reader(action="read_test_specs") 获取待测试功能说明，然后按需执行测试。',
      {
        persona,
        agentOptions: { provider: modelConfig.lizhu.providerID, model: modelConfig.lizhu.modelID },
        toolFilter: { deny: ['module_agent_admin', 'module_agent_executor', 'module_agent_done', 'module_agent_plan', 'module_agent_setup'] },
      },
      signal,
    )
  } catch (error) {
    return { status: 'error', error: `启动离朱失败: ${String(error)}` }
  }

  const lizhuSessionId = started.childId
  sessionState.setAgentMode(lizhuSessionId, 'lizhu')
  addLizhuSession(workspaceDir, lizhuSessionId)
  bindLizhu(workspaceDir, starterSessionId, lizhuSessionId)

  if (callerModeIsLimu(sessionState, callerId)) {
    const fengzhouSessionId = getLimuStarter(workspaceDir, starterSessionId)
    if (fengzhouSessionId) {
      bindLizhuFengzhou(workspaceDir, lizhuSessionId, fengzhouSessionId)
    }
  }

  recordActivity(lizhuSessionId)

  await setSessionWorkspace(directory, lizhuSessionId, workspaceName)

  ctx.logger.info(`module-agent: Started lizhu session ${lizhuSessionId}`, { lizhu_session_id: lizhuSessionId, starter_session_id: starterSessionId })

  return { lizhu_session_id: lizhuSessionId }
}

function callerModeIsLimu(sessionState: SessionState, callerId: string): boolean {
  return sessionState.getAgentMode(callerId) === 'limu'
}

async function handleStartKui(handler: HandlerContext, plans: Array<{ module_name: string; development_plan: string }>): Promise<JsonValue> {
  const { ctx, host, sessionState, directory, workspaceDir, workspaceName, caller, callerId, signal, isAlive } = handler

  if (!plans || plans.length === 0) {
    return { status: 'error', error: 'plans 不能为空' }
  }

  const kui_plan_id = generateId('kui_plan')

  const existingPlans = readFengzhouPlansSync(workspaceDir, callerId)
  const existingPlanTexts = new Set(
    existingPlans.filter(p => p.status !== 'completed').flatMap(p => p.plans.map(m => m.development_plan))
  )
  const dedupedPlans = plans.filter(p => !existingPlanTexts.has(p.development_plan))
  const skippedPlans = plans.filter(p => existingPlanTexts.has(p.development_plan))

  if (dedupedPlans.length === 0) {
    return {
      status: 'ok',
      message: `所有计划 [${skippedPlans.map(p => p.module_name).join(', ')}] 已有相同内容的未完成夔计划，跳过。`,
      skipped_modules: skippedPlans.map(p => p.module_name),
    }
  }

  const modelConfig = await readAgentModelConfig(workspaceDir)

  const boundKui = await getBoundKui(workspaceDir, callerId, isAlive)
  if (boundKui) {
    writeKuiPlan(workspaceDir, callerId, {
      kui_plan_id,
      plans: dedupedPlans,
      plan_ids: [],
      status: 'pending',
      result: '',
    })

    const skippedNote = skippedPlans.length > 0
      ? ` 已有未完成计划的模块 [${skippedPlans.map(p => p.module_name).join(', ')}] 已跳过。`
      : ''

    await host.followup(caller, boundKui, `有新夔计划写入，请调用 module_agent_reader(action="read_kui_plan") 读取计划并执行。${skippedNote}`, signal)

    recordActivity(boundKui)

    return {
      kui_session_id: boundKui,
      kui_plan_id,
      reused: true,
      written: dedupedPlans.length,
      ...(skippedPlans.length > 0 ? { skipped: skippedPlans.map(p => p.module_name) } : {}),
      notice: CODE_CONSUMED_NOTICE,
    }
  }

  if (!modelConfig?.kui) {
    return { status: 'error', error: '请先使用 agent_model_config(action="set", kui_provider_id="...", kui_model_id="...") 为当前工作空间设置夔默认模型' }
  }

  const kuiValidation = await validateModelConfig(handler.catalog, modelConfig)
  const kuiError = kuiValidation.find(e => e.agent === 'kui')
  if (kuiError) {
    return { status: 'error', error: kuiError.error, hint: '配置的模型可能在当前环境中不可用，请使用 agent_model_config(action="get") 查看当前配置，再通过 agent_model_config(action="set", ...) 重新设置' }
  }

  writeKuiPlan(workspaceDir, callerId, {
    kui_plan_id,
    plans: dedupedPlans,
    plan_ids: [],
    status: 'pending',
    result: '',
  })

  const persona = personaFor('kui', KUI_RULES)

  let started: ContinuableStart
  try {
    started = await host.startChild(
      caller,
      '夔批量编排',
      '请调用 module_agent_reader(action="read_kui_plan") 读取夔计划并执行。',
      {
        persona,
        agentOptions: { provider: modelConfig.kui.providerID, model: modelConfig.kui.modelID },
        toolFilter: { allow: ['module_agent_executor', 'module_agent_reader', 'module_agent_updater', 'module_agent_plan', 'verification_code', 'read', 'grep'] },
      },
      signal,
    )
  } catch (error) {
    return { status: 'error', error: `启动夔失败: ${String(error)}` }
  }

  const kuiSessionId = started.childId
  sessionState.setAgentMode(kuiSessionId, 'kui')
  bindKui(workspaceDir, callerId, kuiSessionId)

  recordActivity(kuiSessionId)

  await setSessionWorkspace(directory, kuiSessionId, workspaceName)

  ctx.logger.info(`module-agent: Started kui session ${kuiSessionId} for kui plan ${kui_plan_id}`, { kui_session_id: kuiSessionId, kui_plan_id, starter: callerId })

  return { kui_session_id: kuiSessionId, kui_plan_id, plan_count: plans.length, notice: CODE_CONSUMED_NOTICE }
}
