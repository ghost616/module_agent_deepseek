开发计划的确认/读取/完成/删除（module_agent_plan），力牧执行进度与结果记录（module_agent_updater_plan、development_plan、plan_files、session_plan_map、execution_result），皋陶审查结果写入（module_agent_updater_review、review_result、reviewer_rules），离朱测试功能说明与报告（tools/testing、lib/testing、lizhu_rules、lizhu_env_guard）。
## 开发计划管理

module_agent_plan 工具管理开发计划全生命周期：
- confirm_plan：校验确认码后生成计划 ID（verification_code 配合）。
- read_metadata / read_plan：读取计划元数据（metadata.json）与计划详情。
- plan_complete：力牧标记计划完成（前置要求 test_passed=true），完成后释放该模块 plan_files 会话并移除会话-计划映射。
- set_test_passed：力牧设置测试通过/失败；若已写入测试说明但无测试报告则报错提示先启动离朱。
- get_pending_review / review_complete：皋陶获取待审查计划与标记审查完成。
- create_review_plan / delete_plan / clean_completed：风后创建审查计划、删除计划、清理已完成且已审查的计划。

数据层 development_plan.ts 存于 workspace 的 development_plan/ 目录（metadata.json + <plan_id>.json）；session_plan_map.ts 维护会话-计划映射（session_plan_map.json）。

力牧计划有效性守卫：mode === 'limu' 时在 checkPermission 之后、resolveWorkspace 之前调用 limuPlanGuard(directory, agentId)，返回非 null（无关联计划或计划已完成）则拒绝；plan_complete 时映射仍存在可正常通过。皋陶启动者过滤（getGaotaoStarter）、夔绑定皋陶校验（hasGaotaoBound）、离朱绑定与测试报告已读取校验（getBoundLizhu）由 orchestration 提供。
## 力牧执行进度与结果记录

module_agent_updater_plan 工具（仅供力牧）：
- write_result：向 executions/<module>/<session>.json 写入执行记录（同计划覆盖、异计划追加）。
- add_plan_files / remove_plan_files：维护 .module_agent/<module>/plan_files.json 的计划修改文件列表。
- check_active_plan：检测当前会话关联计划是否有效（计划存在且未标记完成）。

数据层：execution_result.ts（executions 目录）、plan_files.ts（plan_files.json）。

力牧计划有效性守卫（limuPlanGuard，lib/limu_plan_guard.ts）在工具 execute 内无条件调用：会话须已关联工作空间、存在未完成的开发计划，不合法时返回拒绝理由。limu_plan_guard.ts 同时供 orchestration 模块的 tools/pre-execute 守卫使用。
## 皋陶代码审查

module_agent_updater_review 工具（仅供皋陶）：write_review 写入或更新指定计划的审查总结（review_summary）、问题列表（review_issues，含 file/line/severity/message）与通过结论（review_approved），数据存 review_results/<session>.json。

reviewer_rules.ts 提供皋陶审查规则文本（审查循环、六个审查维度、结果格式），供 orchestration 注入皋陶 persona。
## 离朱测试说明与报告

module_agent_testing 工具：
- write_spec：风后或力牧写入待测试功能说明，存 test_specs/<session>.json。
- write_report：离朱写入测试报告（Markdown），存 test_reports/<session>.json。
- check_playwright：检测 Playwright 安装（npm / Python）。

数据层 testing.ts：test_specs/ 与 test_reports/ 写入、runShellCommand 命令执行、过期清理。

lizhu_rules.ts 提供离朱测试规则文本（工具清单、.lizhu_env/ 环境目录限制、测试用例生成规则、工作流程）；lizhu_env_guard.ts 提供环境构建命令守卫（install/init/create 等命令限定在 .lizhu_env/ 内、禁止 cd 切换目录），供 orchestration 挂载 bash 守卫与注入离朱 persona。

依赖 orchestration 预留：离朱启动者绑定校验（getBoundStarter）与离朱子代理调度（module_agent_executor action="start_lizhu"）。

