import { join } from 'node:path'

// ============================================================
// 路径常量
// ============================================================

/** 项目根目录下的模块树配置文件 */
export const MODULE_TREE_FILE = '.module_agent/module_tree.json'

/** 模块数据根目录名（位于项目根目录） */
export const MODULE_AGENT_DIR = '.module_agent'

/** module_agent 子文件名 */
export const AGENT_PROFILE_FILE = 'agent_profile.txt'
export const CURRENT_SPEC_FILE = 'current_spec.md'
export const CHANGE_HISTORY_FILE = 'change_history.log'
export const MODULE_DEFINITION_FILE = 'module_definition.json'
export const EXECUTION_RESULTS_DIR = 'execution_results'
export const PLAN_FILES_FILE = 'plan_files.json'
export const SESSION_MODES_FILE = '.module_agent/session_modes.json'

// ============================================================
// Workspace 路径
// ============================================================

/** 工作空间目录：<project_root>/.module_agent/.workspaces/<name>/ */
export function workspaceDir(directory: string, name: string): string {
  return join(directory, MODULE_AGENT_DIR, '.workspaces', name)
}

export const WORKSPACE_INDEX_FILE = '.module_agent/.workspaces/index.json'
export const SESSION_WORKSPACE_FILE = '.module_agent/session_workspaces.json'

/** 项目全局配置文件 */
export const CODE_CONVENTIONS_FILE = 'code_conventions.txt'
export const REQUIREMENTS_DESIGN_FILE = 'requirements_design.md'
export const MODULE_DESIGN_FILE = 'module_design.json'

/**
 * 获取力牧数据目录路径
 * 目录结构: <project_root>/.module_agent/<module_name>/
 */
export function moduleAgentDir(directory: string, moduleName: string): string {
  return join(directory, MODULE_AGENT_DIR, moduleName)
}

// ============================================================
// 默认 agent_profile.txt 模板
// ============================================================

export function defaultAgentProfile(moduleName: string): string {
  return `角色：${moduleName}模块专家
专长：${moduleName}模块涉及的技术栈与业务逻辑
其他约定：
- 优先复用现有模块能力，减少重复代码
- 保持接口向后兼容，不随意修改公共方法签名
`
}

// ============================================================
// 默认 current_spec.md 模板
// ============================================================

export function defaultCurrentSpec(moduleName: string): string {
  return `# ${moduleName} 模块功能说明

> 待力牧首次执行后填充，记录模块公共方法与功能。
`
}

// ============================================================
// 默认 change_history.log 模板
// ============================================================

export const INITIAL_CHANGE_HISTORY = `## 变更历史
`

// ============================================================
// 默认 module_definition.json 模板
// ============================================================

export function emptyModuleDefinition(moduleName: string): string {
  return JSON.stringify(
    {
      module_name: moduleName,
      files: [],
    },
    null,
    2,
  )
}
