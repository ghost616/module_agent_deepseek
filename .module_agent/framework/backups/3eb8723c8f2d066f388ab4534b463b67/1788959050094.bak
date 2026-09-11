// ============================================================
// module_tree.json 结构
// ============================================================

export interface ModuleTree {
  modules: ModuleEntry[]
}

export interface ModuleEntry {
  /** 模块唯一标识 */
  name: string
  /** 模块说明 */
  description: string
}

// ============================================================
// module_definition.json 结构
// ============================================================

export interface ModuleDefinition {
  module_name: string
  files: FileEntry[]
}

export interface FileEntry {
  /** 文件路径（相对项目根目录） */
  path: string
  /** 文件功能简短说明 */
  description: string
}

// ============================================================
// execution_results/<session_id>.json 结构
// ============================================================

/** 力牧单次执行记录 */
export interface ExecutionRecord {
  plan_id: string
  plan: string
  modified_files: string[]
  summary: string
  errors: string[]
  timeout?: boolean
}

/** 执行结果文件结构：记录数组 */
export type ExecutionRecords = ExecutionRecord[]

// ============================================================
// Development Plan 结构
// ============================================================

export interface PlanMeta {
  plan_id: string
  plan_summary: string
  starter_session_id: string
  code_reviewed: boolean
  plan_completed: boolean
  test_passed: boolean
}

export interface PlanDetail {
  plan_id: string
  module_name: string
  development_plan: string
  session_id: string
  modified_files: string[]
}

// ============================================================
// Kui Plan 结构
// ============================================================

export interface KuiPlanEntry {
  module_name: string
  development_plan: string
}

export interface KuiPlan {
  kui_plan_id: string
  kui_session_id?: string
  plans: KuiPlanEntry[]
  plan_ids: string[]
  status: 'pending' | 'running' | 'completed'
  result: string
}

// ============================================================
// Review 结果结构
// ============================================================

export interface ReviewIssue {
  file: string
  line?: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface PlanReview {
  plan_id: string
  summary: string
  issues: ReviewIssue[]
  approved: boolean
}

export interface ReviewResult {
  reviewer_session_id: string
  planReviews: PlanReview[]
}

// ============================================================
// Tool 返回值类型
// ============================================================

export interface AdminResult {
  status: 'created' | 'updated' | 'error'
  paths?: string[]
  changed_files?: string[]
  error?: string
}

export interface ExecutorStartResult {
  session_id: string
}

export interface ExecutorStatusFinished {
  finished: true
  records: ExecutionRecord[]
}

export interface ExecutorStatusPending {
  finished: false
}

export type ExecutorStatusResult = ExecutorStatusFinished | ExecutorStatusPending

export interface TestSpec {
  session_id: string
  content: string
  timestamp: string
}
