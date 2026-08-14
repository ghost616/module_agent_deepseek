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
