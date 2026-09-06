import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the `subagent/start` event augmentation into the program.
import type {} from '@deepseek-ai/dsh-subagent'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { SESSION_MODES_FILE } from './constants.ts'
import { readJsonSync, writeJsonSync } from './fs.ts'
import { inheritWorkspaceBinding } from './workspace.ts'

export type AgentMode = 'fengzhou' | 'qibo' | 'limu' | 'gaotao' | 'lishou' | 'lizhu' | 'kui'

export const AGENT_MODES: readonly AgentMode[] = ['fengzhou', 'qibo', 'limu', 'gaotao', 'lishou', 'lizhu', 'kui']

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  fengzhou: '风后',
  qibo: '岐伯',
  limu: '力牧',
  gaotao: '皋陶',
  lishou: '隶首',
  lizhu: '离朱',
  kui: '夔',
}

export function isAgentMode(value: string): value is AgentMode {
  return (AGENT_MODES as readonly string[]).includes(value)
}

/** 是否为框架托管的子智能体模式（需要提示词注入与完成通知）。 */
export type FrameworkSubagentMode = Extract<AgentMode, 'limu' | 'gaotao' | 'lizhu' | 'kui'>

export function isFrameworkSubagentMode(mode: AgentMode | undefined): mode is FrameworkSubagentMode {
  return mode === 'limu' || mode === 'gaotao' || mode === 'lizhu' || mode === 'kui'
}

/**
 * 宿主会话模式：风后/岐伯/隶首。其身份无 subagent persona marker，mode 经
 * {@link persistMode} 持久化到 `.module_agent/session_modes.json`，重启后由
 * `agent/session-start` 经 {@link restoreMode} 恢复。
 */
export const HOST_MODES: readonly AgentMode[] = ['fengzhou', 'qibo', 'lishou']

export function isHostMode(mode: AgentMode): boolean {
  return HOST_MODES.includes(mode)
}

/**
 * 子智能体 persona 中标记身份的 marker 前缀。orchestration 模块在创建
 * 力牧/皋陶/离朱/夔子智能体时，在其 persona 中注入
 * `module-agent:role=<mode>` 标记；framework 通过 {@link modeFromPersona}
 * 从 persona 文本识别身份。
 */
export const AGENT_MODE_MARKER = 'module-agent:role'

/** 构造带身份标记的 persona 片段（供 orchestration 模块拼入子智能体 persona）。 */
export function personaForMode(mode: AgentMode): string {
  return `${AGENT_MODE_MARKER}=${mode}`
}

/** 从 persona 文本中识别身份标记，未命中返回 undefined。 */
export function modeFromPersona(persona: string): AgentMode | undefined {
  const prefix = `${AGENT_MODE_MARKER}=`
  const index = persona.indexOf(prefix)
  if (index < 0) return undefined
  // 分隔符覆盖 ASCII 空白/`,`/`;` 及中文全角标点，提升 marker 嵌入 persona 时的识别鲁棒性。
  const candidate = persona.slice(index + prefix.length).split(/[\s,;，。；：、]/)[0] ?? ''
  return isAgentMode(candidate) ? candidate : undefined
}

/**
 * 从 subagent provider 名识别身份。provider 遵循 `module-agent:<mode>` 命名约定
 * 时自动分类；否则依赖 orchestration 显式 setAgentMode。
 */
export function modeFromProvider(provider: string): AgentMode | undefined {
  const prefix = 'module-agent:'
  if (!provider.startsWith(prefix)) return undefined
  const candidate = provider.slice(prefix.length)
  return isAgentMode(candidate) ? candidate : undefined
}

/**
 * 会话模式注册表：dsh 中以 subagent persona/descriptor 标记
 * 力牧/皋陶/离朱/夔身份，替代 opencode 的 session_modes.json 映射。
 * orchestration 模块在创建子智能体时通过 {@link setAgentMode} 注册，
 * 或当 provider 名遵循 `module-agent:<mode>` 约定时由 subagent/start
 * 事件自动分类；冷恢复时（provider 名不命中）从持久化的
 * subagent/descriptor persona 识别 marker 重建身份。
 */
export class SessionState {
  private readonly modes = new Map<string, AgentMode>()

  getAgentMode(sessionId: string): AgentMode | undefined {
    return this.modes.get(sessionId)
  }

  setAgentMode(sessionId: string, mode: AgentMode): void {
    this.modes.set(sessionId, mode)
  }

  clearAgentMode(sessionId: string): void {
    this.modes.delete(sessionId)
  }

  /**
   * 清理已不存在会话的残留 mode（对齐 opencode cleanStaleAgentModes 语义，
   * 用于 stale_cleanup 兜底清理）。modes 为内存 Map，先快照 key 再逐个存活判定。
   * @param isAlive 会话存活判定（不可用视为 false）
   * @returns 被清理的 mode 数量
   */
  async cleanStaleModes(isAlive: (sessionId: string) => Promise<boolean>): Promise<number> {
    let removed = 0
    for (const sessionId of [...this.modes.keys()]) {
      if (!(await isAlive(sessionId))) {
        this.modes.delete(sessionId)
        removed++
      }
    }
    return removed
  }

  /** 根据 provider 名自动分类并注册，未命中返回 undefined。 */
  classifyProvider(sessionId: SessionId, provider: string): AgentMode | undefined {
    const mode = modeFromProvider(provider)
    if (mode !== undefined) this.modes.set(sessionId, mode)
    return mode
  }
}

export function createSessionState(): SessionState {
  return new SessionState()
}

/** 宿主会话 mode 持久化文件路径：<directory>/.module_agent/session_modes.json。 */
function sessionModesPath(directory: string): string {
  return join(directory, SESSION_MODES_FILE)
}

/**
 * 读取宿主会话 mode 持久化文件，返回 sessionId→mode 映射。
 * 读失败（文件不存在 / 坏 JSON）返回空对象，与 persistMode 的读-改-写配合。
 */
export function restoreMode(directory: string): Record<string, AgentMode> {
  try {
    return readJsonSync<Record<string, AgentMode>>(sessionModesPath(directory))
  } catch {
    return {}
  }
}

/**
 * 将宿主会话 mode 持久化到 `.module_agent/session_modes.json`：读现有映射（失败
 * 视为空）→ 更新 sessionId→mode → 写文件。同步 read-modify-write，无并发竞态。
 * 仅宿主会话（风后/岐伯/隶首）应写入；子代理 mode 走 persona marker，由调用方
 * 保证只对宿主会话调用。
 */
export function persistMode(directory: string, sessionId: string, mode: AgentMode): void {
  const modes = restoreMode(directory)
  modes[sessionId] = mode
  const path = sessionModesPath(directory)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonSync(path, modes)
}

/**
 * 清理持久化文件中已不存在会话的宿主 mode（对齐 cleanStaleModes 语义，供
 * stale_cleanup 兜底清理文件残留）。先快照 key 再逐个存活判定删除，有删除时
 * 重写文件；读失败视为空映射返回 0。
 * @param isAlive 会话存活判定（不可用视为 false）
 * @returns 被清理的 mode 数量
 */
export async function cleanStalePersistedModes(
  directory: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const modes = restoreMode(directory)
  const ids = Object.keys(modes)
  if (ids.length === 0) return 0
  let removed = 0
  for (const sessionId of ids) {
    if (!(await isAlive(sessionId))) {
      delete modes[sessionId]
      removed++
    }
  }
  if (removed > 0) {
    const path = sessionModesPath(directory)
    mkdirSync(dirname(path), { recursive: true })
    writeJsonSync(path, modes)
  }
  return removed
}

/**
 * 将 SessionState 绑定到 dsh 生命周期：subagent/start 自动分类 + agent/session-start
 * 恢复宿主会话 mode。返回 effect disposer 交由调用方挂载。
 *
 * mode 清理不再绑定 agent/disposed（dispose 先于 subagent-settled 触发，过早清除
 * 会导致 agent/pre-step 拦截时 getAgentMode 返回 undefined），改由 subagent-settled
 * 处理后 clearAgentMode 及 stale_cleanup 的 cleanStaleModes 兜底。
 *
 * 分类链保持同步：先按 provider 名约定（`module-agent:<mode>`）识别；未命中时
 * 从已持久化的 subagent/descriptor 事件恢复 —— 冷恢复的 continuable 子智能体
 * 同样会触发 subagent/start，此时通过 ctx.agents 取回 agent，用
 * {@link foldSubagentDescriptor} 折叠出其 persona 并识别身份 marker。
 *
 * 宿主会话（风后/岐伯/隶首）无 subagent descriptor，经 agent/session-start 从
 * {@link persistMode} 写入的 `.module_agent/session_modes.json` 恢复：内存已有 mode
 * 时跳过（不覆盖 subagent/start 刚建立的子代理身份），restoreMode 命中且为宿主
 * 模式才注册。
 *
 * dsh 普通顶层 fork（commands.fork 创建的 child：无 origin、isSeeded、parentSession
 * 指向父会话）新会话启动时，继承父会话的宿主 host mode（内存 ?? 持久化）与工作空间
 * 绑定 {@link inheritWorkspaceBinding}，使 fork 分支内 module-agent 工具的工作空间
 * 解析与风后权限即时恢复；子代理 fork/续用（origin='subagent'）走 descriptor 身份
 * 通道，不触发本继承。父无 mode/绑定或非宿主 mode 时静默跳过（不误标、不改文件）。
 * @param fallback agent 会话 cwd 缺失时兜底的项目根目录（与 persistMode 写入端一致）
 */
export function registerSessionState(ctx: Context, state: SessionState, fallback?: string): () => Promise<void> {
  return ctx.effect(function* () {
    yield ctx.on('subagent/start', (info) => {
      if (state.classifyProvider(info.id, info.provider) !== undefined) return
      const agent = ctx.agents.get(info.id)
      if (agent === undefined) return
      // 冷恢复时 session 含 fork 继承前缀，child 自有事件为 ownEvents()
      // （自 inheritedEventCount 起的截断结果），折叠其中 descriptor 再识别身份。
      const descriptor = foldSubagentDescriptor(agent.session.ownEvents())
      if (descriptor?.mode !== 'continuable') return
      const mode = modeFromPersona(descriptor.persona ?? '')
      if (mode !== undefined) state.setAgentMode(info.id, mode)
    })

    yield ctx.on('agent/session-start', ({ agent }) => {
      if (state.getAgentMode(agent.id) !== undefined) return
      const directory = directoryOfAgent(agent, fallback)
      const persisted = restoreMode(directory)
      const own = persisted[agent.id]
      if (own !== undefined && isHostMode(own)) {
        state.setAgentMode(agent.id, own)
        return
      }
      // dsh 普通顶层 fork child：无 origin、parentSession 指向父会话。继承父宿主 mode
      // 与工作空间绑定（幂等、静默；父无绑定/非宿主 mode 时跳过）。
      const header = agent.session.header
      if (header.parentSession === undefined || header.origin === 'subagent') return
      const parentMode = state.getAgentMode(header.parentSession) ?? persisted[header.parentSession]
      if (parentMode !== undefined && isHostMode(parentMode)) {
        state.setAgentMode(agent.id, parentMode)
        persistMode(directory, agent.id, parentMode)
      }
      inheritWorkspaceBinding(directory, header.parentSession, agent.id)
    })
  }, 'module-agent.sessionState()')
}

/** 从 agent 的会话 cwd 解析项目根目录，缺省回退配置目录。 */
export function directoryOfAgent(agent: Agent | undefined, fallback?: string): string {
  return agent?.session.header.cwd ?? fallback ?? process.cwd()
}
