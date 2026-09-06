维护插件入口 index.ts（注册全部工具与事件钩子、权限拦截、会话模式守卫），公共类型 types.ts、常量 constants.ts、文件工具 fs.ts、会话状态 session_state.ts、智能体画像 agent_profile.ts、代码规范 code_conventions.ts、新手提示 beginner_tips.ts、文件备份 file_backup.ts、失效数据清理 stale_cleanup.ts，以及 verification_code、module_agent_backup、module_agent_cleanup 工具。
## 插件入口与事件钩子

- 权限与拦截：`tools/pre-execute` 自动放行自定义工具、deny 越出工程目录的 write/edit；`tools.guard` 执行各智能体模式守卫（风后/皋陶/隶首/夔禁写文件、力牧禁写 .module_agent、夔白名单与 action 级限制、框架子代理禁用 dsh report 工具——framework 子代理本有专用报告机制 module_agent_testing write_report / module_agent_updater_review write_review，不依赖 dsh report，禁用避免与 settle 的 subagent-settled 重复产生 subagent-report；离朱可自由 write/edit 编写测试文件）。
- 系统提示词注入：`systemPrompt.section` 为框架子智能体注入知识库清单、为风后新手模式注入需求引导规则。
- 完成通知：`agent/pre-step` 拦截发往风后/夔/力牧等框架 owner 的 dsh `subagent-settled` 通知（框架子代理 report 工具已被 tools.guard 禁用，故仅此单一消息源）并替换为框架完成通知（力牧含 module_name，供 module_agent_executor(action="status") 使用），避免 owner 收到重复/原始消息（离朱 settle 给力牧时，力牧收到「离朱测试完毕…」而非原始 subagent-settled）；替换完成后清除已 settle 子代理的 mode；`agent/status` 仅维护活跃监控（running 对框架子智能体记录活动、idle 无条件清除活动，不再发送完成通知；idle 不依赖 mode，防御性兜底避免任何提前清 mode 场景导致 lastActivity 残留致 isWorking 恒 true、力牧被误拦「离朱仍在运行」）；`tools/post-execute` 在框架子智能体每次工具执行后刷新活动时间。
- 会话模式冷恢复：`subagent/start` 分类链在 classifyProvider（`module-agent:<mode>` provider 命名）未命中时，经 ctx.agents 取回 agent，以 dsh 0.1.2-alpha.5 新会话形态 `foldSubagentDescriptor(agent.session.ownEvents())` 折叠 child 自有事件（fork 继承前缀截断 = ownEvents()，自 inheritedEventCount 起）中的 subagent/descriptor（version 3），continuable 且 persona 含 marker 才注册 mode（与 module_agent_executor.recoverAgentMode 同构；不再使用旧 header.seedLength / events.slice）。

- 会话模式与工作空间 fork 继承（dsh 顶层 fork child）：registerSessionState 的 agent/session-start handler 在原「内存已有 mode 跳过 / 自身持久化宿主 mode 恢复 return」之后，对 dsh 普通顶层 fork child（agent.session.header.parentSession 存在且 origin!=='subagent'）继承父会话 host mode 与工作空间绑定：父 host mode = state.getAgentMode(parentSession) ?? restoreMode(directory)[parentSession]，为宿主模式（fengzhou/qibo/lishou，isHostMode）时 setAgentMode(child) + persistMode(child)；随后恒调 workspace.ts 的幂等 helper inheritWorkspaceBinding(directory, parentSessionId, childId)。父无 mode/绑定或非宿主 mode 静默跳过（不误标、不改文件）；子代理 fork/续用（origin='subagent'）走 descriptor/classifyProvider 身份通道不触发。

## 公共数据层

framework 提供共享数据层，沿用 `.module_agent/*.json` 文件存储，逻辑与原 opencode 版保持一致，仅调整类型/导入：

- 公共基础：`src/lib/types.ts`（共享类型）、`src/lib/constants.ts`（路径常量与默认模板）、`src/lib/fs.ts`（异步读写 + 同步 existsSync/readJsonSync/writeJsonSync）。writeJsonSync 与 readJsonSync 配套，用于同步 read-modify-write：利用 Node 单线程同步代码块原子性，将「读 JSON → 改 → 写 JSON」抽成同步函数（全程无 await），避免多 agent 并发写竞态与 JSON 损坏。
- 数据模型：module_tree、module_definition、development_plan、execution_result、review_result、kui_plan、plan_files、session_plan_map、session_workspace、workspace_config、corrections、file_backup 共 12 个，均提供读写与 cleanStale* 失效清理。其中 module_tree（readModuleTreeSync/writeModuleTreeSync + addModule/removeModule）、module_definition（readDefinitionSync/writeDefinitionSync + modifyDefinition/removeFilesFromModule）、file_backup（readMappingSync/writeMappingSync，backupFile 内 mapping 读改写同步）三类数据的读改写已同步化。
- 共享读写：workspace.ts（工作空间索引与风后绑定）、knowledge_base.ts（知识库清单与提示词构造）作为跨模块共享数据访问层；beginner_tips.ts 提供新手模式规则常量。
- tool_output.ts 提供全部 module-agent 工具的 defineTool 公共输出声明（schema={type:json} + 文本 render）。

- 工作空间数据模型（fork 继承）：workspace.ts 提供幂等 helper inheritWorkspaceBinding(directory, parentSessionId, childSessionId)——父绑定（bindings[parent]）非空且 child 未绑定时把 bindings[child]=父绑定写入工作空间 index（同步读改写，不做 bindFengzhou 的已绑定抛错校验、不写 session_workspaces 子代理映射面）；child 已有绑定跳过不改并返回其既有绑定；父无绑定返回 null 且不写文件。供 registerSessionState 在 dsh 顶层 fork child 会话启动时继承父绑定，使 fork 分支内 module-agent 工具工作空间解析与风后权限即时恢复。

## 工具注册

`src/tools/index.ts` 的 `registerModuleAgentTools` 注册全部 25 个工具（defineTool + ctx.tools.register()）。

本期完整实现：
- `verification_code`：生成验证随机码并保存至会话；同时导出 generateId、确认码校验/消费等公共函数供 module_agent_plan 等工具复用。
- `module_agent_backup`：backup/list/read_backup_content 三操作，力牧备份、风后/力牧/皋陶读取，校验模块存在与调用者身份。

其余 23 个工具（module_agent_admin/executor/updater/updater_plan/updater_review/reader/start/setup/done、module_design_admin、module_agent_plan、workspace、module_agent_explorer/analyzer/line_reader、module_classification、module_agent_classifier/cleanup、agent_model_list、agent_model_config、module_agent_testing/correction、knowledge_base）在 `src/tools/skeleton.ts` 中为骨架占位（调用返回"尚未实现"），由各后续模块移植为真实实现后从骨架清单移除。
## 包骨架与类型检查

`package.json` 为 `@deepseek-ai/dsh-module-agent`（type=module，依赖 `@deepseek-ai/cordis`/`@deepseek-ai/schemastery` 与 dsh peer 包，版本均使用 `*`——这些 dsh 依赖实际由 dsh 宿主提供、工程内无需解析，脱离 monorepo 亦可 `npm install`）。`tsconfig.json` extends `E:/deepseek-harness/tsconfig.base.json`（strict + noImplicitAny 等），通过其 paths 将 `@deepseek-ai/*` 映射到 dsh 源码做类型检查（noEmit，不设 rootDir）。

注意：paths 指向 dsh 未构建源码时，编译器会把 dsh/vendor 源码纳入程序并按其依赖做类型检查，因此**在 deepseek-harness 未 `pnpm install`（缺少 @standard-schema/spec、js-yaml、zod 等）时，`tsc --noEmit` 会产生指向 dsh 源码的环境噪音报错**；本项目 `src/**/*.ts` 自身类型已通过离朱回归验证归零。后续模块修改 src 后如遇此类噪音，应先确认 deepseek-harness node_modules 已安装。

- client 面构建（P1a）：package.json 顶层声明 `"dsh": { "client": { "platform": "web" } }`（无 inject——client 面所需 react 与 `@deepseek-ai/dsh-client-ui-primitives`（PLATFORM_MODULE）均以 external 由 dsh web 运行时模块表提供，故无需 `dsh.client.inject/external` 声明）；`exports` 中 `"./client"` 子路径 types/default 均指向构建产物 `./client.js`（供 dsh client-modules 扫描装载，不再指向 src 源文件）。`client-src/index.ts` 为 client 面源码，由 `scripts/build-client.mjs` 用 esbuild 打包（bundle + cjs + platform browser + charset utf8 + external react/react-dom/@deepseek-ai/*，write:false 内存产物）并包裹 `window.__ModuleLoader__.load({ id: '@deepseek-ai/dsh-module-agent', factory: (require) => { ... } })` 合规单文件写入仓库根 `client.js`（产物单文件、单个换行结尾，load id 须与包名一致，格式对齐 dsh 各 client 包的 lib/client.js 产物）。`scripts` 新增 `client:build`（node scripts/build-client.mjs），`devDependencies` 新增 esbuild。host 侧 tsconfig include 仅 `"src"`，client-src/ 与 scripts/ 不被 host 类型检查覆盖。

- client 面功能（P1b，含样式对齐）：`client-src/index.ts` 导出 `name='module-agent-client'`、`inject=['slots']` 与 `apply(ctx)`；apply 经 `ctx.slots.inject('conversation.input.right', ...)` 注册 composer 右侧图标工具按钮项（id='module-agent-retry'），观感对齐 ui-conversation 输入工具项——以 React.createElement 组合 primitives 的 `IconBranchOutline16`（语义贴合「回退并重发」）与 `Tooltip`（label 回退并重发、side top、delayMs 500），button 带 `data-module-agent-retry`/`aria-label`/`title`，onClick 仅 console.info 标记；apply 先经 ensureRetryStyle 注入 `data-plugin-css` 去重的自有 `<style>`（28px 透明圆角、hover 用 `--dsw-alias-interactive-bg-hover-solid`、active 用 `--dsw-alias-interactive-bg-active`、focus-visible 用 `--dsw-alias-border-l3` 2px 环、图标 15px、图标色 `--dsw-alias-label-tertiary`）。`slots` 服务由 ui-renderer 提供；`dsh.client.inject/external` 不增。P1c 将 onClick 接入「回退并重发」fork/回填。产物 client.js 已重跑 `npm run client:build` 更新（含按钮注册、样式注入、onClick 标记、单换行结尾）。

- client 构建产物细节（P1b 修正）：build-client.mjs 用 esbuild `charset:'utf8'`（中文按钮文案以字面输出而非 \uXXXX 转义），并将 LOAD_FOOTER 改为不含结尾换行、由写入时统一补单个 `\n`，保证产物以 `}});` + 单个换行结尾、无多余空行。`npm run client:build` 复验通过（esbuild 装至 ^0.25.12）。

- client 面功能（P1c，回退并重发）：`client-src/index.ts` 的 `inject` 扩为 `['slots','sessions']`（sessions 由 session-controller client 注入；conversation 服务不经注入，而是经会话 scope ctx `sessions.scope(child).get('conversation')` 惰性解析——queue dock 同款模式，故 `dsh.client.inject/external` 仍不增）；composer 右侧按钮项注册新增 `inject` 回调（按 sessionId 生成 bound onRewind，含 inFlight 并发护栏），onClick 调 `rewindLastRound`：读 `ctx.sessions.binding(sessionId).eventSource` 会话事件窗口 → `scanRewindTarget` 定位最后一条 `user/message`（source.kind==='user'，text 块拼文本）及其前最近 `turn/end` 的 seq 作为 fork `atSeq`（fork 边界语义对齐后端 commands.ts：boundary=首个 seq>=atSeq 的 turn/end，新分支前缀止于上一已完成回合、把最后 user 及其后作废）→ `ctx.sessions.fork({sessionId, atSeq, increaseTitle:true})` → 经新分支 scope 的 `conversation.input.for(scope).setDraft(text)` 回填 composer 草稿（conversation 不可达时 loud 记录能力缺口并以 backfilled=false 继续回退——最小偏差）→ `ctx.sessions.open(childId)` 切到新分支；`reportRewind` 对 no-user-message/no-completed-turn/no-text/fork-failed 给出可读反馈（composer notify 可见提示 + console），成功 console.info。纯逻辑抽入新增 `client-src/rewind.ts`（scanRewindTarget/rewindLastRound，事件形态结构子集，可独立单测）。P1b 图标按钮/Tooltip/aria-label/title/样式保留（title 更新为撤销最近一轮说明）。产物 client.js 由 `npm run client:build` 重跑更新。

- client 面修正（P1c 复查）：rewind 事件窗口条目判别对齐宿主真实契约——client-src/rewind.ts 的 EventWindowEntryLike = {type:'event'; event} | {type:'chunks'; event}（判别字段 type，event 必选，同 session-controller contract/events.ts SessionEventLikeEntry），scanRewindTarget 候选检索与 atSeq 回溯以 entry.type==='event' + event.type（user/message、turn/end）命中；source.kind==='user'（MessageSource 字段）仅用于过滤用户注入消息。产物 client.js 已重跑 npm run client:build 更新。

## bundle 自动加载

零配置自动加载改由直接修改 dsh 仓库 base bundle 实现：在 packages/bundle/base/cordis.patch.yml 的 insert 列表中新增 module-agent 插件行（name=@deepseek-ai/dsh-module-agent，config 含 dataDir/subagentProvider=spawn），并在其 package.json 的 dependencies 中加 @deepseek-ai/dsh-module-agent（workspace:^）。不再维护独立 bundle 包（本项目曾新增的 bundle/module-agent/ 目录及 README「方式二：bundle 自动加载」章节已删除）。