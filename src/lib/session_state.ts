import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the `subagent/start` event augmentation into the program.
import type {} from '@deepseek-ai/dsh-subagent'

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
 * 事件自动分类。
 */
export class SessionState {
  private readonly modes = new Map<string, AgentMode>()
  private readonly idleNotified = new Map<string, boolean>()

  getAgentMode(sessionId: string): AgentMode | undefined {
    return this.modes.get(sessionId)
  }

  setAgentMode(sessionId: string, mode: AgentMode): void {
    this.modes.set(sessionId, mode)
  }

  clearAgentMode(sessionId: string): void {
    this.modes.delete(sessionId)
    this.idleNotified.delete(sessionId)
  }

  /** 根据 provider 名自动分类并注册，未命中返回 undefined。 */
  classifyProvider(sessionId: SessionId, provider: string): AgentMode | undefined {
    const mode = modeFromProvider(provider)
    if (mode !== undefined) this.modes.set(sessionId, mode)
    return mode
  }

  /** 完成通知去重：agent 转为 running 时复位。 */
  resetIdleNotified(sessionId: string): void {
    this.idleNotified.set(sessionId, false)
  }

  wasIdleNotified(sessionId: string): boolean {
    return this.idleNotified.get(sessionId) ?? false
  }

  markIdleNotified(sessionId: string): void {
    this.idleNotified.set(sessionId, true)
  }
}

export function createSessionState(): SessionState {
  return new SessionState()
}

/**
 * 将 SessionState 绑定到 dsh 生命周期：subagent/start 自动分类，
 * agent/disposed 清理注册。返回 effect disposer 交由调用方挂载。
 */
export function registerSessionState(ctx: Context, state: SessionState): () => Promise<void> {
  return ctx.effect(function* () {
    yield ctx.on('subagent/start', (info) => {
      state.classifyProvider(info.id, info.provider)
    })
    yield ctx.on('agent/disposed', ({ agent }) => {
      state.clearAgentMode(agent.id)
    })
  }, 'module-agent.sessionState()')
}

/** 从 agent 的会话 cwd 解析项目根目录，缺省回退配置目录。 */
export function directoryOfAgent(agent: Agent | undefined, fallback?: string): string {
  return agent?.session.header.cwd ?? fallback ?? process.cwd()
}
