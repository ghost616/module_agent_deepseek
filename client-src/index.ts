/**
 * dsh client 面（P1b + P1c）：在 composer 工具栏右侧注册「回退并重发」图标工具按钮
 * （conversation.input.right），观感对齐 ui-conversation 输入工具项。P1c 把按钮
 * onClick 接入 rewind 逻辑：解析当前会话事件定位「最后一条用户消息 + 其前最近已完成
 * 回合 turn/end」，fork 出新分支（前缀止于上一已完成回合、把最后一条用户消息及其后
 * 作废）、切到新分支并把该用户消息文本回填新分支 composer 草稿。本文件由
 * scripts/build-client.mjs 用 esbuild 打包为 __ModuleLoader__.load 合规单文件
 * client.js。react 与 @deepseek-ai/dsh-client-ui-primitives（PLATFORM_MODULE）由
 * 运行时 external require 提供；slots/sessions 为注入的 client cordis 服务
 * （ui-renderer / session-controller 提供），conversation 服务经会话 scope ctx
 * 惰性解析（queue dock 同款模式），无需 package.json dsh.client.inject/external。
 */
import {
  IconBranchOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement } from 'react'
import {
  rewindLastRound,
} from './rewind.ts'
import type {
  EventWindowEntryLike, RewindBlockReason, RewindDraftFace, RewindOutcome, RewindServiceFace,
} from './rewind.ts'

/** dsh client cordis slots 服务最小可写面（运行时由 ui-renderer 提供，客户端不做宿主类型检查）。 */
interface SlotsLike {
  inject: (key: string, callback: () => unknown) => unknown
  register: (options: Record<string, unknown>, component: unknown) => unknown
}

/** 会话绑定的事件源快照（eventSource.getSnapshot().entries 提供窗口条目）。 */
interface SessionBindingLike {
  eventSource?: { getSnapshot(): { entries: readonly EventWindowEntryLike[] } }
}

/** dsh client sessions 服务（@deepseek-ai/dsh-api-session-controller/client）最小可写面。 */
interface SessionsLike {
  binding(sessionId: string): SessionBindingLike | undefined
  fork(options: { sessionId: string; atSeq: number; increaseTitle: boolean }): Promise<string>
  scope(sessionId: string): { get<T = unknown>(name: string): T | undefined } | undefined
  open(sessionId: string): void
}

/** 会话 scope 上 conversation 服务的最小可写面（queue dock 同款 `.input.for(actx)`）。 */
interface ConversationLike {
  input?: {
    for?(actx: { get<T = unknown>(name: string): T | undefined }): {
      setDraft(text: string): void
      notify(level: 'info' | 'error', text: string): void
    }
  }
}

/** 本 client 插件 apply 上下文。 */
interface ClientContext {
  slots?: SlotsLike
  sessions?: SessionsLike
}

export const name = 'module-agent-client'

/** 所需 client cordis 服务：slots（按钮槽）、sessions（fork/切分支/读事件/会话 scope）。 */
export const inject = ['slots', 'sessions']

/** 本按钮自有样式 data-plugin-css 键（document 级去重）。 */
const STYLE_TAG_ID = '@deepseek-ai/dsh-module-agent/composer-retry'

/** 按钮不可回退提示与可读反馈的文案。 */
const BLOCK_COPY: Readonly<Record<RewindBlockReason, string>> = {
  'no-user-message': '当前会话没有可回退的用户消息',
  'no-completed-turn': '没有更早的已完成回合可回退',
  'no-text': '最后一条用户消息没有可回填的文本，未执行回退',
}

/**
 * 图标工具按钮样式：对齐 composer 输入工具项的视觉基线——28px 透明圆角图标按钮、
 * hover 用交互 hover-solid token、active 用交互 active token、focus-visible 用
 * PermissionSelect 同款 2px l3 焦点环；图标按 chat 图标操作基线缩至 15px。
 */
const RETRY_STYLE = `
[data-module-agent-retry] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
[data-module-agent-retry]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-secondary);
}
[data-module-agent-retry]:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}
[data-module-agent-retry]:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
[data-module-agent-retry] svg {
  width: 15px;
  height: 15px;
}
`

/** 注入本 client 自有样式（对齐 dsh client css 注入范式，仅注入一次）。 */
function ensureRetryStyle(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@deepseek-ai/dsh-module-agent'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = RETRY_STYLE
  document.head.appendChild(tag)
}

/** composer 右侧（conversation.input.right）图标工具按钮项：观感对齐输入工具项，onClick 执行回退并重发。 */
function ModuleAgentComposerButton(props: { onRewind: () => void }): ReturnType<typeof createElement> {
  return createElement(
    Tooltip,
    { label: '回退并重发', side: 'top', delayMs: 500 },
    createElement(
      'button',
      {
        type: 'button',
        'data-module-agent-retry': true,
        'aria-label': '回退并重发',
        title: '撤销最近一轮（作废最后一条消息及其回复），并回填该消息以便重新发送',
        onClick: props.onRewind,
      },
      createElement(IconBranchOutline16),
    ),
  )
}

/**
 * 组装「回退并重发」的会话服务面（rewindLastRound 依赖）。
 * @param ctx - client 根上下文。
 * @param sessionId - 当前（被回退的）会话。
 * @returns 服务面。
 */
function rewindServiceFace(ctx: ClientContext, sessionId: string): RewindServiceFace {
  const sessions = ctx.sessions
  if (sessions === undefined) throw new Error('[module-agent-client] sessions service unavailable')
  return {
    eventsOf() {
      return sessions.binding(sessionId)?.eventSource?.getSnapshot().entries ?? []
    },
    fork(atSeq) {
      return sessions.fork({ sessionId, atSeq, increaseTitle: true })
    },
    draftOf(childId) {
      const scope = sessions.scope(childId)
      if (scope === undefined) return undefined
      const conversation = scope.get<ConversationLike>('conversation')
      const resolver = conversation?.input
      if (resolver === undefined || resolver.for === undefined) return undefined
      const draft: RewindDraftFace = {
        setDraft(text) {
          resolver.for(scope).setDraft(text)
        },
      }
      return draft
    },
    open(childId) {
      sessions.open(childId)
    },
  }
}

/**
 * 把回退结果落到可读反馈（失败/阻塞经当前会话 composer 通知 + console；成功 console）。
 * @param ctx - client 根上下文。
 * @param sessionId - 当前会话（提示落点）。
 * @param outcome - 回退结果。
 */
function reportRewind(ctx: ClientContext, sessionId: string, outcome: RewindOutcome): void {
  if (outcome.ok) {
    if (!outcome.backfilled) {
      // fork + 切分支成功但草稿回填能力不可达：loud 记录能力缺口（约束 2 允许的最小偏差）。
      console.warn(
        '[module-agent-client] 回退并重发：已 fork 至新分支',
        outcome.childId,
        '，但 composer 草稿回填不可用（conversation 服务不可达），请手动粘贴/重发。',
      )
    }
    console.info(
      `[module-agent-client] 回退并重发：fork 至新会话 ${outcome.childId}`
      + `，回填最后用户消息（${outcome.backfilled ? '已回填' : '未回填'}）`,
    )
    return
  }
  const text = outcome.reason === 'fork-failed'
    ? `回退失败：${outcome.detail ?? 'fork 不可用'}`
    : BLOCK_COPY[outcome.reason]
  console.warn(`[module-agent-client] ${text}`)
  const sessions = ctx.sessions
  if (sessions === undefined) return
  const scope = sessions.scope(sessionId)
  if (scope === undefined) return
  try {
    const conversation = scope.get<ConversationLike>('conversation')
    conversation?.input?.for?.(scope).notify('error', text)
  } catch (error) {
    // 可见提示失败只影响反馈呈现，不改变回退结果本身。
    console.warn('[module-agent-client] failed to surface rewind feedback:', error)
  }
}

/**
 * 注册 composer 按钮项：会话注入面为每次会话生成一次 bound onRewind（含并发护栏）。
 * @param ctx - client 根上下文（含 slots/sessions 服务）。
 */
export function apply(ctx: ClientContext): void {
  const slots = ctx.slots
  if (slots === undefined) throw new Error('[module-agent-client] slots service unavailable')
  ensureRetryStyle()
  slots.inject('conversation.input.right', () => slots.register(
    {
      name: 'conversation.input.right',
      id: 'module-agent-retry',
      order: 0,
      inject: (sessionId: string) => {
        const sessions = ctx.sessions
        if (sessions === undefined) throw new Error('[module-agent-client] sessions service unavailable')
        let inFlight = false
        const face = rewindServiceFace(ctx, sessionId)
        return {
          sessionId,
          onRewind: () => {
            if (inFlight) return
            inFlight = true
            void rewindLastRound(face).then(
              (outcome) => { reportRewind(ctx, sessionId, outcome) },
              (error: unknown) => {
                // rewindLastRound 全路径不抛；防御性兜底并发散（如服务面异常）。
                reportRewind(ctx, sessionId, {
                  ok: false,
                  reason: 'fork-failed',
                  detail: error instanceof Error ? error.message : String(error),
                })
              },
            ).finally(() => { inFlight = false })
          },
        }
      },
    },
    ModuleAgentComposerButton,
  ))
}
