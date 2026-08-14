workspace 工具的创建/绑定/列表/状态/配置读取与开发模式设置，工作空间配置 workspace_config.ts、会话与工作空间绑定 session_workspace.ts、工作空间路径解析 workspace.ts，知识库的增删改查 knowledge_base.ts 与 tools/knowledge_base.ts，纠正记录读写 corrections.ts 与 tools/correction.ts，模型配置 agent_model_config.ts 与 tools/agent_model_list.ts、tools/agent_model_config.ts，岐伯设置向导 setup_guide.ts 与 tools/module_agent_setup.ts。
## 工作空间与协作配置

### 工作空间管理（workspace）

- 提供 workspace 工具（createWorkspaceTool，defineTool 风格），操作：list / create / bind / status / get_config / set_development_mode。
- 数据层 lib/workspace.ts：listWorkspaces、createWorkspace、bindFengzhou、getBoundWorkspace、getBoundWorkspaceSync、getWorkspaceDir、resolveWorkspace、cleanStaleBindings；工作空间索引存于 `.module_agent/.workspaces/index.json`，空间目录为 `.module_agent/.workspaces/<name>/`。
- 配置层 lib/workspace_config.ts：getWorkspaceConfig、getWorkspaceConfigSync、setWorkspaceConfig、setDevelopmentMode；配置存于空间目录 config.json（development_mode: beginner/expert/''）。
- 会话工作空间映射 lib/session_workspace.ts：setSessionWorkspace、getSessionWorkspace、getSessionWorkspaceSync、removeSessionWorkspace、cleanStaleSessionWorkspaces；映射存于 `.module_agent/session_workspaces.json`。
- 权限：workspace 仅供风后（fengzhou）调用；执行上下文使用 exec.agent 的会话 cwd（directoryOfAgent）与会话 ID 解析项目目录。

### 知识库管理（knowledge_base）

- 提供 knowledge_base 工具（createKnowledgeBaseTool），操作：list / set / add / remove，仅风后可调用，需已绑定工作空间。
- 数据层 lib/knowledge_base.ts：listKnowledgeBases、listKnowledgeBasesSync、setKnowledgeBases、addKnowledgeBase、removeKnowledgeBase、isPathInKnowledgeBase、buildKnowledgeBasePrompt；列表存于空间目录 knowledge_bases.json。
- 知识库信息通过系统提示词注入（registerPromptInjection）注入到框架子智能体（夔/力牧/皋陶/离朱）的 systemPrompt，并对其目录自动放行读权限。

### 纠正反馈记录（module_agent_correction）

- 提供 module_agent_correction 工具（createCorrectionTool），操作：add / read / remove，仅风后可调用。
- 数据层 lib/corrections.ts：readCorrections、appendCorrection（去重）、removeCorrection；记录存于空间目录 corrections.json。

### 模型默认配置（agent_model_config / agent_model_list）

- 提供 agent_model_config 工具（createAgentModelConfigTool）：get 查看当前配置，set 设置力牧/皋陶/离朱/夔的默认模型（provider_id + model_id），set 时经 validateModelConfig 通过 ModelCatalog 校验模型存在性。
- 提供 agent_model_list 工具（createAgentModelListTool）：列出所有已配置模型提供方及其可用模型。
- 数据层 lib/agent_model_config.ts：readAgentModelConfig、writeAgentModelConfig、validateModelConfig、ModelCatalog（由 ctx.llm.listProviders/listModels 适配）。
- 配置存于空间目录 agent_model_config.json；两者仅风后可调用，需已绑定工作空间。

### 岐伯设置向导（module_agent_setup）

- 提供 module_agent_setup 工具（createModuleAgentSetupTool）：校验会话模式互斥（风后/力牧/皋陶/隶首/离朱已激活时拒绝），写入 qibo 模式，并通过 agent.inject 将 SETUP_GUIDE 注入当前会话。
- 规则文本 lib/setup_guide.ts 的 SETUP_GUIDE：定义岐伯工具使用限制、确认机制（verification_code）、Phase 1 需求设计 / Phase 2 代码规范 / Phase 3 模块设计引导流程。
