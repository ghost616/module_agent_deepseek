import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { validateConfirmationCode, CODE_CONSUMED_NOTICE } from './verification_code.ts'
import {
  removeModuleSession,
  isSessionChecked,
  clearSessionChecked,
  unbindGaotao,
  isGaotaoBoundToFengzhou,
  getBoundStarter,
  removeLizhuSession,
  getLimuStarter,
  getBoundGaotao,
  getFengzhouLimuSessions,
  getFengzhouLizhuSessions,
  getModuleNameBySession,
  unbindKui,
  getBoundKui,
  isKuiBoundToFengzhou,
  getLimuSessionsByStarter,
  getBoundLizhu,
  type IsAlive,
} from '../lib/module_session_tracker.ts'
import { deleteExecutionRecords, readAndCleanExecutionRecords } from '../lib/execution_result.ts'
import { clearActivity, getSessionIdle } from '../lib/limu_monitor.ts'
import { deleteReviewResult, readReviewResult } from '../lib/review_result.ts'
import { getPlanIdBySession, removeMapping } from '../lib/session_plan_map.ts'
import { getBoundWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { deletePlan, readAllMetadata } from '../lib/development_plan.ts'
import { releasePlanFilesSession } from '../lib/plan_files.ts'
import { getSessionWorkspace, removeSessionWorkspace } from '../lib/session_workspace.ts'
import { SubagentHost } from '../lib/subagent_host.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

export interface ModuleAgentDoneToolOptions {
  /** 插件根上下文（subagents / sessions / agents / logger）。 */
  readonly ctx: Context
  /** 会话模式注册表（用于校验调用者身份与清理子智能体模式）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
  /** 启动子智能体使用的 subagent provider 名。 */
  readonly subagentProvider: string
}

interface DoneArgs {
  action?: string
  module_name?: string
  session_id?: string
  confirmation_code?: string
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

// ============================================================
// 可关闭状态检测：返回阻塞原因，null 表示可关闭
// ============================================================

function isBusy(sessionId: string): boolean {
  const idle = getSessionIdle(sessionId)
  return !!idle.lastActivity && !idle.unresponsive
}

async function getGaotaoBlockReason(wsDir: string, sessionId: string, checkBusy: boolean): Promise<string | null> {
  if (checkBusy && isBusy(sessionId)) {
    return '皋陶正在审查中。'
  }
  const reviewResult = await readReviewResult(wsDir, sessionId)
  if (reviewResult && reviewResult.planReviews.length > 0) {
    return `皋陶有 ${reviewResult.planReviews.length} 个审查结果未读取，请先调用 module_agent_executor(action="review_status") 获取审查结果后再关闭。`
  }
  return null
}

async function getLimuBlockReason(wsDir: string, moduleName: string | null, sessionId: string): Promise<string | null> {
  const records = moduleName ? await readAndCleanExecutionRecords(wsDir, moduleName, sessionId) : []
  const planId = await getPlanIdBySession(wsDir, sessionId)
  let isActive = false
  if (planId && records.length > 0) {
    const metadata = await readAllMetadata(wsDir)
    const meta = metadata.find(m => m.plan_id === planId)
    isActive = meta ? !meta.plan_completed : false
  }
  if (isActive && !isSessionChecked(wsDir, sessionId)) {
    return '力牧正在执行任务且未经过二次检查，无法关闭。请先通过 module_agent_executor(action="ping", ...) 进行二次检查。'
  }
  return null
}

async function getLizhuBlockReason(wsDir: string, sessionId: string, checkBusy: boolean): Promise<string | null> {
  const starter = getBoundStarter(wsDir, sessionId)
  if (starter) {
    return '离朱的测试结果尚未被读取（仍绑定到启动者会话），请先调用 module_agent_reader(action="read_test_results") 读取结果。'
  }
  if (checkBusy && isBusy(sessionId)) {
    return '离朱正在测试中。'
  }
  return null
}

async function getKuiBlockReason(sessionId: string): Promise<string | null> {
  if (isBusy(sessionId)) {
    return '夔正在执行批量计划。'
  }
  return null
}

// ============================================================
// 会话关闭与关联数据清理（alive=false 时仅清理数据）
// ============================================================

interface CleanupContext {
  host: SubagentHost
  sessionState: SessionState
  directory: string
}

async function cleanupLizhu(c: CleanupContext, wsDir: string, sessionId: string, alive: boolean): Promise<void> {
  if (alive) {
    await c.host.stop(sessionId)
  }
  c.sessionState.clearAgentMode(sessionId)
  clearActivity(sessionId)
  removeLizhuSession(wsDir, sessionId)
  await removeSessionWorkspace(c.directory, sessionId)
}

async function cleanupGaotao(c: CleanupContext, wsDir: string, fengzhouSessionId: string, sessionId: string, alive: boolean): Promise<void> {
  if (alive) {
    await c.host.stop(sessionId)
  }
  c.sessionState.clearAgentMode(sessionId)
  clearActivity(sessionId)
  await deleteReviewResult(wsDir, sessionId)
  unbindGaotao(wsDir, fengzhouSessionId)
  await removeSessionWorkspace(c.directory, sessionId)
}

async function cleanupLimu(c: CleanupContext, wsDir: string, moduleName: string | null, sessionId: string, alive: boolean): Promise<void> {
  if (alive) {
    await c.host.stop(sessionId)
  }
  removeModuleSession(wsDir, moduleName ?? '', sessionId)
  c.sessionState.clearAgentMode(sessionId)
  if (moduleName) {
    await deleteExecutionRecords(wsDir, moduleName, sessionId)
    await releasePlanFilesSession(c.directory, moduleName, sessionId)
  }
  clearSessionChecked(wsDir, sessionId)
  clearActivity(sessionId)
  const planId = await getPlanIdBySession(wsDir, sessionId)
  if (planId) {
    await deletePlan(wsDir, planId)
  }
  await removeMapping(wsDir, sessionId)
  await removeSessionWorkspace(c.directory, sessionId)
}

async function cleanupKui(c: CleanupContext, wsDir: string, fengzhouSessionId: string, sessionId: string, alive: boolean): Promise<void> {
  if (alive) {
    await c.host.stop(sessionId)
  }
  c.sessionState.clearAgentMode(sessionId)
  clearActivity(sessionId)
  unbindKui(wsDir, fengzhouSessionId)
  await removeSessionWorkspace(c.directory, sessionId)
}

/**
 * 会话关闭工具：关闭力牧/皋陶/离朱/夔会话并清理关联数据，或批量关闭/列出空闲会话。
 * dsh 侧以停止子智能体当前工作 + 清理跟踪数据实现"关闭"，仅风后可调用。
 */
export function createModuleAgentDoneTool(options: ModuleAgentDoneToolOptions) {
  return defineTool({
    name: 'module_agent_done',
    description: '风后完成任务后调用，关闭力牧、皋陶或离朱会话窗口。关闭前检测力牧是否空闲或已二次检查。action=close_all 时批量关闭当前风后关联的皋陶、力牧和离朱（所有会话均处于可关闭状态时才执行关闭），action=list_idle 获取当前风后关联的空闲会话。',
    parameters: {
      action: {
        type: 'string',
        enum: ['close', 'close_all', 'list_idle'],
        description: '操作类型：close 关闭单个会话（默认），close_all 关闭当前风后关联的所有皋陶、力牧和离朱，list_idle 获取当前风后关联的空闲会话',
      },
      module_name: { type: 'string', description: '模块唯一标识名称（关闭离朱或 action=close_all/list_idle 时无需传入）' },
      session_id: { type: 'string', description: '力牧、皋陶或离朱会话 ID（action=close 时必填）' },
      confirmation_code: { type: 'string', description: '确认码（action=close/close_all 时必填）' },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const agent = exec.agent
      const agentId = agent?.id ?? ''
      if (options.sessionState.getAgentMode(agentId) !== 'fengzhou') {
        return { status: 'error', error: 'module_agent_done 仅供风后调用。' }
      }
      if (!agent) {
        return { status: 'error', error: 'module_agent_done 需要在 agent 上下文中调用。' }
      }

      const doneArgs = args as DoneArgs
      const action = doneArgs.action ?? 'close'

      if (action !== 'list_idle') {
        const error = validateConfirmationCode(doneArgs.confirmation_code, agentId)
        if (error) return error
      }

      const directory = directoryOfAgent(agent, options.dataDir)
      const boundWs = await getBoundWorkspace(directory, agentId)
      if (!boundWs) {
        return { status: 'error', error: '请先通过 workspace(action="create"|"bind") 绑定工作空间' }
      }
      const wsDir = getWorkspaceDir(directory, boundWs)

      const host = new SubagentHost(options.ctx, options.subagentProvider)
      const isAlive = makeAliveChecker(host)
      const cleanup: CleanupContext = { host, sessionState: options.sessionState, directory }

      if (action === 'list_idle') {
        return handleListIdle(wsDir, agentId, isAlive)
      }

      if (action === 'close_all') {
        return handleCloseAll(cleanup, wsDir, agentId, isAlive)
      }

      const moduleName = doneArgs.module_name ?? null
      const sessionId = doneArgs.session_id
      if (!sessionId) {
        return { status: 'error', error: 'session_id 必填（action=close 时）。' }
      }
      const targetMode = options.sessionState.getAgentMode(sessionId)

      if (targetMode === 'limu' || targetMode === 'gaotao' || targetMode === 'lizhu' || targetMode === 'kui') {
        const sessionWs = await getSessionWorkspace(directory, sessionId)
        if (sessionWs && sessionWs !== boundWs) {
          return { status: 'error', error: `要关闭的会话属于工作空间 '${sessionWs}'，与当前风后绑定的 '${boundWs}' 不一致。` }
        }
      }

      const alive = await isAlive(sessionId)
      const closedNotice = (message: string): { status: string; message: string; notice: string } =>
        ({ status: 'ok', message, notice: CODE_CONSUMED_NOTICE })

      if (targetMode === 'lizhu') {
        if (alive) {
          const reason = await getLizhuBlockReason(wsDir, sessionId, false)
          if (reason) {
            return { status: 'error', error: reason }
          }
        }
        await cleanupLizhu(cleanup, wsDir, sessionId, alive)
        return alive
          ? { title: '离朱已关闭', ...closedNotice(`离朱会话 ${sessionId} 已关闭。`) }
          : { title: '会话不存在', ...closedNotice(`会话 ${sessionId} 不存在，已清理关联数据。`) }
      }

      if (targetMode === 'gaotao') {
        if (!isGaotaoBoundToFengzhou(wsDir, agentId, sessionId)) {
          return { status: 'error', error: '该皋陶不是当前风后开启的，无法关闭。' }
        }
        const reason = await getGaotaoBlockReason(wsDir, sessionId, false)
        if (reason) {
          return { status: 'error', error: reason }
        }
        await cleanupGaotao(cleanup, wsDir, agentId, sessionId, alive)
        return alive
          ? { title: '皋陶已关闭', ...closedNotice(`模块 '${moduleName}' 的皋陶会话 ${sessionId} 已关闭。`) }
          : { title: '会话不存在', ...closedNotice(`会话 ${sessionId} 不存在，已清理关联数据。`) }
      }

      if (targetMode === 'kui') {
        if (!isKuiBoundToFengzhou(wsDir, agentId, sessionId)) {
          return { status: 'error', error: '该夔不是当前风后开启的，无法关闭。' }
        }

        const kuiLimuSids = getLimuSessionsByStarter(wsDir, sessionId)
        const kuiGaotaoSid = await getBoundGaotao(wsDir, sessionId, isAlive)

        const blockers: Array<{ session_id: string; agent: string; reason: string }> = []

        if (alive) {
          const reason = await getKuiBlockReason(sessionId)
          if (reason) blockers.push({ session_id: sessionId, agent: 'kui', reason })
        }

        for (const limuSid of kuiLimuSids) {
          if (!(await isAlive(limuSid))) continue
          const limuModule = getModuleNameBySession(wsDir, limuSid)
          const reason = await getLimuBlockReason(wsDir, limuModule, limuSid)
          if (reason) blockers.push({ session_id: limuSid, agent: 'limu', reason })
        }

        if (kuiGaotaoSid && (await isAlive(kuiGaotaoSid))) {
          const reason = await getGaotaoBlockReason(wsDir, kuiGaotaoSid, true)
          if (reason) blockers.push({ session_id: kuiGaotaoSid, agent: 'gaotao', reason })
        }

        for (const limuSid of kuiLimuSids) {
          const lizhuSid = getBoundLizhu(wsDir, limuSid)
          if (lizhuSid && (await isAlive(lizhuSid))) {
            const reason = await getLizhuBlockReason(wsDir, lizhuSid, true)
            if (reason) blockers.push({ session_id: lizhuSid, agent: 'lizhu', reason })
          }
        }

        if (blockers.length > 0) {
          return { status: 'error', error: '夔及其关联会话存在不可关闭的会话，本次未关闭任何会话。', blockers: blockers as unknown as JsonValue }
        }

        const closed: string[] = []

        for (const limuSid of kuiLimuSids) {
          const lizhuSid = getBoundLizhu(wsDir, limuSid)
          if (lizhuSid) {
            await cleanupLizhu(cleanup, wsDir, lizhuSid, await isAlive(lizhuSid))
            closed.push(lizhuSid)
          }
        }

        for (const limuSid of kuiLimuSids) {
          const limuModule = getModuleNameBySession(wsDir, limuSid)
          await cleanupLimu(cleanup, wsDir, limuModule, limuSid, await isAlive(limuSid))
          closed.push(limuSid)
        }

        if (kuiGaotaoSid) {
          await cleanupGaotao(cleanup, wsDir, sessionId, kuiGaotaoSid, await isAlive(kuiGaotaoSid))
          closed.push(kuiGaotaoSid)
        }

        await cleanupKui(cleanup, wsDir, agentId, sessionId, alive)
        closed.push(sessionId)

        return closedNotice(`夔及其关联的 ${closed.length - 1} 个会话已关闭。`)
      }

      if (alive) {
        const limuStarter = getLimuStarter(wsDir, sessionId)
        if (limuStarter && limuStarter !== agentId) {
          const kuiBound = isKuiBoundToFengzhou(wsDir, agentId, limuStarter)
          if (!kuiBound) {
            return { status: 'error', error: '该力牧不是当前风后开启的，无法关闭。' }
          }
        }
        const reason = await getLimuBlockReason(wsDir, moduleName, sessionId)
        if (reason) {
          return { status: 'error', error: reason }
        }
      }
      await cleanupLimu(cleanup, wsDir, moduleName, sessionId, alive)
      return alive
        ? { title: '力牧已关闭', ...closedNotice(`模块 '${moduleName}' 的力牧会话 ${sessionId} 已关闭。`) }
        : { title: '会话不存在', ...closedNotice(`会话 ${sessionId} 不存在，已清理关联数据。`) }
    },
  })
}

async function handleCloseAll(
  c: CleanupContext,
  wsDir: string,
  fengzhouSessionId: string,
  isAlive: IsAlive,
): Promise<JsonValue> {
  // 收集当前风后关联的会话
  const gaotaoSid = await getBoundGaotao(wsDir, fengzhouSessionId, isAlive)
  const kuiSid = await getBoundKui(wsDir, fengzhouSessionId, isAlive)
  const kuiGaotaoSid = kuiSid ? await getBoundGaotao(wsDir, kuiSid, isAlive) : null
  const limuSids = getFengzhouLimuSessions(wsDir, fengzhouSessionId)
  const lizhuSids = getFengzhouLizhuSessions(wsDir, fengzhouSessionId)

  if (!gaotaoSid && !kuiGaotaoSid && !kuiSid && limuSids.length === 0 && lizhuSids.length === 0) {
    return { status: 'ok', message: '当前风后没有关联的皋陶、力牧、离朱或夔会话。', notice: CODE_CONSUMED_NOTICE }
  }

  // 状态检测：全部处于可关闭状态才执行关闭
  const blockers: Array<{ session_id: string; agent: string; reason: string }> = []

  if (gaotaoSid) {
    const reason = await getGaotaoBlockReason(wsDir, gaotaoSid, true)
    if (reason) blockers.push({ session_id: gaotaoSid, agent: 'gaotao', reason })
  }

  if (kuiGaotaoSid) {
    const reason = await getGaotaoBlockReason(wsDir, kuiGaotaoSid, true)
    if (reason) blockers.push({ session_id: kuiGaotaoSid, agent: 'gaotao', reason })
  }

  const limuModules = new Map<string, string | null>()
  for (const limuSid of limuSids) {
    const limuModule = getModuleNameBySession(wsDir, limuSid)
    limuModules.set(limuSid, limuModule)
    if (!(await isAlive(limuSid))) continue

    const reason = await getLimuBlockReason(wsDir, limuModule, limuSid)
    if (reason) blockers.push({ session_id: limuSid, agent: 'limu', reason })
  }

  for (const lizhuSid of lizhuSids) {
    if (!(await isAlive(lizhuSid))) continue
    const reason = await getLizhuBlockReason(wsDir, lizhuSid, true)
    if (reason) blockers.push({ session_id: lizhuSid, agent: 'lizhu', reason })
  }

  if (kuiSid) {
    const reason = await getKuiBlockReason(kuiSid)
    if (reason) blockers.push({ session_id: kuiSid, agent: 'kui', reason })
  }

  if (blockers.length > 0) {
    return { status: 'error', error: '存在不可关闭的会话，本次未关闭任何会话。', blockers: blockers as unknown as JsonValue }
  }

  // 全部可关闭，逐个关闭并清理关联数据
  const closed = { gaotao: [] as string[], limu: [] as string[], lizhu: [] as string[], kui: [] as string[] }

  for (const lizhuSid of lizhuSids) {
    await cleanupLizhu(c, wsDir, lizhuSid, await isAlive(lizhuSid))
    closed.lizhu.push(lizhuSid)
  }

  for (const limuSid of limuSids) {
    await cleanupLimu(c, wsDir, limuModules.get(limuSid) ?? null, limuSid, await isAlive(limuSid))
    closed.limu.push(limuSid)
  }

  if (gaotaoSid) {
    await cleanupGaotao(c, wsDir, fengzhouSessionId, gaotaoSid, await isAlive(gaotaoSid))
    closed.gaotao.push(gaotaoSid)
  }

  if (kuiGaotaoSid && kuiSid) {
    await cleanupGaotao(c, wsDir, kuiSid, kuiGaotaoSid, await isAlive(kuiGaotaoSid))
    closed.gaotao.push(kuiGaotaoSid)
  }

  if (kuiSid) {
    await cleanupKui(c, wsDir, fengzhouSessionId, kuiSid, await isAlive(kuiSid))
    closed.kui.push(kuiSid)
  }

  const total = closed.gaotao.length + closed.limu.length + closed.lizhu.length + closed.kui.length
  return { status: 'ok', closed: closed as unknown as JsonValue, notice: CODE_CONSUMED_NOTICE, total }
}

interface IdleSessionInfo {
  session_id: string
  module_name?: string | null
  idle_seconds: number | null
}

async function handleListIdle(
  wsDir: string,
  fengzhouSessionId: string,
  isAlive: IsAlive,
): Promise<JsonValue> {
  const gaotaoSid = await getBoundGaotao(wsDir, fengzhouSessionId, isAlive)
  const kuiSid = await getBoundKui(wsDir, fengzhouSessionId, isAlive)
  const limuSids = getFengzhouLimuSessions(wsDir, fengzhouSessionId)
  const lizhuSids = getFengzhouLizhuSessions(wsDir, fengzhouSessionId)

  const idleSessions = { gaotao: [] as IdleSessionInfo[], limu: [] as IdleSessionInfo[], lizhu: [] as IdleSessionInfo[], kui: [] as IdleSessionInfo[] }

  if (gaotaoSid && (await isAlive(gaotaoSid)) && !isBusy(gaotaoSid)) {
    idleSessions.gaotao.push({ session_id: gaotaoSid, idle_seconds: getSessionIdle(gaotaoSid).idleSeconds })
  }

  for (const limuSid of limuSids) {
    if (!(await isAlive(limuSid)) || isBusy(limuSid)) continue
    const moduleName = getModuleNameBySession(wsDir, limuSid)
    idleSessions.limu.push({ session_id: limuSid, module_name: moduleName, idle_seconds: getSessionIdle(limuSid).idleSeconds })
  }

  for (const lizhuSid of lizhuSids) {
    if (!(await isAlive(lizhuSid)) || isBusy(lizhuSid)) continue
    idleSessions.lizhu.push({ session_id: lizhuSid, idle_seconds: getSessionIdle(lizhuSid).idleSeconds })
  }

  if (kuiSid && (await isAlive(kuiSid)) && !isBusy(kuiSid)) {
    idleSessions.kui.push({ session_id: kuiSid, idle_seconds: getSessionIdle(kuiSid).idleSeconds })
  }

  return { status: 'ok', idle_sessions: idleSessions as unknown as JsonValue }
}
