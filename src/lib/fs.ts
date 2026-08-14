import { accessSync, readFileSync } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8'))
}

export async function writeText(path: string, content: string): Promise<void> {
  await writeFile(path, content)
}

/**
 * 同步判断路径是否存在。systemPrompt.section 的 text provider 是同步的，
 * 需要同步读取配置，仅在提示词注入路径使用。
 */
export function existsSync(path: string): boolean {
  try {
    accessSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * 同步读取 JSON 文件。用于 systemPrompt.section 的同步 text provider；
 * 解析失败抛错，由调用方决定兜底。
 */
export function readJsonSync<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * 将 sessionId 等不透明 id 编码为安全的文件名字段：经 encodeURIComponent
 * 保留 [A-Za-z0-9-_.!~*'()] 原样，其余字符（/ \ : 等）转 %XX，防止路径穿越。
 * 正常 sessionId（ses_xxx / session-N / UUID）不含特殊字符，结果与原值相同；
 * 与 desanitizeIdSegment 互为逆运算，保证写/读/删与 cleanStale 反推一致。
 */
export function sanitizeIdSegment(value: string): string {
  return encodeURIComponent(value)
}

/**
 * 将 sanitizeIdSegment 编码的文件名段还原为原始 id。对含非法 % 转义序列的
 * 文件名（非本函数产物）decodeURIComponent 抛错，此时原样返回避免中断清理。
 */
export function desanitizeIdSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
