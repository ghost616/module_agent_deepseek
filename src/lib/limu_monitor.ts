const lastActivity = new Map<string, number>()

/** 记录会话最近一次活动时间（工具调用/文本生成/收到任务时刷新）。 */
export function recordActivity(sessionId: string): void {
  lastActivity.set(sessionId, Date.now())
}

export function getLastActivity(sessionId: string): number | undefined {
  return lastActivity.get(sessionId)
}

/** 会话是否处于"活跃"状态（曾在本次进程生命周期内收到过任务或活动）。 */
export function isWorking(sessionId: string): boolean {
  return lastActivity.has(sessionId)
}

export function clearActivity(sessionId: string): void {
  lastActivity.delete(sessionId)
}

export interface SessionIdleInfo {
  lastActivity: number | null
  idleSeconds: number | null
  unresponsive: boolean
}

/** 无 AI 响应判定的超时阈值（5 分钟）。 */
const IDLE_TIMEOUT_MS = 300000

export function getSessionIdle(sessionId: string): SessionIdleInfo {
  const activity = lastActivity.get(sessionId) ?? null
  const idleSeconds = activity ? Math.floor((Date.now() - activity) / 1000) : null
  const unresponsive = idleSeconds === null || idleSeconds > Math.floor(IDLE_TIMEOUT_MS / 1000)
  return { lastActivity: activity, idleSeconds, unresponsive }
}
