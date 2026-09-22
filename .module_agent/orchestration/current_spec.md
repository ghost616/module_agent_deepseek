启动力牧执行计划（module_agent_executor start/status/ping），启动皋陶审查（start_review/review_status/check_reviewer），夔批量编排（start_kui/kui_status、kui_plan、kui_rules），会话启动/关闭（module_agent_start、module_agent_done），力牧活跃监控 limu_monitor.ts、计划有效性守卫 limu_plan_guard.ts、bash 命令守卫 limu_bash_guard.ts、离朱环境守卫 lizhu_env_guard.ts、会话绑定跟踪 module_session_tracker.ts、编排规则 orchestrator_rules.ts。
## 智能体调度

## 智能体调度

- 子智能体会话的建立与复用：module_agent_executor 通过 SubagentHost（ctx.subagents.startContinuable + followup）创建/续用可续式子会话，会话身份经 sessionState.setAgentMode 与 persona 标记（module-agent:role=<mode>）注册。
- 计划调度：module_agent_executor 的 start/status/ping/start_review/review_status/check_reviewer/kui_status/start_lizhu/list_unbound_lizhu/start_kui；力牧计划确认码校验（getPlanConfirmation/validateConfirmationCode）与执行记录/计划/会话-计划映射持久化。
- 会话启动/关闭：module_agent_start 激活风后力牧模式并注入编排规则；module_agent_done 关闭力牧/皋陶/离朱/夔会话并清理关联数据（close/close_all/list_idle）。
- 失效数据清理：module_agent_cleanup 清理工作空间内/外引用了已不存在会话的数据（stale_cleanup.ts，基于会话存活判定 isAlive）。
- 活跃监控：limu_monitor.ts 记录/清除子智能体活动时间，支撑空闲与 5 分钟无响应判定；完成通知经 agent/status(idle) 监听转发给启动者（风后/夔/力牧）。
- 守卫：limu_bash_guard.ts（力牧 bash 仅允许文件删除/重命名/移动）、limu_plan_guard.ts（力牧计划有效性）、lizhu_env_guard.ts（离朱环境构建仅限 .lizhu_env）、离朱启动者绑定校验，经 orchestration_guards.ts 挂载到 tools.guard 与 tools/pre-execute。
- 会话绑定跟踪：module_session_tracker.ts 维护 module_sessions.json 与 session_bindings.json（风后↔皋陶/力牧/夔、启动者↔离朱），支持会话复用与归属校验。
- 规则文本：orchestrator_rules.ts（风后力牧）、kui_rules.ts（夔）、reviewer_rules.ts（皋陶）、lizhu_rules.ts（离朱）、code_conventions.ts（读取项目代码规范）。
- 联动：module_agent_reader 的 read_test_specs/read_test_results/read_kui_plan/read_all_kui_plans/read_kui_plan_detail；module_agent_plan 的离朱绑定/皋陶启动者过滤/夔绑定校验；module_agent_testing 的离朱绑定校验。
## 会话复用与身份恢复

- 会话复用与身份恢复：module_agent_executor 的 recoverAgentMode 按「内存 descriptor → 冷会话 descriptor → 持久化文件」三级顺序识别子会话角色。内存活跃会话经 ctx.agents 取回 agent，用 foldSubagentDescriptor(session.ownEvents()) 折叠 persona marker（module-agent:role=<mode>）；内存无 agent 的冷会话经 sessionPersistence.open(id, 'read') 取得 handle，按 handle.read(0) 返回的 { events } 解构后以 handle.inheritedEventCount 截断再折叠；两级 descriptor 均未识别出角色时，最终回退读取 persistMode 写入的 .module_agent/session_modes.json（restoreMode(directory)[sessionId]），校验 isFrameworkSubagentMode 后返回。文件仅为最后兜底，不改变 descriptor 权威性。handlePing 与 isValidReusableSession 均传入各自 directory。
- 子代理角色持久化：力牧/皋陶/离朱/夔的新建、复用与身份恢复路径在每个 sessionState.setAgentMode 调用点旁同步调用 persistMode(directory, sessionId, mode) 落地角色；module_agent_done 的 cleanupLizhu/cleanupGaotao/cleanupLimu/cleanupKui 在 clearAgentMode 之后调用 removePersistedMode(directory, sessionId) 清理文件条目。
## 父子会话状态问询

- 状态文件数据模型：status_report.ts 在工作空间目录下以 status_reports/<子会话id>.json 覆盖写入子会话状态（session_id/mode/content/updated_at），提供 statusReportPath/statusReportExists/writeStatusReport/readStatusReport/deleteStatusReport/cleanStaleStatusReports（同步 JSON 读写，sessionId 经 sanitizeIdSegment 编码防路径穿越）；statusReportExists 供父会话与 framework 完成通知判断子会话是否已汇报状态。
- 状态问询工具：module_agent_status 提供 ask（父会话风后/夔/力牧校验调用者为目标真实父级——绑定表 getLimuStarter/getGaotaoStarter/getBoundStarter/getKuiStarter 与 dsh 父子关系 host.childAlive——后经 SubagentHost.followup 唤醒子会话概括进度并写状态；目标不存在/已关闭、忙碌分别报错）、write（框架子会话解析自身工作空间后覆盖写入）、read（父会话读取并消费删除状态文件、返回摘要，无文件时提示先 ask 或等待）。目标角色经「内存 mode → recoverAgentMode」解析，recoverAgentMode 由 module_agent_executor 导出复用。
- 接线：module_agent_done 的 cleanupLizhu/cleanupGaotao/cleanupLimu/cleanupKui 关闭会话时调用 deleteStatusReport 清理状态文件；stale_cleanup 的 cleanWorkspaceStale 接入 cleanStaleStatusReports 并在 WorkspaceCleanupStats 新增 status_reports 字段；module_agent_executor 的夔 toolFilter allow 列表放行 module_agent_status。
