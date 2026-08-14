import { join, dirname } from 'node:path'
import type { FileEntry } from './types.ts'
import {
  moduleAgentDir,
  MODULE_DEFINITION_FILE,
} from './constants.ts'
import { exists, readJson, writeText } from './fs.ts'
import { readModuleTree } from './module_tree.ts'

function definitionPath(directory: string, moduleName: string): string {
  return join(moduleAgentDir(directory, moduleName), MODULE_DEFINITION_FILE)
}

export function emptyModuleDef(moduleName: string) {
  return {
    module_name: moduleName,
    files: [] as FileEntry[],
  }
}

export async function readModuleDefinition(directory: string, moduleName: string): Promise<{ module_name: string; files: FileEntry[] }> {
  const path = definitionPath(directory, moduleName)
  if (!(await exists(path))) {
    return emptyModuleDef('')
  }
  try {
    return await readJson(path)
  } catch {
    return emptyModuleDef('')
  }
}

export async function writeModuleDefinition(
  directory: string,
  moduleName: string,
  def: { module_name: string; files: FileEntry[] },
): Promise<void> {
  const path = definitionPath(directory, moduleName)
  await writeText(path, JSON.stringify(def, null, 2))
}

export interface ModifyDefinitionArgs {
  files_to_add?: FileEntry[]
  files_to_remove?: string[]
  files_to_update?: FileEntry[]
}

export async function modifyDefinition(
  directory: string,
  moduleName: string,
  args: ModifyDefinitionArgs,
): Promise<void> {
  const current = await readModuleDefinition(directory, moduleName)
  let files = current.files || []

  if (args.files_to_remove) {
    const removeSet = new Set(args.files_to_remove)
    files = files.filter((f: FileEntry) => !removeSet.has(f.path))
  }

  if (args.files_to_add) {
    const existing = new Set(files.map((f: FileEntry) => f.path))
    for (const entry of args.files_to_add) {
      if (!existing.has(entry.path)) {
        files.push(entry)
      }
    }
  }

  if (args.files_to_update) {
    const updateMap = new Map(args.files_to_update.map((e: FileEntry) => [e.path, e.description]))
    files = files.map((f: FileEntry) => {
      if (updateMap.has(f.path)) {
        return { path: f.path, description: updateMap.get(f.path)! }
      }
      return f
    })
  }

  await writeModuleDefinition(directory, moduleName, {
    module_name: moduleName,
    files,
  })
}

/**
 * 获取模块所有文件所在的父目录列表（去重）
 */
export async function getModuleParentDirs(directory: string, moduleName: string): Promise<string[]> {
  const def = await readModuleDefinition(directory, moduleName)
  const dirs = new Set<string>()
  for (const f of def.files) {
    const d = dirname(f.path)
    if (d !== '.') dirs.add(d)
  }
  return [...dirs]
}

/**
 * 查找哪些模块的 module_definition 包含指定文件路径
 */
export async function findModulesByFilePath(directory: string, filePath: string): Promise<string[]> {
  const tree = await readModuleTree(directory)
  const result: string[] = []
  for (const m of tree.modules) {
    const def = await readModuleDefinition(directory, m.name)
    if (def.files.some((f) => f.path === filePath)) {
      result.push(m.name)
    }
  }
  return result
}

/**
 * 删除指定模块 module_definition 中匹配 paths 的文件条目
 */
export async function removeFilesFromModule(directory: string, moduleName: string, paths: string[]): Promise<void> {
  const removeSet = new Set(paths)
  const current = await readModuleDefinition(directory, moduleName)
  const remaining = current.files.filter((f) => !removeSet.has(f.path))
  await writeModuleDefinition(directory, moduleName, {
    module_name: moduleName,
    files: remaining,
  })
}
