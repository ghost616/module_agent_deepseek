维护插件入口 index.ts（注册全部工具与事件钩子、权限拦截、会话模式守卫），公共类型 types.ts、常量 constants.ts、文件工具 fs.ts、会话状态 session_state.ts、智能体画像 agent_profile.ts、代码规范 code_conventions.ts、新手提示 beginner_tips.ts、文件备份 file_backup.ts、失效数据清理 stale_cleanup.ts，以及 verification_code、module_agent_backup、module_agent_cleanup 工具。
## 插件入口与事件钩子

`src/index.ts` 为 dsh(Cordis) 插件入口：`apply(ctx, config)` + `inject(['tools','systemPrompt','agents','subagents'])`，替代 opencode 的 `Plugin(ctx)=>tool` 结构。`src/config.ts` 提供 `Config`（schemastery）与 `dataDir` 兜底字段。

入口组装以下 dsh 等价 hooks：
- 权限与拦截：`tools/pre-execute` 自动放行自定义工具、deny 越出工程目录的 write/edit；`tools.guard` 执行各智能体模式守卫（风后/皋陶/隶首/夔禁写文件、力牧禁写 .module_agent、夔白名单与 action 级限制；离朱可自由 write/edit 编写测试文件）。
- 系统提示词注入：`systemPrompt.section` 为框架子智能体注入知识库清单、为风后新手模式注入需求引导规则。
- 完成通知：`agent/pre-step` 拦截发往风后/夔的 dsh 原生 `subagent-settled` 通知并替换为框架完成通知（力牧含 module_name，供 module_agent_executor(action="status") 使用），避免风后收到重复通知；替换完成后清除已 settle 子代理的 mode；`agent/status` 仅维护力牧活跃监控（running 记录活动、idle 清除活动，不再发送完成通知）；`tools/post-execute` 在框架子智能体每次工具执行后刷新活动时间。

`src/lib/session_state.ts` 为会话身份注册表：dsh 以 subagent persona/descriptor（`module-agent:role=<mode>` marker 或 `module-agent:<mode>` provider 命名）标记力牧/皋陶/离朱/夔身份，替代 opencode 的 session_modes.json 映射；保留 getAgentMode/setAgentMode/clearAgentMode 接口语义并绑定 subagent/start 生命周期（冷恢复时经 foldSubagentDescriptor 从持久化 descriptor.persona 识别 marker 重建身份）；mode 清理不绑定 agent/disposed（dispose 先于 subagent-settled 触发会过早清除），改由 subagent-settled 处理后 clearAgentMode 及 cleanStaleModes 兜底清理。

orchestration 模块尚未移植的能力（力牧计划守卫、bash 命令守卫、离朱启动者绑定校验、limu_monitor 活跃追踪）在代码中以 TODO(orchestration) 标注，由该模块后续以 tools.guard 挂载。
## 公共数据层

framework 提供共享数据层，沿用 `.module_agent/*.json` 文件存储，逻辑与原 opencode 版保持一致，仅调整类型/导入：

- 公共基础：`src/lib/types.ts`（共享类型）、`src/lib/constants.ts`（路径常量与默认模板）、`src/lib/fs.ts`（异步读写 + 同步 existsSync/readJsonSync/writeJsonSync）。writeJsonSync 与 readJsonSync 配套，用于同步 read-modify-write：利用 Node 单线程同步代码块原子性，将「读 JSON → 改 → 写 JSON」抽成同步函数（全程无 await），避免多 agent 并发写竞态与 JSON 损坏。
- 数据模型：module_tree、module_definition、development_plan、execution_result、review_result、kui_plan、plan_files、session_plan_map、session_workspace、workspace_config、corrections、file_backup 共 12 个，均提供读写与 cleanStale* 失效清理。其中 module_tree（readModuleTreeSync/writeModuleTreeSync + addModule/removeModule）、module_definition（readDefinitionSync/writeDefinitionSync + modifyDefinition/removeFilesFromModule）、file_backup（readMappingSync/writeMappingSync，backupFile 内 mapping 读改写同步）三类数据的读改写已同步化。
- 共享读写：workspace.ts（工作空间索引与风后绑定）、knowledge_base.ts（知识库清单与提示词构造）作为跨模块共享数据访问层；beginner_tips.ts 提供新手模式规则常量。
- tool_output.ts 提供全部 module-agent 工具的 defineTool 公共输出声明（schema={type:json} + 文本 render）。
## 工具注册

`src/tools/index.ts` 的 `registerModuleAgentTools` 注册全部 25 个工具（defineTool + ctx.tools.register()）。

本期完整实现：
- `verification_code`：生成验证随机码并保存至会话；同时导出 generateId、确认码校验/消费等公共函数供 module_agent_plan 等工具复用。
- `module_agent_backup`：backup/list/read_backup_content 三操作，力牧备份、风后/力牧/皋陶读取，校验模块存在与调用者身份。

其余 23 个工具（module_agent_admin/executor/updater/updater_plan/updater_review/reader/start/setup/done、module_design_admin、module_agent_plan、workspace、module_agent_explorer/analyzer/line_reader、module_classification、module_agent_classifier/cleanup、agent_model_list、agent_model_config、module_agent_testing/correction、knowledge_base）在 `src/tools/skeleton.ts` 中为骨架占位（调用返回"尚未实现"），由各后续模块移植为真实实现后从骨架清单移除。
## 包骨架与类型检查

`package.json` 为 `@deepseek-ai/dsh-module-agent`（type=module，依赖 `@deepseek-ai/cordis`/`@deepseek-ai/schemastery` 与 dsh peer 包，workspace:^ 协议）。`tsconfig.json` extends `E:/deepseek-harness/tsconfig.base.json`（strict + noImplicitAny 等），通过其 paths 将 `@deepseek-ai/*` 映射到 dsh 源码做类型检查（noEmit，不设 rootDir）。

注意：paths 指向 dsh 未构建源码时，编译器会把 dsh/vendor 源码纳入程序并按其依赖做类型检查，因此**在 deepseek-harness 未 `pnpm install`（缺少 @standard-schema/spec、js-yaml、zod 等）时，`tsc --noEmit` 会产生指向 dsh 源码的环境噪音报错**；本项目 `src/**/*.ts` 自身类型已通过离朱回归验证归零。后续模块修改 src 后如遇此类噪音，应先确认 deepseek-harness node_modules 已安装。
## bundle 自动加载

零配置自动加载改由直接修改 dsh 仓库 base bundle 实现：在 packages/bundle/base/cordis.patch.yml 的 insert 列表中新增 module-agent 插件行（name=@deepseek-ai/dsh-module-agent，config 含 dataDir/subagentProvider=spawn），并在其 package.json 的 dependencies 中加 @deepseek-ai/dsh-module-agent（workspace:^）。不再维护独立 bundle 包（本项目曾新增的 bundle/module-agent/ 目录及 README「方式二：bundle 自动加载」章节已删除）。