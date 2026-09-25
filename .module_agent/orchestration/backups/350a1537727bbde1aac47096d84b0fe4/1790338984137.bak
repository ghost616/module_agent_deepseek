import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ContinuableStart, SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the subagent service augmentation into the program.
import type {} from '@deepseek-ai/dsh-subagent'

export interface StartChildOptions {
  /** 子智能体 persona（替代 opencode 的 session.promptAsync system 参数）。 */
  readonly persona?: string
  /** 子智能体模型路由（provider + model）。 */
  readonly agentOptions?: AgentOptions
  /** 子智能体工具范围限制：deny 的工具从子代理 prompt 中消失并拒绝执行。 */
  readonly toolFilter?: ToolRestriction
}

/**
 * 子智能体运行时抽象：封装 dsh 的 ctx.subagents（startContinuable / 宿主 queue
 * 投递（queueHostSubagentPrompt，见 {@link SubagentHost.followup}）/ listChildren）、
 * ctx.sessions 存活判定与 ctx.agents 停止操作，
 * 替代 opencode 的 client.session.create / promptAsync / get / delete。
 */
export class SubagentHost {
  constructor(
    private readonly ctx: Context,
    private readonly subagentProvider: string,
  ) {}

  /**
   * 建立并启动一个可续用的子智能体会话（启动者为其直接父 agent）。
   * 返回的 childId 即会话 id，与启动者绑定，可通过 followup 续用。
   */
  async startChild(
    parent: Agent,
    label: string,
    prompt: string,
    options: StartChildOptions,
    signal: AbortSignal,
  ): Promise<ContinuableStart> {
    return this.ctx.subagents.startContinuable({
      provider: this.subagentProvider,
      label,
      request: {
        prompt: [{ type: 'text', text: prompt }],
        parent,
        ...(options.persona !== undefined ? { persona: options.persona } : {}),
        ...(options.agentOptions !== undefined ? { agentOptions: options.agentOptions } : {}),
        ...(options.toolFilter !== undefined ? { toolFilter: options.toolFilter } : {}),
      },
      signal,
    })
  }

  /**
   * 向直接续用子会话投递一条 host 消息，作为其下一轮 FIFO 任务；
   * 空闲（含已持久化冷却）子会话冷恢复后执行。
   * 迁移依据：dsh 0.1.2-alpha.5 已移除 ctx.subagents.followup，宿主投递收归
   * SubagentRuntime 私有 deliverSubagentPrompt symbol（底层 steerPrompt/queuePrompt）；
   * 公开 ctx.subagents.sendMessage 仅限相邻 Agent 的 model-authored steer，且无自定义
   * source（会按父 agent 转发包裹并注入当前 step），不满足 coordinator queue-to-idle
   * 语义，故经 @deepseek-ai/dsh-subagent/internal 的 queueHostSubagentPrompt 以 queue
   * 模式投递；source 沿用父 agent relay 形态（旧 kind:coordinator 的等价表达）。
   */
  async followup(parent: Agent, childId: string, text: string, signal: AbortSignal): Promise<void> {
    await queueHostSubagentPrompt(
      this.ctx.subagents,
      parent,
      SessionId(childId),
      [{ type: 'text', text }],
      { kind: 'agent-message', form: 'relay', senderSessionId: parent.id },
      signal,
    )
  }

  /** 枚举父会话的直接子智能体（含已持久化冷却会话，替代 client.session.get 复用探测）。 */
  listChildren(parentId: string): Promise<SubagentListEntry[]> {
    return this.ctx.subagents.listChildren(SessionId(parentId))
  }

  /** childId 是否为 parentId 的直接子智能体（存活或已持久化均可恢复）。 */
  async childAlive(childId: string, parentId: string): Promise<boolean> {
    const entries = await this.ctx.subagents.listChildren(SessionId(parentId))
    return entries.some(entry => entry.kind === 'child' && entry.id === childId)
  }

  /** 会话是否存活：内存活跃会话或已持久化可冷恢复的会话。 */
  async isAlive(sessionId: string): Promise<boolean> {
    const id = SessionId(sessionId)
    if (this.ctx.sessions.get(id) !== undefined) return true
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return false
    try {
      // stat 对不存在的会话返回 undefined，不抛错；异常视为判定失败。
      return (await persistence.stat(id)) !== undefined
    } catch {
      return false
    }
  }

  /** 取当前进程内活跃的 agent（冷恢复的会话返回 undefined）。 */
  agent(sessionId: string): Agent | undefined {
    return this.ctx.agents.get(SessionId(sessionId))
  }

  /** 停止子智能体当前工作并等待其安静（进程内尽力而为；数据清理由调用方完成）。 */
  async stop(childId: string): Promise<void> {
    const agent = this.ctx.agents.get(SessionId(childId))
    if (agent === undefined) return
    agent.cancel({ kind: 'parent' })
    await agent.whenIdle()
  }
}
