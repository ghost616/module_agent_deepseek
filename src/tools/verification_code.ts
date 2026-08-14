import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { jsonToolOutput } from '../lib/tool_output.ts'

const latestCodes = new Map<string, string>()
const planConfirmationMap = new Map<string, string>()

export const CODE_CONSUMED_NOTICE = '确认码已作废，请重新生成'

export function generateId(idType: string): string {
  return `${idType}_${randomUUID()}`
}

export function getLatestCode(sessionId: string): string | undefined {
  return latestCodes.get(sessionId)
}

export function clearLatestCode(sessionId: string): void {
  latestCodes.delete(sessionId)
}

export function storePlanConfirmation(planId: string, code: string): void {
  planConfirmationMap.set(planId, code)
}

export function getPlanConfirmation(planId: string): string | undefined {
  return planConfirmationMap.get(planId)
}

export function consumePlanConfirmation(planId: string): void {
  planConfirmationMap.delete(planId)
}

export function checkConfirmationCode(code: string | undefined, sessionId: string): boolean {
  const latest = latestCodes.get(sessionId)
  return code !== undefined && latest !== undefined && code === latest
}

/** 校验并消费确认码，不匹配返回结构化错误值（供计划确认工具复用），匹配则置 null。 */
export function validateConfirmationCode(
  code: string | undefined,
  sessionId: string,
): { status: 'error'; error: string } | null {
  const latest = latestCodes.get(sessionId)
  if (!code || !latest || code !== latest) {
    return {
      status: 'error',
      error: '确认码不匹配或已过期，请重新通过 verification_code 工具获取确认码并让用户确认后再试。',
    }
  }
  latestCodes.delete(sessionId)
  return null
}

export const verificationCode = defineTool({
  name: 'verification_code',
  description: '生成验证随机码，并在当前会话保存最新生成的验证随机码',
  parameters: {
    length: {
      type: 'integer',
      description: '验证码长度，默认 10',
    },
    type: {
      type: 'string',
      enum: ['numeric', 'alphanumeric'],
      description: '验证码类型，默认 alphanumeric',
    },
  },
  output: jsonToolOutput(),
  async execute(args, exec) {
    const sessionId = exec.agent?.id ?? ''
    const length = args.length ?? 10
    const type = args.type ?? 'alphanumeric'
    const chars = type === 'numeric'
      ? '0123456789'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    let code = ''
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)] ?? ''
    }

    latestCodes.set(sessionId, code)

    return { status: 'ok', message: `验证码: ${code}（确认码是一次性的，使用后请重新生成）` }
  },
})
