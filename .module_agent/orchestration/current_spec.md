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
