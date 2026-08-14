import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { findModule } from '../lib/module_tree.ts'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { readCurrentSpec, getSpecHeadings, getSpecSection } from '../lib/module_spec.ts'
import { readModuleDefinition, getModuleParentDirs } from '../lib/module_definition.ts'
import { moduleAgentDir, CHANGE_HISTORY_FILE } from '../lib/constants.ts'
import { exists, readText, readJson, sanitizeIdSegment } from '../lib/fs.ts'
import { readPlanFiles } from '../lib/plan_files.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { getBoundLizhu, getBoundStarter, unbindLizhu, getKuiStarter } from '../lib/module_session_tracker.ts'
import { isWorking } from '../lib/limu_monitor.ts'
import { readFirstPendingKuiPlan, readKuiPlan, readFengzhouPlans } from '../lib/kui_plan.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentReaderToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/**
 * 读取模块元数据文件，供风后在评估变更、力牧在执行时使用，离朱读取测试说明和结果。
 * 测试结果 / 夔计划相关 action 依赖 orchestration 模块的会话绑定与监控库。
 */
export function createModuleAgentReaderTool(options: ModuleAgentReaderToolOptions) {
  return defineTool({
    name: 'module_agent_reader',
    description: '读取模块元数据文件，供风后在评估变更、力牧在执行时使用，离朱读取测试说明和结果。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read_spec', 'read_spec_headings', 'read_spec_section', 'read_definition', 'read_descriptions', 'read_history', 'read_dirs', 'read_plan_files', 'read_test_results', 'read_test_specs', 'read_kui_plan', 'read_all_kui_plans', 'read_kui_plan_detail'],
        description: '读取目标文件：read_definition 获取模块文件路径列表，read_descriptions 按路径获取文件功能说明',
      },
      module_name: {
        type: 'string',
        description: '模块唯一标识名称（read_test_results / read_test_specs / read_kui_plan / read_all_kui_plans / read_kui_plan_detail 时无需传入）',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'read_descriptions：要查询说明的文件路径列表',
      },
      from: {
        type: 'string',
        description: 'read_history：起始时间 ISO 8601（含）',
      },
      to: {
        type: 'string',
        description: 'read_history：结束时间 ISO 8601（含）',
      },
      lizhu_session_id: {
        type: 'string',
        description: 'read_test_results：离朱会话 ID（不传则读取调用者绑定的离朱结果）',
      },
      kui_plan_id: {
        type: 'string',
        description: 'read_kui_plan_detail：夔计划 ID',
      },
      heading: {
        type: 'string',
        description: 'read_spec_section：要读取的 section 标题名（不含 ## 前缀）',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)

      if (mode !== 'fengzhou' && mode !== 'limu' && mode !== 'gaotao' && mode !== 'lishou' && mode !== 'lizhu' && mode !== 'kui') {
        return { status: 'error', error: 'module_agent_reader 仅供风后、力牧、皋陶、隶首、离朱或夔调用。' }
      }

      // TODO(orchestration)：力牧计划有效性守卫（limuPlanGuard）由 orchestration
      // 模块通过 tools.guard 挂载，本模块不重复实现。

      const action = args.action

      if (mode === 'lizhu' && action !== 'read_test_specs') {
        return { status: 'error', error: `module_agent_reader action="${action}" 仅供风后、力牧或皋陶调用，离朱仅可使用 read_test_specs。` }
      }

      const kuiActions = ['read_kui_plan', 'read_all_kui_plans', 'read_kui_plan_detail']
      const fengzhouKuiActions = ['read_all_kui_plans', 'read_kui_plan_detail']
      if (kuiActions.includes(action) && mode !== 'kui') {
        if (mode !== 'fengzhou' || !fengzhouKuiActions.includes(action)) {
          return { status: 'error', error: `module_agent_reader action="${action}" 仅供夔调用。` }
        }
      }

      if (action === 'read_test_results') return handleReadTestResults(directory, agentId, args as Record<string, unknown>)
      if (action === 'read_test_specs') return handleReadTestSpecs(directory, agentId, mode)
      if (action === 'read_kui_plan') return handleReadKuiPlan(directory, agentId, mode)
      if (action === 'read_all_kui_plans') return handleReadAllKuiPlans(directory, agentId, mode)
      if (action === 'read_kui_plan_detail') return handleReadKuiPlanDetail(directory, agentId, mode, args.kui_plan_id)

      const moduleName = args.module_name
      if (!moduleName) {
        return { status: 'error', error: '当前 action 需提供 module_name' }
      }

      const mod = await findModule(directory, moduleName)
      if (!mod) {
        return { status: 'error', error: `模块 '${moduleName}' 不存在` }
      }

      try {
        if (action === 'read_spec') {
          const content = await readCurrentSpec(directory, moduleName)
          return { status: 'ok', content: content || '(空)' }
        }

        if (action === 'read_spec_headings') {
          const headings = await getSpecHeadings(directory, moduleName)
          return { status: 'ok', headings }
        }

        if (action === 'read_spec_section') {
          const heading = args.heading
          if (!heading) {
            return { status: 'error', error: 'read_spec_section 需提供 heading 参数' }
          }
          const section = await getSpecSection(directory, moduleName, heading)
          return { status: 'ok', content: section || '(空)' }
        }

        if (action === 'read_definition') {
          const def = await readModuleDefinition(directory, moduleName)
          return { status: 'ok', module_name: moduleName, paths: def.files.map((f) => f.path) }
        }

        if (action === 'read_descriptions') {
          const paths = args.paths
          if (!paths || paths.length === 0) {
            return { status: 'error', error: 'read_descriptions 需提供非空的 paths 列表' }
          }
          const def = await readModuleDefinition(directory, moduleName)
          const fileMap = new Map(def.files.map((f) => [f.path, f.description]))
          const found: { path: string; description: string }[] = []
          const notFound: string[] = []
          for (const p of paths) {
            if (fileMap.has(p)) {
              found.push({ path: p, description: fileMap.get(p)! })
            } else {
              notFound.push(p)
            }
          }
          return { status: 'ok', module_name: moduleName, files: found, not_found: notFound }
        }

        if (action === 'read_dirs') {
          const dirs = await getModuleParentDirs(directory, moduleName)
          return { status: 'ok', dirs }
        }

        if (action === 'read_plan_files') {
          const data = await readPlanFiles(directory, moduleName)
          if (!data) return { status: 'ok', files: [] }
          return { status: 'ok', files: data as unknown as JsonValue }
        }

        if (action === 'read_history') {
          const logPath = join(moduleAgentDir(directory, moduleName), CHANGE_HISTORY_FILE)
          const content = (await exists(logPath)) ? await readText(logPath) : ''
          const from = args.from
          const to = args.to
          if (!from && !to) {
            return { status: 'ok', content: content || '(空)' }
          }
          const fromMs = from ? Date.parse(from) : 0
          const toMs = to ? Date.parse(to) : Infinity
          if (isNaN(fromMs) || isNaN(toMs)) {
            return { status: 'error', error: 'from/to 需为有效 ISO 8601 时间字符串' }
          }
          const re = /^\[(.+?)\]/
          const filtered = content
            .split('\n')
            .filter((line) => {
              const m = line.match(re)
              if (!m) return false
              const group = m[1]
              if (group === undefined) return false
              const ts = Date.parse(group)
              return !isNaN(ts) && ts >= fromMs && ts <= toMs
            })
            .join('\n')
          return { status: 'ok', content: filtered || '(空)' }
        }

        return { status: 'error', error: `未知 action: ${action}` }
      } catch (err) {
        return { status: 'error', error: (err as Error).message }
      }
    },
  })
}

/** 读取绑定离朱的测试报告并解除绑定（orchestration：会话绑定跟踪）。 */
async function handleReadTestResults(directory: string, sessionId: string, args: Record<string, unknown>): Promise<JsonValue> {
  const ws = await resolveWorkspace(directory, sessionId)
  if (!ws) {
    return { status: 'error', error: '未关联工作空间' }
  }
  const wsDir = getWorkspaceDir(directory, ws)

  let lizhuSid: string | null = typeof args.lizhu_session_id === 'string' ? args.lizhu_session_id : null
  if (!lizhuSid) {
    lizhuSid = await getBoundLizhu(wsDir, sessionId)
  }
  if (!lizhuSid) {
    return { status: 'ok', message: '当前无绑定的离朱测试报告' }
  }

  if (isWorking(lizhuSid)) {
    return {
      status: 'error',
      error: '离朱仍在运行中，请等待离朱发消息后再读取测试结果。',
      lizhu_session_id: lizhuSid,
    }
  }

  const reportPath = join(wsDir, 'test_reports', `${sanitizeIdSegment(lizhuSid)}.json`)
  if (!(await exists(reportPath))) {
    return { status: 'ok', message: '离朱尚未生成测试报告', lizhu_session_id: lizhuSid }
  }

  let report: JsonValue
  try {
    report = await readJson<JsonValue>(reportPath)
  } catch (err) {
    await unbindLizhu(wsDir, sessionId)
    return { status: 'error', error: (err as Error).message, lizhu_session_id: lizhuSid }
  }

  await unbindLizhu(wsDir, sessionId)

  return { status: 'ok', report }
}

/** 读取测试说明：离朱通过启动者会话定位 test_specs/<starter>.json。 */
async function handleReadTestSpecs(directory: string, sessionId: string, mode: string | undefined): Promise<JsonValue> {
  const ws = await resolveWorkspace(directory, sessionId)
  if (!ws) {
    return { status: 'error', error: '未关联工作空间' }
  }
  const wsDir = getWorkspaceDir(directory, ws)

  let specSessionId = sessionId

  if (mode === 'lizhu') {
    const starter = await getBoundStarter(wsDir, sessionId)
    if (!starter) {
      return { status: 'error', error: '离朱未绑定到任何启动者会话' }
    }
    specSessionId = starter
  }

  const specPath = join(wsDir, 'test_specs', `${sanitizeIdSegment(specSessionId)}.json`)
  if (!(await exists(specPath))) {
    return { status: 'ok', message: '未找到测试说明', spec_session_id: specSessionId }
  }

  try {
    const spec = await readJson<JsonValue>(specPath)
    return { status: 'ok', spec }
  } catch (err) {
    return { status: 'error', error: (err as Error).message }
  }
}

/** 解析夔会话所属的风后：夔通过 getKuiStarter，风后直接取自身。 */
async function resolveFengzhouForKui(directory: string, sessionId: string, mode: string | undefined): Promise<{ wsDir: string; fengzhouSessionId: string } | null> {
  const boundWs = await resolveWorkspace(directory, sessionId)
  if (!boundWs) {
    return null
  }
  const wsDir = getWorkspaceDir(directory, boundWs)

  let fengzhouSessionId: string
  if (mode === 'fengzhou') {
    fengzhouSessionId = sessionId
  } else {
    const starter = await getKuiStarter(wsDir, sessionId)
    if (!starter) {
      return null
    }
    fengzhouSessionId = starter
  }

  return { wsDir, fengzhouSessionId }
}

async function handleReadKuiPlan(directory: string, sessionId: string, mode: string | undefined): Promise<JsonValue> {
  const resolved = await resolveFengzhouForKui(directory, sessionId, mode)
  if (!resolved) {
    return { status: 'error', error: '未绑定工作空间或夔未绑定到风后' }
  }

  const plan = await readFirstPendingKuiPlan(resolved.wsDir, resolved.fengzhouSessionId)
  if (!plan) {
    return { status: 'ok', message: `风后 ${resolved.fengzhouSessionId} 没有待处理的夔计划` }
  }

  return { status: 'ok', kui_plan: plan as unknown as JsonValue }
}

async function handleReadAllKuiPlans(directory: string, sessionId: string, mode: string | undefined): Promise<JsonValue> {
  const resolved = await resolveFengzhouForKui(directory, sessionId, mode)
  if (!resolved) {
    return { status: 'error', error: '未绑定工作空间或夔未绑定到风后' }
  }

  const plans = await readFengzhouPlans(resolved.wsDir, resolved.fengzhouSessionId)
  if (plans.length === 0) {
    return { status: 'ok', message: '没有夔计划', plans: [] }
  }

  const summaries = plans.map(p => ({
    kui_plan_id: p.kui_plan_id,
    status: p.status,
    result: p.result,
    plans: p.plans as unknown as JsonValue,
  }))

  return { status: 'ok', plans: summaries as unknown as JsonValue }
}

async function handleReadKuiPlanDetail(directory: string, sessionId: string, mode: string | undefined, kuiPlanId: unknown): Promise<JsonValue> {
  if (typeof kuiPlanId !== 'string' || !kuiPlanId) {
    return { status: 'error', error: 'kui_plan_id 必填' }
  }

  const resolved = await resolveFengzhouForKui(directory, sessionId, mode)
  if (!resolved) {
    return { status: 'error', error: '未绑定工作空间或夔未绑定到风后' }
  }

  const plan = await readKuiPlan(resolved.wsDir, resolved.fengzhouSessionId, kuiPlanId)
  if (!plan) {
    return { status: 'error', error: `夔计划 ${kuiPlanId} 不存在` }
  }

  return { status: 'ok', kui_plan_id: plan.kui_plan_id, plan_status: plan.status, result: plan.result, plans: plan.plans as unknown as JsonValue }
}
