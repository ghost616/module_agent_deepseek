import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { moduleAgentDir } from './constants.ts'
import { exists, readText, readJson, writeText } from './fs.ts'

const BACKUPS_DIR = 'backups'
const MAPPING_FILE = 'mapping.json'
const MAX_BACKUPS = 10

function backupsRoot(directory: string, moduleName: string): string {
  return join(moduleAgentDir(directory, moduleName), BACKUPS_DIR)
}

function mappingPath(directory: string, moduleName: string): string {
  return join(backupsRoot(directory, moduleName), MAPPING_FILE)
}

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

async function readMapping(directory: string, moduleName: string): Promise<Record<string, string>> {
  const path = mappingPath(directory, moduleName)
  if (await exists(path)) {
    try {
      return await readJson<Record<string, string>>(path)
    } catch {
      return {}
    }
  }
  return {}
}

async function writeMapping(directory: string, moduleName: string, mapping: Record<string, string>): Promise<void> {
  const root = backupsRoot(directory, moduleName)
  await mkdir(root, { recursive: true })
  const path = mappingPath(directory, moduleName)
  const tmpPath = `${path}.tmp`
  await writeText(tmpPath, JSON.stringify(mapping, null, 2))
  await rename(tmpPath, path)
}

export async function backupFile(directory: string, moduleName: string, filePath: string): Promise<{ success: boolean; message: string }> {
  const absFilePath = join(directory, filePath)
  if (!(await exists(absFilePath))) {
    return { success: false, message: `文件不存在: ${filePath}` }
  }

  const content = await readText(absFilePath)
  const hash = md5(filePath)

  const mapping = await readMapping(directory, moduleName)
  if (!mapping[filePath]) {
    mapping[filePath] = hash
    await writeMapping(directory, moduleName, mapping)
  }

  const backupDir = join(backupsRoot(directory, moduleName), hash)
  await mkdir(backupDir, { recursive: true })

  const timestamp = Date.now().toString()
  await writeText(join(backupDir, `${timestamp}.bak`), content)

  const files = (await readdir(backupDir)).filter(f => f.endsWith('.bak')).sort()
  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS)
    for (const f of toDelete) {
      await unlink(join(backupDir, f))
    }
  }

  return { success: true, message: `已备份 ${filePath}（当前备份数: ${Math.min(files.length, MAX_BACKUPS)}）` }
}

export async function listBackups(directory: string, moduleName: string, filePath: string): Promise<{ success: boolean; files?: string[]; message: string }> {
  const mapping = await readMapping(directory, moduleName)
  const hash = mapping[filePath]
  if (!hash) {
    return { success: true, files: [], message: `该文件无备份: ${filePath}` }
  }

  const backupDir = join(backupsRoot(directory, moduleName), hash)
  if (!(await exists(backupDir))) {
    return { success: true, files: [], message: `备份目录不存在: ${filePath}` }
  }

  const files = (await readdir(backupDir)).filter(f => f.endsWith('.bak')).sort()
  return { success: true, files, message: `找到 ${files.length} 个备份文件` }
}

export async function readBackupContent(
  directory: string,
  moduleName: string,
  filePath: string,
  backupFileName: string,
  startLine: number,
  endLine?: number,
): Promise<{ success: boolean; content?: string; message: string }> {
  const mapping = await readMapping(directory, moduleName)
  const hash = mapping[filePath]
  if (!hash) {
    return { success: false, message: `该文件无备份: ${filePath}` }
  }

  const backupDir = join(backupsRoot(directory, moduleName), hash)
  if (!(await exists(backupDir))) {
    return { success: false, message: `备份目录不存在: ${filePath}` }
  }

  const backupPath = join(backupDir, backupFileName)
  if (!(await exists(backupPath))) {
    return { success: false, message: `备份文件不存在: ${backupFileName}` }
  }

  const fullContent = await readText(backupPath)
  const lines = fullContent.split('\n')
  const suffix = endLine !== undefined ? lines.slice(startLine, endLine + 1) : lines.slice(startLine)

  return { success: true, content: suffix.join('\n'), message: `读取 ${backupFileName} 行 ${startLine}-${endLine ?? '末尾'}` }
}

export async function readLatestBackup(directory: string, moduleName: string, filePath: string): Promise<{ success: boolean; content?: string; message: string }> {
  const mapping = await readMapping(directory, moduleName)
  const hash = mapping[filePath]
  if (!hash) {
    return { success: false, message: `该文件无备份: ${filePath}` }
  }

  const backupDir = join(backupsRoot(directory, moduleName), hash)
  if (!(await exists(backupDir))) {
    return { success: false, message: `备份目录不存在: ${filePath}` }
  }

  const files = (await readdir(backupDir)).filter(f => f.endsWith('.bak')).sort()
  if (files.length === 0) {
    return { success: false, message: `该文件无备份记录: ${filePath}` }
  }

  const latestFile = files[files.length - 1]
  if (latestFile === undefined) {
    return { success: false, message: `该文件无备份记录: ${filePath}` }
  }
  const content = await readText(join(backupDir, latestFile))

  return { success: true, content, message: `读取 ${filePath} 最新备份（${latestFile}）` }
}
