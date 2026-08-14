模块的创建/修改/删除（module_agent_admin），module_definition.json 文件条目增删改与迁移（module_agent_updater、module_design_admin），current_spec.md 功能说明读写（module_agent_reader），文件分类（module_classification、module_agent_classifier、classifier_rules），目录探查（module_agent_explorer）、文件关键字分析（module_agent_analyzer）、行读取（module_agent_line_reader），以及 lib/module_definition.ts、module_design.ts、module_spec.ts、module_tree.ts。
## 模块生命周期管理

module_agent_admin 工具实现模块的创建（create）、修改（update）、删除（delete）、候选目录探查（list_dirs）与模块树读取（read_modules）。create 在 .module_agent/<module_name>/ 下建目录并写入 agent_profile.txt、current_spec.md、change_history.log、execution_results/；delete 仅允许模块定义为空时执行，同时清理 module_tree.json 条目、module_design.json 设计条目与模块数据目录。操作权限：除 read_modules 允许隶首外，其余仅风后可调用。

lib/agent_profile.ts 提供 agent_profile.txt 的读取/写入/按模板补建。
## 模块设计管理

module_design_admin 工具管理 module_design.json（add_module / update_module / read），并读写 .module_agent/code_conventions.txt 与 requirements_design.md。update_module 按字段合并覆盖；add_module / update_module 在非隶首模式下需先存在需求设计与代码规范文件。仅供风后、岐伯或隶首调用。

lib/module_design.ts 提供 module_design.json 的读写与 addOrUpdateModule/removeModuleDesign。
## 模块元数据读取

module_agent_reader 工具读取模块元数据：read_spec（current_spec.md 全文）、read_spec_headings（## 二级标题）、read_spec_section（按 heading 读 section）、read_definition（文件路径列表）、read_descriptions（按 paths 查文件说明，返回 found/not_found）、read_dirs（文件所在目录）、read_history（change_history.log，可按 from/to 时间过滤）、read_plan_files（plan_files.json）。测试结果/测试说明/夔计划相关 action（read_test_results、read_test_specs、read_kui_plan 等）依赖 orchestration 模块的会话绑定与监控，暂返回未移植提示。

lib/module_spec.ts 提供 current_spec.md 的读取、标题解析与 section 定位。
## 模块元数据更新

module_agent_updater 工具增量更新模块元数据：update_spec（增/改 current_spec.md 指定 heading 的 section，heading 须为功能领域描述）、update_definition（增/删/改 module_definition.json 文件条目，description 须为累积完整说明）、move_definition（将文件定义迁移到目标模块并在双方追加 change_history.log）、append_history（追加变更记录）。update_kui_plan 依赖 orchestration 模块的夔计划与会话绑定，暂返回未移植提示。风后仅可使用 update_definition/move_definition/update_spec，隶首仅 update_spec。
## 目录探查与文件读取

module_agent_explorer 递归探查目录：explore_dir 返回子目录列表及文件类型/所属模块统计与目录树文本，list_files 返回指定目录直接子文件的所属模块；支持 ignore 目录名单与 recursive 开关。module_agent_analyzer 按关键字/正则匹配文件行，module_agent_line_reader 按行号范围读取文件内容。三者仅供隶首或风后调用。
## 文件分类（隶首）

module_agent_classifier 将当前会话激活为隶首模式（lishou）并通过 exec.deferContext 注入 CLASSIFIER_RULES（lib/classifier_rules.ts）文件归类工作流规则，与风后力牧/岐伯/力牧/皋陶/离朱模式互斥。

module_classification 管理分类结果（存于 .module_agent/.classifications/<session>.json）：add 添加分类、update/delete 修改分类、bind_module 绑定已有模块或新建模块（同时写 agent_profile/current_spec/module_design 并登记模块树）、apply 将已绑定分类的文件写入 module_definition.json。仅供隶首调用。
