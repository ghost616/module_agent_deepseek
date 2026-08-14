import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { ModuleTree, ModuleEntry } from './types.ts'
import { MODULE_TREE_FILE } from './constants.ts'
import { exists, readText, writeText } from './fs.ts'

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

export async function findModule(
  directory: string,
  name: string,
): Promise<ModuleEntry | undefined> {
  const tree = await readModuleTree(directory)
  return tree.modules.find((m) => m.name === name)
}

export async function addModule(
  directory: string,
  entry: ModuleEntry,
): Promise<void> {
  const tree = await readModuleTree(directory)
  tree.modules.push(entry)
  await writeModuleTree(directory, tree)
}

export async function removeModule(
  directory: string,
  name: string,
): Promise<void> {
  const tree = await readModuleTree(directory)
  tree.modules = tree.modules.filter((m) => m.name !== name)
  await writeModuleTree(directory, tree)
}
