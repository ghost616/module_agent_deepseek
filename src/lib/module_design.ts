import { join } from 'node:path'
import { MODULE_AGENT_DIR, MODULE_DESIGN_FILE } from './constants.ts'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

export interface ModuleDesignEntry {
  name: string
  description?: string
  responsibilities?: string[]
  dependencies?: string[]
  functions?: { name: string; description: string }[]
}

export interface ModuleDesign {
  requirements: string
  modules: ModuleDesignEntry[]
}

function designPath(directory: string): string {
  return join(directory, MODULE_AGENT_DIR, MODULE_DESIGN_FILE)
}

function emptyDesign(): ModuleDesign {
  return { requirements: 'requirements_design.md', modules: [] }
}

export function readDesignSync(directory: string): ModuleDesign {
  const path = designPath(directory)
  if (!existsSync(path)) {
    return emptyDesign()
  }
  try {
    return readJsonSync<ModuleDesign>(path)
  } catch {
    return emptyDesign()
  }
}

export function writeDesignSync(directory: string, design: ModuleDesign): void {
  writeJsonSync(designPath(directory), design)
}

export function addOrUpdateModule(
  directory: string,
  entry: ModuleDesignEntry,
  isUpdate: boolean,
): void {
  const design = readDesignSync(directory)
  const idx = design.modules.findIndex((m) => m.name === entry.name)

  if (idx === -1) {
    design.modules.push(entry)
  } else {
    const existing = design.modules[idx]
    if (existing === undefined) {
      // 索引与 findIndex 结果不一致仅在并发写时出现；以追加兜底。
      design.modules.push(entry)
    } else if (isUpdate) {
      // partial merge: only overwrite provided fields
      if (entry.description !== undefined) existing.description = entry.description
      if (entry.responsibilities !== undefined) existing.responsibilities = entry.responsibilities
      if (entry.dependencies !== undefined) existing.dependencies = entry.dependencies
      if (entry.functions !== undefined) existing.functions = entry.functions
    } else {
      design.modules[idx] = entry
    }
  }

  writeDesignSync(directory, design)
}

export function removeModuleDesign(
  directory: string,
  moduleName: string,
): void {
  const design = readDesignSync(directory)
  const remaining = design.modules.filter((m) => m.name !== moduleName)
  if (remaining.length === design.modules.length) return
  design.modules = remaining
  writeDesignSync(directory, design)
}
