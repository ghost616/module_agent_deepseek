/**
 * 「回退并重发」的纯逻辑面（无 React/服务依赖，便于独立单测）。
 *
 * 职责分两层：
 * 1. {@link scanRewindTarget}：在会话事件窗口中定位「最后一条用户消息」与
 *    「其前最近已完成回合的 turn/end」，产出 fork 锚点 atSeq 与该用户消息文本
 *    （用于回填 composer 草稿）。事件子集对齐 dsh 会话日志事件形态（type/seq/data）。
 * 2. {@link rewindLastRound}：把上述扫描与 fork/切分支/回填编排为一个可注入服务的操作。
 *
 * fork 边界语义对齐后端 packages/api/session-controller/src/commands.ts 的 fork：
 * boundary = 事件序列中第一个 seq >= atSeq 的 turn/end；前缀由此截断——取
 * 「最后一条 user/message 之前最近一个 turn/end」的 seq 作为 atSeq，使新分支前缀
 * 止于上一已完成回合终点，从而把最后一条用户消息及其后全部作废。
 */

/** 本模块关注的事件形态（会话事件窗口 event 臂的结构子集）。 */
export interface DurableEventLike {
  readonly type: string
  readonly seq: number
  readonly data?: { readonly content?: unknown; readonly source?: { readonly kind?: unknown } }
}

/**
 * 宿主 SessionEventLikeEntry（session-controller contract/events.ts）的结构子集：
 * 判别字段为 type（type:'event'|'chunks'，event 必选），而非 kind。
 * event 臂携带完整会话事件；chunks 臂为历史压缩行（不含本模块关心的事件，仅承载 type 判别）。
 */
export type EventWindowEntryLike =
  | { readonly type: 'event'; readonly event: DurableEventLike }
  | { readonly type: 'chunks'; readonly event: unknown }

/** 回退不可执行的原因。 */
export type RewindBlockReason =
  /** 窗口内没有来自用户的 user/message。 */
  | 'no-user-message'
  /** 最后一条用户消息之前没有已完成的回合（无更早回合可回退）。 */
  | 'no-completed-turn'
  /** 最后一条用户消息不含可回填的文本。 */
  | 'no-text'

/** 扫描结果：可回退时给出 fork 锚点与回填文本，否则给出阻塞原因。 */
export type RewindTarget =
  | { readonly ok: true; readonly userSeq: number; readonly userText: string; readonly atSeq: number }
  | { readonly ok: false; readonly reason: RewindBlockReason }

/** 会话事件窗口扫描输入：绑定 eventSource 快照的 entries。 */
export type RewindEventWindow = readonly EventWindowEntryLike[]

/** 从消息 content 块数组中抽取纯文本（text 块按序拼接）。 */
function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { readonly type?: unknown; readonly text?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') text += candidate.text
  }
  return text
}

/** 是否为用户真实发送的 user/message（source.kind==='user'，排除 plugin/compact 等注入）。 */
function isUserMessage(event: DurableEventLike): boolean {
  return event.type === 'user/message' && event.data?.source?.kind === 'user'
}

/**
 * 扫描定位回退目标。
 * @param window - 会话事件窗口条目（type 判别，时间正序；尾部恒为活事件，含最近用户消息）。
 * @returns 可回退时返回最后用户消息 seq/文本及 atSeq（其前最近 turn/end 的 seq）。
 */
export function scanRewindTarget(window: RewindEventWindow): RewindTarget {
  let userIndex = -1
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const entry = window[index]
    if (entry?.type !== 'event') continue
    if (entry.event !== undefined && isUserMessage(entry.event)) {
      userIndex = index
      break
    }
  }
  if (userIndex === -1) return { ok: false, reason: 'no-user-message' }
  const entry = window[userIndex]
  const user = entry?.type === 'event' ? entry.event : undefined
  if (user === undefined) return { ok: false, reason: 'no-user-message' }
  const userText = textOfContent(user.data?.content)
  let atSeq: number | undefined
  for (let index = userIndex - 1; index >= 0; index -= 1) {
    const candidate = window[index]
    if (candidate?.type !== 'event') continue
    if (candidate.event?.type === 'turn/end') {
      atSeq = candidate.event.seq
      break
    }
  }
  if (atSeq === undefined) return { ok: false, reason: 'no-completed-turn' }
  if (userText === '') return { ok: false, reason: 'no-text' }
  return { ok: true, userSeq: user.seq, userText, atSeq }
}

/** 目标会话（fork 新分支）的 composer 草稿写入面；会话服务可解析时提供。 */
export interface RewindDraftFace {
  setDraft(text: string): void
}

/** 回退操作依赖的服务面（由调用方按 dsh client 服务接线，便于单测替换）。 */
export interface RewindServiceFace {
  /** 读取当前会话事件窗口（绑定 eventSource 快照的 entries）。 */
  eventsOf(): RewindEventWindow
  /** 在 atSeq 处 fork 出新分支（increaseTitle 语义由调用方决定）。 */
  fork(atSeq: number): Promise<string>
  /** 解析 fork 新分支的 composer 草稿写入面；能力不可达时返回 undefined。 */
  draftOf(childId: string): RewindDraftFace | undefined
  /** 切到新分支会话。 */
  open(childId: string): void
}

/** 回退操作结果。 */
export type RewindOutcome =
  | {
    ok: true
    childId: string
    userText: string
    /** 是否成功把最后用户消息文本回填到新分支 composer 草稿。 */
    backfilled: boolean
  }
  | { ok: false; reason: RewindBlockReason | 'fork-failed'; detail?: string }

/**
 * 执行一次「回退并重发」：扫描定位 → fork → （尽力）回填草稿 → 切到新分支。
 * 草稿回填能力缺失（conversation 服务不可达等）不阻断回退，以 backfilled=false 上报。
 * @param face - 会话/草稿服务面。
 * @returns 回退结果。
 */
export async function rewindLastRound(face: RewindServiceFace): Promise<RewindOutcome> {
  const scan = scanRewindTarget(face.eventsOf())
  if (!scan.ok) return { ok: false, reason: scan.reason }
  let childId: string
  try {
    childId = await face.fork(scan.atSeq)
  } catch (error) {
    return {
      ok: false,
      reason: 'fork-failed',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  let backfilled = false
  const draft = face.draftOf(childId)
  if (draft !== undefined) {
    try {
      draft.setDraft(scan.userText)
      backfilled = true
    } catch (error) {
      // 回填失败不阻断回退，交由调用方 loud 记录（草稿缺失属能力缺口，非流程错误）。
      console.warn('[module-agent-client] rewind draft backfill failed:', error)
    }
  }
  face.open(childId)
  return { ok: true, childId, userText: scan.userText, backfilled }
}
