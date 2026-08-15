import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { ModuleTree, ModuleEntry } from './types.ts'
import { MODULE_TREE_FILE } from './constants.ts'
import { exists, readText, writeText, existsSync, readJsonSync, writeJsonSync } from './fs.ts'

function treePath(directory: string): string {
  return join(directory, MODULE_TREE_FILE)
}

export async function readModuleTree(directory: string): Promise<ModuleTree> {
  const path = treePath(directory)
  if (!(await exists(path))) {
    return { modules: [] }
  }
  try {
    const text = await readText(path)
    if (!text.trim()) {
      return { modules: [] }
    }
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray((parsed as { modules?: unknown }).modules)) {
      return { modules: [] }
    }
    return parsed as ModuleTree
  } catch {
    return { modules: [] }
  }
}

export async function writeModuleTree(
  directory: string,
  tree: ModuleTree,
): Promise<void> {
  const path = treePath(directory)
  await mkdir(dirname(path), { recursive: true })
  const content = JSON.stringify(tree, null, 2)
  await writeText(path, content)
}

/**
 * 同步读取 module_tree.json，用于同步 read-modify-write 避免并发竞态。
 * 容错行为与 readModuleTree 一致：文件缺失/空/非法 JSON 返回空树。
 */
export function readModuleTreeSync(directory: string): ModuleTree {
  const path = treePath(directory)
  if (!existsSync(path)) {
    return { modules: [] }
  }
  try {
    const parsed = readJsonSync<unknown>(path)
    if (!parsed || !Array.isArray((parsed as { modules?: unknown }).modules)) {
      return { modules: [] }
    }
    return parsed as ModuleTree
  } catch {
    return { modules: [] }
  }
}

/**
 * 同步写 module_tree.json（2 空格缩进）。与 readModuleTreeSync 配套用于同步读改写。
 */
export function writeModuleTreeSync(directory: string, tree: ModuleTree): void {
  const path = treePath(directory)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonSync(path, tree)
}

export async function findModule(
  directory: string,
  name: string,
): Promise<ModuleEntry | undefined> {
  const tree = await readModuleTree(directory)
  return tree.modules.find((m) => m.name === name)
}

export function addModule(
  directory: string,
  entry: ModuleEntry,
): void {
  const tree = readModuleTreeSync(directory)
  tree.modules.push(entry)
  writeModuleTreeSync(directory, tree)
}

export function removeModule(
  directory: string,
  name: string,
): void {
  const tree = readModuleTreeSync(directory)
  tree.modules = tree.modules.filter((m) => m.name !== name)
  writeModuleTreeSync(directory, tree)
}
