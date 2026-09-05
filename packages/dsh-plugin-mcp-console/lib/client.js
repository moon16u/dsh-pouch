window.__ModuleLoader__.load({
  id: "@moon16u/dsh-plugin-mcp-console",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    // ==== mcp-console client body (synced; keep identical to dsh-pouch/lib/client.js) ====

    var McpIcons = require("@deepseek-ai/dsh-client-ui-primitives");

    // ---------------------------------------------------------------------------
    // mcp-console client: an "MCP" settings section (mcp-manager-gui-spec.md)
    // over /api/dsh-mcp-console/*. All identifiers carry an Mcp/mcp prefix so
    // this body can be pasted verbatim into the dsh-pouch root client bundle.
    // ---------------------------------------------------------------------------

    var McpNS = "mcp-console";

    var mcpZh = {
      nav: "MCP 服务器",
      title: "已安装的 MCP 服务器",
      refresh: "同步配置并刷新状态",
      add: "添加 MCP",
      importAction: "导入 JSON",
      empty: "还没有配置任何 MCP 服务器。",
      toolsEnabled: "{n} 个工具已启用",
      toolsAvailable: "0 个工具",
      noTools: "该服务器未提供任何工具。",
      clickToDisable: "点击禁用该工具",
      clickToEnable: "点击启用该工具",
      enable: "启用",
      disable: "停用",
      remove: "删除",
      removeConfirm: "删除该服务器？其配置与连接将被移除。",
      confirmYes: "确认删除",
      confirmNo: "取消",
      importTitle: "导入 mcpServers JSON",
      importHelp: "支持粘贴标准 mcpServers JSON 配置（兼容 Claude/Cursor 等生态），同名服务自动跳过",
      importPlaceholder: '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"]\n    }\n  }\n}',
      importPreviewAdded: "将新增 {n} 台",
      importConfirm: "确认导入",
      importResult: "已导入 {added} 台，跳过 {skipped} 台",
      addTitle: "添加 MCP 服务器",
      editTitle: "编辑 MCP 服务器",
      formName: "服务名称",
      formNameHelp: "仅支持字母、数字、下划线及短横线，最多 32 个字符",
      formNamePlaceholder: "例如: github, memory, local-tools",
      formTransport: "传输协议",
      transportStdio: "stdio (本地命令)",
      transportHttp: "http / sse (远程服务)",
      formCommand: "执行命令",
      formCommandPlaceholder: "例如: npx, uvx, python",
      formArgs: "启动参数",
      formArgsPlaceholder: "每行一个参数，例如:\n-y\n@modelcontextprotocol/server-filesystem",
      formEnv: "环境变量",
      formEnvPlaceholder: "每行一个 KEY=VALUE，例如:\nGITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxx",
      formUrl: "服务 URL",
      formUrlPlaceholder: "http://127.0.0.1:3001/mcp",
      formHeaders: "自定义请求头 (Headers)",
      formHeadersPlaceholder: "每行一个 KEY: VALUE，例如:\nAuthorization: Bearer my_api_key",
      formTimeout: "调用超时 (毫秒)",
      formFail: "启动失败时中断并标记错误",
      formScope: "生效作用域",
      scopeGlobal: "全局",
      scopeProject: "项目",
      scopeGlobalHelp: "所有项目生效",
      scopeProjectHelp: "当前项目生效",
      scopeProjectNoWorkspaceHelp: "所有项目生效（当前处于全局设置，项目级专属配置需在具体项目会话中配置）",
      scopeProjectDisabledTip: "当前处于全局设置，无活跃项目工作区",
      formAdvanced: "高级选项",
      required: "必填",
      saveConfig: "保存配置",
      cancel: "取消",
      loadingData: "加载中…",
      apiError: "接口错误",
      storeError: "配置文件告警",
      profileReadOnly: "外部实例",
      errorPrefix: "错误",
      running: "运行中",
      connecting: "连接中",
      loading: "启动中",
      disabled: "已停用",
      failed: "失败",
      toolDeniedNote: "禁用的工具仍保留在模型工具列表中，但调用会被拒绝。",
      test: "测试连接",
      probeBusy: "测试中…",
      probeOk: "连接成功 · {n} 个工具 · {ms}ms",
      probeLiveOk: "已在运行 · {n} 个工具（实时状态）",
      probeLiveFail: "未正常连接（实时状态）：{error}",
      probeFail: "连接失败：{error}",
      pluginCardTitle: "MCP 控制台",
      pluginCardDesc: "MCP 服务器的连接、工具开关与导入。",
      pluginCardEnabled: "启用 MCP 控制台",
      pluginCardEnabledHelp: "关闭后：路由、全部 MCP 连接与模型公告下线；配置保留在 ~/.dsh/dsh-mcp.json",
      pluginCardAnnounce: "向模型公告 MCP 管理能力",
      pluginCardAnnounceHelp: "在系统提示中告知 agent：MCP 管理请到设置页操作，不要手改配置文件",
      pluginCardOverridden: "已自定义",
      pluginCardReset: "恢复默认",
      sectionOffline: "MCP 控制台当前已停用。",
      sectionOfflineHint: "到 设置 → 插件 → MCP 控制台 打开「启用 MCP 控制台」即可恢复；服务器配置一直保留在 ~/.dsh/dsh-mcp.json。",
      pluginCardExpand: "展开设置",
      pluginCardCollapse: "收起设置",
      pluginCardUnavailable: "此客户端未暴露插件设置（只读或本地模式）。",
      pluginCardLoading: "加载中…",
      pluginCardWriteError: "写入失败",
    };

    var mcpEn = {
      nav: "MCP servers",
      title: "Installed MCP Servers",
      refresh: "Sync config & refresh status",
      add: "Add MCP",
      importAction: "Import JSON",
      empty: "No MCP servers configured yet.",
      toolsEnabled: "{n} tools enabled",
      toolsAvailable: "0 tools",
      noTools: "No tools provided by this server.",
      clickToDisable: "Click to disable tool",
      clickToEnable: "Click to enable tool",
      enable: "Enable",
      disable: "Disable",
      remove: "Delete",
      removeConfirm: "Delete this server? Its config and connection will be removed.",
      confirmYes: "Delete",
      confirmNo: "Cancel",
      importTitle: "Import mcpServers JSON",
      importHelp: "Paste standard mcpServers JSON (Claude/Cursor compatible); duplicate names are skipped",
      importPlaceholder: '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"]\n    }\n  }\n}',
      importPreviewAdded: "{n} to add",
      importConfirm: "Import",
      importResult: "Imported {added}, skipped {skipped}",
      addTitle: "Add MCP server",
      editTitle: "Edit MCP server",
      formName: "Server name",
      formNameHelp: "Letters, digits, underscore and hyphen only, up to 32 characters",
      formNamePlaceholder: "e.g. github, memory, local-tools",
      formTransport: "Transport",
      transportStdio: "stdio (local command)",
      transportHttp: "http / sse (remote service)",
      formCommand: "Command",
      formCommandPlaceholder: "e.g. npx, uvx, python",
      formArgs: "Args",
      formArgsPlaceholder: "One per line, e.g.:\n-y\n@modelcontextprotocol/server-filesystem",
      formEnv: "Env vars",
      formEnvPlaceholder: "One KEY=VALUE per line, e.g.:\nGITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxx",
      formUrl: "Service URL",
      formUrlPlaceholder: "http://127.0.0.1:3001/mcp",
      formHeaders: "Headers",
      formHeadersPlaceholder: "One KEY: VALUE per line, e.g.:\nAuthorization: Bearer my_api_key",
      formTimeout: "Call timeout (ms)",
      formFail: "Abort and mark error on startup failure",
      formScope: "Scope",
      scopeGlobal: "Global",
      scopeProject: "Project",
      scopeGlobalHelp: "Applies to all projects",
      scopeProjectHelp: "Applies to current project only",
      scopeProjectNoWorkspaceHelp: "Applies to all projects (currently in global settings; configure project-scoped MCP within a project session)",
      scopeProjectDisabledTip: "Currently in global settings, no active workspace",
      formAdvanced: "Advanced",
      required: "required",
      saveConfig: "Save config",
      cancel: "Cancel",
      loadingData: "Loading…",
      apiError: "API error",
      storeError: "Config file warning",
      profileReadOnly: "External instance",
      errorPrefix: "Error",
      running: "Running",
      connecting: "Connecting",
      loading: "Starting",
      disabled: "Disabled",
      failed: "Failed",
      toolDeniedNote: "Disabled tools stay in the model tool list, but their calls are denied.",
      test: "Test connection",
      probeBusy: "Testing…",
      probeOk: "Connected · {n} tools · {ms}ms",
      probeLiveOk: "Running · {n} tools (live status)",
      probeLiveFail: "Not healthy (live status): {error}",
      probeFail: "Connection failed: {error}",
      pluginCardTitle: "MCP console",
      pluginCardDesc: "Connections, per-tool switches and import for MCP servers.",
      pluginCardEnabled: "Enable the MCP console",
      pluginCardEnabledHelp: "Off: routes, every MCP connection and the model announcement go offline; config stays in ~/.dsh/dsh-mcp.json",
      pluginCardAnnounce: "Announce MCP management to the model",
      pluginCardAnnounceHelp: "Tells agents in the system prompt to use the settings page for MCP management, not hand-edited files",
      pluginCardOverridden: "Customized",
      pluginCardReset: "Reset to defaults",
      sectionOffline: "The MCP console is switched off.",
      sectionOfflineHint: "Turn \"Enable the MCP console\" back on under Settings → Plugins → MCP console; server configuration stays in ~/.dsh/dsh-mcp.json.",
      pluginCardExpand: "Expand settings",
      pluginCardCollapse: "Collapse settings",
      pluginCardUnavailable: "Plugin settings are not exposed to this client (read-only or local mode).",
      pluginCardLoading: "Loading…",
      pluginCardWriteError: "Write failed",
    };

    var mcpCss = [
      ".mcp-mgr{color:var(--dsw-alias-label-primary,#111827);font-family:var(--dsw-font-family);font-size:13px;line-height:20px;display:flex;flex-direction:column;gap:14px;max-width:760px;box-sizing:border-box}",
      ".mcp-mgr *{box-sizing:border-box}",
      ".mcp-mgr-head{display:flex;align-items:center;gap:10px}",
      ".mcp-mgr-title{font-size:17px;font-weight:600;margin:0;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mcp-mgr-iconbtn{border:0;background:0 0;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;border-radius:8px;width:30px;height:30px;display:grid;place-items:center;flex:none;padding:0}",
      ".mcp-mgr-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-mgr-iconbtn:disabled{color:var(--dsw-alias-label-dimmed,#9ca3af);cursor:wait}",
      ".mcp-mgr-btn{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-primary,#111827);font-family:var(--dsw-font-family);cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;line-height:20px;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.04)}",
      ".mcp-mgr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f9fafb);border-color:#d1d5db}",
      ".mcp-mgr-btn:disabled{color:var(--dsw-alias-label-dimmed,#9ca3af);cursor:default}",
      ".mcp-mgr-list{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-base,#ffffff);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}",
      ".mcp-mgr-item{padding:14px 16px;display:flex;flex-direction:column;gap:8px}",
      ".mcp-mgr-item + .mcp-mgr-item{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb)}",
      ".mcp-mgr-itemhead{display:flex;align-items:center;gap:8px;min-width:0}",
      ".mcp-mgr-name{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-dot{width:8px;height:8px;border-radius:999px;flex:none;background:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".mcp-dot[data-status=running]{background:var(--dsw-alias-state-success-primary,#10b981)}",
      ".mcp-dot[data-status=failed]{background:var(--dsw-alias-state-error-primary,#ef4444)}",
      ".mcp-dot[data-status=connecting],.mcp-dot[data-status=loading]{background:var(--dsw-alias-state-warn-label,#f59e0b)}",
      ".mcp-readonly-badge{flex:none;font-size:11px;line-height:16px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:6px;padding:1px 6px;color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}",
      ".mcp-mgr-ops{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none}",
      ".mcp-mgr-del{border:0;background:0 0;color:var(--dsw-alias-label-secondary,#9ca3af);cursor:pointer;border-radius:8px;width:28px;height:28px;display:grid;place-items:center;padding:0}",
      ".mcp-mgr-del:hover:not(:disabled){background:rgba(239,68,68,.1);color:var(--dsw-alias-state-error-primary,#ef4444)}",
      ".mcp-mgr-del:disabled{color:var(--dsw-alias-label-dimmed,#9ca3af);cursor:default}",
      ".mcp-switch{position:relative;display:inline-block;width:38px;height:22px;flex:none;cursor:pointer}",
      ".mcp-switch input{position:absolute;opacity:0;inset:0;margin:0;cursor:inherit}",
      ".mcp-switch-track{position:absolute;inset:0;background:#d1d5db;border-radius:999px;transition:background .15s ease;pointer-events:none}",
      ".mcp-switch-thumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:999px;background:#ffffff;transition:transform .15s ease;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}",
      ".mcp-switch input:checked ~ .mcp-switch-track{background:#10b981}",
      ".mcp-switch input:checked ~ .mcp-switch-thumb{transform:translateX(16px)}",
      ".mcp-switch input:disabled{cursor:pointer}",
      ".mcp-switch input:disabled ~ .mcp-switch-track{opacity:.75}",
      ".mcp-mgr-summary{display:inline-flex;align-items:center;gap:6px;background:0 0;border:0;padding:0;color:var(--dsw-alias-label-secondary,#6b7280);font-family:var(--dsw-font-family);font-size:13px;cursor:pointer;user-select:none;align-self:flex-start}",
      ".mcp-mgr-summary:hover{color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-mgr-chevron{display:inline-block;width:0;height:0;border-left:4px solid currentColor;border-top:5px solid transparent;border-bottom:5px solid transparent;transition:transform .15s ease;flex:none}",
      ".mcp-mgr-summary[data-open=true] .mcp-mgr-chevron{transform:rotate(90deg)}",
      ".mcp-mgr-name-btn{background:0 0;border:0;padding:0;color:inherit;font-family:inherit;font-size:inherit;font-weight:inherit;cursor:pointer;text-align:left;min-width:0}",
      ".mcp-mgr-name-btn:hover{text-decoration:underline;text-underline-offset:3px}",
      ".mcp-mgr-err{color:var(--dsw-alias-state-error-primary,#ef4444);margin:0;font-size:12px;word-break:break-word}",
      ".mcp-probe{margin:0;font-size:12px;line-height:18px;word-break:break-word}",
      ".mcp-probe[data-tone=run]{color:var(--dsw-alias-label-secondary,#6b7280)}",
      ".mcp-probe[data-tone=ok]{color:var(--dsw-alias-state-success-primary,#10b981)}",
      ".mcp-probe[data-tone=bad]{color:var(--dsw-alias-state-error-primary,#ef4444)}",
      ".mcp-plugin-card{list-style:none;margin:0;border:.5px solid var(--dsw-alias-border-l4,#e5e7eb);border-radius:16px;background:var(--dsw-alias-bg-layer-3,#ffffff);transition:border-color .16s,background .16s}",
      ".mcp-plugin-card:hover{border-color:var(--dsw-alias-label-dimmed,#d1d5db)}",
      ".mcp-plugin-card[data-open=true]{background:var(--dsw-alias-bg-layer-2,#fafafa);border-color:var(--dsw-alias-label-dimmed,#d1d5db)}",
      ".mcp-plugin-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}",
      ".mcp-plugin-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-2px}",
      ".mcp-plugin-headtext{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}",
      ".mcp-plugin-name{color:var(--dsw-alias-label-primary,#111827);font-size:15px;font-weight:600;line-height:1.4}",
      ".mcp-plugin-desc{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:13px;line-height:1.5}",
      ".mcp-plugin-chevron{color:var(--dsw-alias-label-tertiary,#9ca3af);flex:none;transition:transform .16s}",
      ".mcp-plugin-card[data-open=true] .mcp-plugin-chevron{transform:rotate(180deg)}",
      ".mcp-plugin-body{border-top:.5px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding-bottom:8px}",
      ".mcp-plugin-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}",
      ".mcp-plugin-field + .mcp-plugin-field{border-top:.5px solid var(--dsw-alias-border-l2,#e5e7eb)}",
      ".mcp-plugin-field-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary,#111827);font-size:13px;line-height:1.5}",
      ".mcp-plugin-field-label{flex:1;min-width:0;font-weight:500}",
      ".mcp-plugin-badge{flex:none;white-space:nowrap;background:var(--dsw-alias-bg-module-platform,#f3f4f6);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
      ".mcp-plugin-reset{flex:none;font:inherit;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
      ".mcp-plugin-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-plugin-reset:disabled{cursor:default;opacity:.5}",
      ".mcp-plugin-switch{box-sizing:border-box;flex:none;position:relative;width:36px;height:20px;padding:2px;border:0;border-radius:10px;cursor:pointer;background:var(--dsw-alias-border-l3,#d1d5db);transition:background .12s}",
      ".mcp-plugin-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".mcp-plugin-switch:disabled{cursor:default;opacity:.5}",
      ".mcp-plugin-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}",
      ".mcp-plugin-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#ffffff);transition:transform .12s}",
      ".mcp-plugin-switch[aria-checked=true] .mcp-plugin-thumb{transform:translateX(16px)}",
      ".mcp-plugin-hint{color:var(--dsw-alias-label-tertiary,#9ca3af);margin:0;font-size:12px;line-height:1.5}",
      ".mcp-plugin-err{color:var(--dsw-alias-state-error-primary,#ef4444);font-size:12px;line-height:1.5;margin:0;padding-bottom:4px;word-break:break-word}",
      ".mcp-mgr-tools{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}",
      ".mcp-pill-wrap{position:relative;display:inline-flex}",
      ".mcp-pill{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-primary,#374151);border-radius:6px;padding:3px 10px;font-size:12px;line-height:18px;font-family:var(--ds-font-family-code,ui-monospace,monospace);cursor:pointer;transition:all .15s ease;user-select:none}",
      ".mcp-pill:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);border-color:#d1d5db}",
      ".mcp-pill[data-enabled=false]{color:#4b5563 !important;text-decoration:none !important;opacity:1 !important;background:#f3f4f6 !important;border-color:#e5e7eb !important}",
      ".mcp-pill[data-enabled=false]:hover{background:#e5e7eb !important;color:#111827 !important;border-color:#d1d5db !important}",
      ".mcp-tip{display:none;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(17,24,39,.94);color:#fff;border-radius:6px;padding:3px 8px;font-size:11px;line-height:16px;white-space:nowrap;z-index:20;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none}",
      ".mcp-tip::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:rgba(17,24,39,.94)}",
      ".mcp-pill-wrap:hover .mcp-tip{display:block}",
      ".mcp-mgr-note{color:var(--dsw-alias-label-secondary,#6b7280);margin:0}",
      ".mcp-mgr-warn{color:var(--dsw-alias-state-warn-label,#f59e0b);margin:0;font-size:12px}",
      ".mcp-ext{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:12px;word-break:break-all;margin:0}",
      ".mcp-ext-title{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;font-weight:500;margin:0}",
      ".mcp-err{color:var(--dsw-alias-state-error-primary,#ef4444);margin:0;font-size:12px;word-break:break-word}",
      ".mcp-modal{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}",
      ".mcp-modal *{box-sizing:border-box}",
      ".mcp-modal-card{width:540px;max-width:calc(100vw - 24px);max-height:min(96vh,900px);display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,#ffffff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:14px;box-shadow:0 20px 48px -8px rgba(0,0,0,.25);color:var(--dsw-alias-label-primary,#111827);font-family:var(--dsw-font-family);font-size:13px;line-height:20px}",
      ".mcp-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);flex:none;background:var(--dsw-alias-bg-base,#ffffff)}",
      ".mcp-modal-title{font-size:15px;font-weight:600;flex:1 1 auto;min-width:0;margin:0;color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-form-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}",
      ".mcp-form-footer{display:flex !important;justify-content:flex-end !important;align-items:center !important;gap:10px !important;padding:10px 18px !important;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb) !important;background:#f9fafb !important;flex:none !important;box-sizing:border-box !important}",
      ".mcp-form{display:flex;flex-direction:column;gap:10px}",
      ".mcp-form-row{display:flex;flex-direction:column;gap:3px;min-width:0;width:100%}",
      ".mcp-form-label{color:var(--dsw-alias-label-primary,#374151);font-size:12px;font-weight:600;margin:0;display:block}",
      ".mcp-form-label .mcp-req{color:#ef4444}",
      ".mcp-help{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:11px;line-height:15px;margin:1px 0 0 0}",
      ".mcp-in{width:100% !important;max-width:100% !important;box-sizing:border-box !important;border:1px solid var(--dsw-alias-border-l2,#d1d5db) !important;background:var(--dsw-alias-bg-base,#ffffff) !important;color:var(--dsw-alias-label-primary,#111827) !important;font-family:var(--dsw-font-family);border-radius:7px !important;padding:6px 10px !important;font-size:13px !important;min-width:0;outline:none !important;transition:border-color .15s ease,box-shadow .15s ease !important}",
      ".mcp-in:focus{border-color:#10b981 !important;box-shadow:0 0 0 3px rgba(16,185,129,.15) !important}",
      ".mcp-in::placeholder{color:#9ca3af}",
      ".mcp-in-mono{font-family:var(--ds-font-family-code,ui-monospace,monospace) !important;font-size:12px !important}",
      ".mcp-in-area{resize:vertical;min-height:68px !important;line-height:18px;overflow-y:hidden}",
      ".mcp-in-area:focus,.mcp-in-area:hover{overflow-y:auto}",
      ".mcp-in-area-tall{min-height:180px !important;overflow-y:auto}",
      ".mcp-seg{display:flex !important;width:100% !important;gap:4px !important;padding:3px !important;background:#f3f4f6 !important;border:1px solid #e5e7eb !important;border-radius:8px !important;box-sizing:border-box !important}",
      ".mcp-seg-btn{flex:1 1 0% !important;appearance:none !important;-webkit-appearance:none !important;border:1px solid transparent !important;background:transparent !important;color:#6b7280 !important;cursor:pointer !important;border-radius:6px !important;padding:5px 12px !important;font-size:12px !important;line-height:18px !important;font-family:var(--dsw-font-family) !important;text-align:center !important;outline:none !important;transition:all .15s ease !important;box-shadow:none !important}",
      ".mcp-seg-btn:hover:not([data-on=true]):not(:disabled){color:#111827 !important;background:rgba(0,0,0,.04) !important}",
      ".mcp-seg-btn[data-on=true]{background:#ffffff !important;color:#111827 !important;font-weight:600 !important;border-color:#d1d5db !important;box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06) !important}",
      ".mcp-seg-btn:disabled{opacity:.45 !important;cursor:not-allowed !important;background:0 0 !important;color:var(--dsw-alias-label-dimmed,#9ca3af) !important;box-shadow:none !important}",
      ".mcp-check-row{display:flex !important;align-items:center !important;gap:8px !important;cursor:pointer !important;user-select:none !important;color:var(--dsw-alias-label-primary,#374151) !important;font-size:12px !important;margin:2px 0 !important}",
      ".mcp-check-row input[type=checkbox]{appearance:none !important;-webkit-appearance:none !important;width:16px !important;height:16px !important;border:1.5px solid #d1d5db !important;border-radius:4px !important;background:#ffffff !important;cursor:pointer !important;display:inline-grid !important;place-content:center !important;margin:0 !important;outline:none !important;transition:all .15s ease !important;flex:none !important}",
      ".mcp-check-row input[type=checkbox]:hover{border-color:#10b981 !important}",
      ".mcp-check-row input[type=checkbox]:checked{background:#10b981 !important;border-color:#10b981 !important}",
      ".mcp-check-row input[type=checkbox]:checked::after{content:'' !important;width:4px !important;height:8px !important;border:solid #ffffff !important;border-width:0 2px 2px 0 !important;transform:rotate(45deg) !important;margin-top:-2px !important}",
      ".mcp-adv-toggle{appearance:none !important;-webkit-appearance:none !important;display:inline-flex !important;align-items:center !important;gap:6px !important;background:transparent !important;border:0 !important;outline:none !important;color:var(--dsw-alias-label-secondary,#4b5563) !important;font-size:12px !important;font-weight:600 !important;cursor:pointer !important;padding:4px 0 !important;margin-top:2px !important;margin-bottom:1px !important;font-family:var(--dsw-font-family) !important;user-select:none !important}",
      ".mcp-adv-toggle:hover{color:var(--dsw-alias-label-primary,#111827) !important}",
      ".mcp-adv-box{display:flex !important;flex-direction:column !important;gap:10px !important;background:#f9fafb !important;border:1px solid #e5e7eb !important;border-radius:9px !important;padding:10px 12px !important;margin-top:3px !important;margin-bottom:1px !important;box-sizing:border-box !important}",
      ".mcp-btn-secondary{appearance:none !important;-webkit-appearance:none !important;border:1px solid #d1d5db !important;background:#ffffff !important;color:#374151 !important;font-family:var(--dsw-font-family) !important;font-weight:500 !important;cursor:pointer !important;border-radius:7px !important;padding:6px 16px !important;font-size:12px !important;line-height:18px !important;transition:all .15s ease !important;outline:none !important;box-shadow:0 1px 2px rgba(0,0,0,.05) !important}",
      ".mcp-btn-secondary:hover:not(:disabled){background:#f3f4f6 !important;border-color:#9ca3af !important;color:#111827 !important}",
      ".mcp-btn-primary{appearance:none !important;-webkit-appearance:none !important;border:1px solid #059669 !important;background:#10b981 !important;color:#ffffff !important;font-family:var(--dsw-font-family) !important;font-weight:600 !important;cursor:pointer !important;border-radius:7px !important;padding:6px 16px !important;font-size:12px !important;line-height:18px !important;transition:all .15s ease !important;outline:none !important;box-shadow:0 1px 2px rgba(0,0,0,.05) !important}",
      ".mcp-btn-primary:hover:not(:disabled){background:#059669 !important;border-color:#047857 !important}",
      ".mcp-btn-primary:disabled{background:#e5e7eb !important;border-color:#d1d5db !important;color:#9ca3af !important;cursor:not-allowed !important;box-shadow:none !important}",
      ".mcp-btn-danger{appearance:none !important;-webkit-appearance:none !important;border:1px solid #dc2626 !important;background:#ef4444 !important;color:#ffffff !important;font-family:var(--dsw-font-family) !important;font-weight:600 !important;cursor:pointer !important;border-radius:7px !important;padding:6px 16px !important;font-size:12px !important;line-height:18px !important;transition:all .15s ease !important;outline:none !important}",
      ".mcp-btn-danger:hover:not(:disabled){background:#dc2626 !important}",
      ".mcp-card-tools{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:12px;cursor:pointer;user-select:none}",
      ".mcp-card-tools:hover{color:var(--dsw-alias-label-secondary,#6b7280)}",
      ".mcp-card-ops{display:flex;gap:8px;flex-wrap:wrap}",
    ].join("");

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@moon16u/dsh-plugin-mcp-console/McpSection.module.css\"]") === null) {
      var mcpStyleTag = document.createElement("style");
      mcpStyleTag.dataset.plugin = "@moon16u/dsh-plugin-mcp-console";
      mcpStyleTag.dataset.pluginCss = "@moon16u/dsh-plugin-mcp-console/McpSection.module.css";
      mcpStyleTag.textContent = mcpCss;
      document.head.appendChild(mcpStyleTag);
    }

    var McpH = React.createElement;

    function mcpApi(path, options) {
      return fetch("/api/dsh-mcp-console" + path, {
        headers: { "content-type": "application/json" },
        ...options,
      }).then(async function (response) {
        var body = null;
        try {
          body = await response.json();
        } catch {}
        if (!response.ok) {
          var message = body && body.error && body.error.message ? body.error.message : response.status + " " + response.statusText;
          var failure = new Error(message);
          // the console's own prefix route only disappears when the master
          // switch took the composition down — the section reads this to say
          // "disabled" instead of showing a raw API error
          failure.status = response.status;
          throw failure;
        }
        return body;
      });
    }

    /**
     * Whether an mcpApi failure means "the console is switched off" rather than
     * a genuine API error: only our own prefix route answers under
     * /api/dsh-mcp-console, so an authenticated 404 there is the composition
     * being torn down by the `enabled` master switch.
     */
    function mcpConsoleOffline(failure) {
      return Boolean(failure) && failure.status === 404;
    }

    function mcpFill(template, values) {      return String(template).replace(/\{(\w+)\}/g, function (_, key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : "{" + key + "}";
      });
    }

    /** Parse "KEY=VALUE" / "KEY:VALUE" lines into a record. */
    function mcpParseLines(text, separator) {
      var out = {};
      String(text ?? "").split(/\r?\n/).forEach(function (line) {
        var trimmed = line.trim();
        if (trimmed.length === 0) return;
        var at = trimmed.indexOf(separator);
        if (at <= 0) return;
        var key = trimmed.slice(0, at).trim();
        var value = trimmed.slice(at + separator.length).trim();
        if (key.length > 0) out[key] = value;
      });
      return out;
    }

    function mcpFormatLines(record, separator) {
      return Object.keys(record ?? {}).map(function (key) {
        return key + separator + record[key];
      }).join("\n");
    }

    /** The per-server master toggle (mcp-manager-gui-spec §3.3-4). */
    function McpSwitch(props) {
      var t = props.t;
      return McpH("label", {
        className: "mcp-switch",
        title: props.enabled ? t("disable") : t("enable"),
        "aria-label": props.enabled ? t("disable") : t("enable"),
      },
        McpH("input", {
          type: "checkbox",
          checked: props.enabled,
          disabled: props.disabled,
          onChange: function (event) { props.onChange(event.target.checked); },
        }),
        McpH("span", { className: "mcp-switch-track" }),
        McpH("span", { className: "mcp-switch-thumb" }));
    }

    /** One clickable tool pill with hover tooltip (spec §3.4; readOnly: none). */
    function McpToolPill(props) {
      var t = props.t;
      var tool = props.tool;
      return McpH("span", { className: "mcp-pill-wrap" },
        McpH("button", {
          type: "button",
          className: "mcp-pill",
          "data-enabled": tool.enabled ? "true" : "false",
          "aria-pressed": tool.enabled ? "true" : "false",
          disabled: props.disabled,
          onClick: function () { if (props.onToggle) props.onToggle(tool); },
        }, tool.label),
        props.readOnly ? null : McpH("span", { className: "mcp-tip" }, tool.enabled ? t("clickToDisable") : t("clickToEnable")));
    }

    /**
     * One probe outcome line ("Test connection"): busy / connected-with-
     * latency / live-status report / failure. null while never probed.
     */
    function mcpProbeLine(probe, t) {
      if (probe.busy === true) {
        return McpH("p", { className: "mcp-probe", "data-tone": "run" }, t("probeBusy"));
      }
      if (probe.ok) {
        return McpH("p", { className: "mcp-probe", "data-tone": "ok" },
          probe.live === true
            ? mcpFill(t("probeLiveOk"), { n: probe.toolCount })
            : mcpFill(t("probeOk"), { n: probe.toolCount, ms: probe.latencyMs }));
      }
      return McpH("p", { className: "mcp-probe", "data-tone": "bad" },
        probe.live === true
          ? mcpFill(t("probeLiveFail"), { error: probe.error || "" })
          : mcpFill(t("probeFail"), { error: probe.error || "" }));
    }

    /**
     * One server item: header row (name + status + badge | test + delete +
     * master switch), summary row (chevron + count, expand trigger), probe
     * result line, tool pills. Read-only entries (profile-declared, review
     * §2-4) hide test, delete, disable switch and pills, and skip tooltips.
     * Editing opens by clicking the server name (the explicit edit button is
     * gone per review §2-2).
     */
    function McpServerItem(props) {
      var t = props.t;
      var server = props.server;
      var open = props.open;
      var readOnly = server.readOnly === true;
      var busy = !readOnly && props.busy === server.name;
      var enabled = server.enabled !== false;
      var summary = enabled
        ? (server.toolCount > 0
          ? mcpFill(t("toolsEnabled"), { n: server.enabledToolCount })
          : t("toolsAvailable"))
        : t("disabled");
      var statusLabel = t(server.status);
      var nameElement = readOnly
        ? McpH("span", { className: "mcp-mgr-name", title: server.name }, server.name)
        : McpH("button", {
            type: "button", className: "mcp-mgr-name mcp-mgr-name-btn",
            title: t("editTitle"), "aria-label": t("editTitle"),
            onClick: function () { props.onEdit(server); },
          }, server.name);
      return McpH("div", { className: "mcp-mgr-item", "data-mcp-server": server.name },
        McpH("div", { className: "mcp-mgr-itemhead" },
          nameElement,
          McpH("span", { className: "mcp-dot", "data-status": server.status, title: statusLabel, key: "dot" }),
          readOnly ? McpH("span", { className: "mcp-readonly-badge", title: t("profileReadOnly") }, t("profileReadOnly")) : null,
          McpH("span", { className: "mcp-mgr-ops" },
            readOnly ? null : McpH("button", {
              type: "button", className: "mcp-mgr-iconbtn",
              disabled: busy || (props.probe && props.probe.busy === true),
              title: t("test"), "aria-label": t("test"),
              onClick: function () { props.onProbe(server); },
            }, McpH(McpIcons.IconLinkOutline16, { size: 14 })),
            readOnly ? null : McpH("button", {
              type: "button", className: "mcp-mgr-del", disabled: busy,
              title: t("remove"), "aria-label": t("remove"),
              onClick: function () { props.onRemove(server); },
            }, McpH(McpIcons.IconTrashOutline16, { size: 14 })),
            McpH(McpSwitch, {
              t: t, enabled: enabled, disabled: busy || readOnly,
              onChange: function (next) { if (!readOnly) props.onToggleServer(server, next); },
            }))),
        McpH("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          McpH("button", {
            type: "button", className: "mcp-mgr-summary", "data-open": open ? "true" : "false",
            "aria-expanded": open ? "true" : "false",
            onClick: function () { props.onToggleOpen(server.name); },
          },
            McpH("span", { className: "mcp-mgr-chevron" }),
            McpH("span", null, summary))),
        props.probe ? mcpProbeLine(props.probe, t) : null,
        server.error ? McpH("p", { className: "mcp-mgr-err" }, t("errorPrefix") + ": " + server.error) : null,
        open
          ? (server.toolCount === 0
            ? McpH("p", { className: "mcp-mgr-note" }, t("noTools"))
            : McpH("div", { className: "mcp-mgr-tools" }, server.tools.map(function (tool) {
              return McpH(McpToolPill, {
                key: tool.name,
                tool: tool,
                t: t,
                readOnly: readOnly,
                disabled: busy || !enabled || readOnly,
                onToggle: readOnly ? null : function (target) { props.onToggleTool(server, target); },
              });
            })))
          : null);
    }

    /**
     * Add/edit form (mcp-manager-modal-spec.md): scrollable body + fixed
     * footer with a right-aligned primary "保存配置" button, segmented
     * transport/scope controls, inline checkbox, natural-language labels with
     * placeholders and helper text instead of bare regex/variable names.
     * Renders as [scrollable body, footer] so the modal card stays flex-column.
     */
    function McpServerForm(props) {
      var t = props.t;
      var initial = props.initial ?? {};
      var isEdit = initial.name !== undefined;
      var useState = React.useState;
      var transportState = useState(initial.transport === "streamable-http" ? "streamable-http" : "stdio");
      var transport = transportState[0], setTransport = transportState[1];
      var nameState = useState(initial.name ?? "");
      var name = nameState[0], setName = nameState[1];
      var commandState = useState(initial.command ?? "");
      var command = commandState[0], setCommand = commandState[1];
      var argsState = useState(Array.isArray(initial.args) ? initial.args.join("\n") : "");
      var args = argsState[0], setArgs = argsState[1];
      var envState = useState(mcpFormatLines(initial.env, "="));
      var env = envState[0], setEnv = envState[1];
      var urlState = useState(initial.url ?? "");
      var url = urlState[0], setUrl = urlState[1];
      var headersState = useState(mcpFormatLines(initial.headers, ":"));
      var headers = headersState[0], setHeaders = headersState[1];
      var timeoutState = useState(String(initial.toolCallTimeoutMs ?? 60000));
      var timeout = timeoutState[0], setTimeoutMs = timeoutState[1];
      var failState = useState(initial.failOnStartupError === true);
      var fail = failState[0], setFail = failState[1];
      var scopeState = useState(initial.scope === "project" ? "project" : "global");
      var scope = scopeState[0], setScope = scopeState[1];
      var advancedState = useState(false);
      var advancedOpen = advancedState[0], setAdvancedOpen = advancedState[1];
      var errorState = useState(null);
      var error = errorState[0], setError = errorState[1];
      var busyState = useState(false);
      var busy = busyState[0], setBusy = busyState[1];

      function collect() {
        var config = {
          name: name.trim(),
          transport: transport,
          enabled: initial.enabled === false ? false : true,
          scope: scope,
          toolCallTimeoutMs: Number(timeout) > 0 ? Number(timeout) : 60000,
          failOnStartupError: fail,
          disabledTools: Array.isArray(initial.disabledTools) ? initial.disabledTools : [],
        };
        if (transport === "stdio") {
          config.command = command.trim();
          config.args = args.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line.length > 0; });
          config.env = mcpParseLines(env, "=");
        } else {
          config.url = url.trim();
          config.headers = mcpParseLines(headers, ":");
        }
        return config;
      }

      function submit() {
        setError(null);
        setBusy(true);
        Promise.resolve(props.onSubmit(collect())).then(function () {
          setBusy(false);
        }, function (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          setBusy(false);
        });
      }

      function fieldRow(key, label, required, control, help) {
        return McpH("div", { className: "mcp-form-row", key: key },
          McpH("label", { className: "mcp-form-label" },
            label,
            required ? McpH("span", { className: "mcp-req", key: "req" }, " *") : null),
          control,
          help ? McpH("p", { className: "mcp-help", key: "help" }, help) : null);
      }

      function seg(options, value, onChange) {
        return McpH("div", { className: "mcp-seg", role: "radiogroup" },
          options.map(function (option) {
            var isOptionDisabled = option.disabled === true;
            return McpH("button", {
              type: "button",
              key: option.value,
              className: "mcp-seg-btn",
              "data-on": value === option.value ? "true" : "false",
              role: "radio",
              "aria-checked": value === option.value ? "true" : "false",
              disabled: isOptionDisabled,
              title: isOptionDisabled ? (option.title || "") : "",
              onClick: function () {
                if (!isOptionDisabled) onChange(option.value);
              },
            }, option.label);
          }));
      }

      var hasProject = props.hasProjectWorkspace === true;

      var body = [
        fieldRow("name", t("formName"), true,
          McpH("input", {
            className: "mcp-in", type: "text", value: name, "aria-label": t("formName"),
            placeholder: t("formNamePlaceholder"),
            disabled: isEdit,
            onChange: function (event) { setName(event.target.value); },
          }),
          t("formNameHelp")),
        fieldRow("transport", t("formTransport"), false,
          seg([
            { value: "stdio", label: t("transportStdio") },
            { value: "streamable-http", label: t("transportHttp") },
          ], transport, setTransport)),
      ];

      if (transport === "stdio") {
        body.push(fieldRow("command", t("formCommand"), true,
          McpH("input", {
            className: "mcp-in mcp-in-mono", type: "text", value: command, "aria-label": t("formCommand"),
            placeholder: t("formCommandPlaceholder"),
            onChange: function (event) { setCommand(event.target.value); },
          })));
        body.push(fieldRow("args", t("formArgs"), false,
          McpH("textarea", {
            className: "mcp-in mcp-in-area", value: args, "aria-label": t("formArgs"), rows: 3,
            placeholder: t("formArgsPlaceholder"),
            onChange: function (event) { setArgs(event.target.value); },
          })));
        body.push(fieldRow("env", t("formEnv"), false,
          McpH("textarea", {
            className: "mcp-in mcp-in-area", value: env, "aria-label": t("formEnv"), rows: 3,
            placeholder: t("formEnvPlaceholder"),
            onChange: function (event) { setEnv(event.target.value); },
          })));
      } else {
        body.push(fieldRow("url", t("formUrl"), true,
          McpH("input", {
            className: "mcp-in mcp-in-mono", type: "text", value: url, "aria-label": t("formUrl"),
            placeholder: t("formUrlPlaceholder"),
            onChange: function (event) { setUrl(event.target.value); },
          })));
        body.push(fieldRow("headers", t("formHeaders"), false,
          McpH("textarea", {
            className: "mcp-in mcp-in-area", value: headers, "aria-label": t("formHeaders"), rows: 3,
            placeholder: t("formHeadersPlaceholder"),
            onChange: function (event) { setHeaders(event.target.value); },
          })));
      }

      body.push(fieldRow("scope", t("formScope"), false,
        seg([
          { value: "global", label: t("scopeGlobal") },
          { value: "project", label: t("scopeProject"), disabled: !hasProject, title: t("scopeProjectDisabledTip") },
        ], hasProject ? scope : "global", setScope),
        !hasProject
          ? t("scopeProjectNoWorkspaceHelp")
          : (scope === "global" ? t("scopeGlobalHelp") : t("scopeProjectHelp"))));

      var advanced = McpH("div", { key: "advanced" },
        McpH("button", {
          type: "button", className: "mcp-adv-toggle",
          "aria-expanded": advancedOpen ? "true" : "false",
          onClick: function () { setAdvancedOpen(!advancedOpen); },
        },
          McpH(McpIcons.IconChevronRightOutline14, { size: 14, style: { transform: advancedOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" } }),
          t("formAdvanced")),
        advancedOpen
          ? McpH("div", { className: "mcp-adv-box" },
              fieldRow("timeout", t("formTimeout"), false,
                McpH("input", {
                  className: "mcp-in", type: "number", min: "1", value: timeout, "aria-label": t("formTimeout"),
                  onChange: function (event) { setTimeoutMs(event.target.value); },
                })),
              McpH("label", { className: "mcp-check-row" },
                McpH("input", {
                  type: "checkbox", checked: fail, "aria-label": t("formFail"),
                  onChange: function (event) { setFail(event.target.checked); },
                }),
                McpH("span", null, t("formFail"))))
          : null);

      return McpH(React.Fragment, null,
        McpH("div", { className: "mcp-form-body" },
          McpH("div", { className: "mcp-form" }, body),
          advanced,
          error ? McpH("p", { className: "mcp-err" }, error) : null),
        McpH("div", { className: "mcp-form-footer" },
          McpH("button", {
            type: "button", className: "mcp-btn-secondary", disabled: busy, onClick: props.onCancel,
          }, t("cancel")),
          McpH("button", {
            type: "button", className: "mcp-btn-primary", disabled: busy, onClick: submit,
          }, t("saveConfig"))));
    }

    /** mcpServers JSON paste-import dialog (plan §5.5), modal-spec styling. */
    function McpImportDialog(props) {
      var t = props.t;
      var useState = React.useState;
      var textState = useState("");
      var text = textState[0], setText = textState[1];
      var previewState = useState(null);
      var preview = previewState[0], setPreview = previewState[1];
      var errorState = useState(null);
      var error = errorState[0], setError = errorState[1];
      var busyState = useState(false);
      var busy = busyState[0], setBusy = busyState[1];

      function reparse(value) {
        setText(value);
        setError(null);
        if (value.trim().length === 0) {
          setPreview(null);
          return;
        }
        try {
          var parsed = JSON.parse(value);
          var map = parsed && typeof parsed === "object" && parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : parsed;
          if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("expected an object");
          setPreview({ count: Object.keys(map).length });
        } catch (failure) {
          setPreview(null);
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }

      function run() {
        setBusy(true);
        setError(null);
        mcpApi("/import", { method: "POST", body: JSON.stringify({ json: text }) }).then(function (result) {
          setBusy(false);
          props.onDone(result);
        }, function (failure) {
          setBusy(false);
          setError(failure instanceof Error ? failure.message : String(failure));
        });
      }

      return McpH(React.Fragment, null,
        McpH("div", { className: "mcp-form-body" },
          McpH("p", { className: "mcp-help", style: { color: "var(--dsw-alias-label-secondary,#4b5563)", fontSize: "12px", lineHeight: "18px" } }, t("importHelp")),
          McpH("textarea", {
            className: "mcp-in mcp-in-area mcp-in-area-tall mcp-in-mono", rows: 10, value: text,
            "aria-label": t("importTitle"),
            placeholder: t("importPlaceholder"),
            onChange: function (event) { reparse(event.target.value); },
          }),
          preview ? McpH("p", { className: "mcp-mgr-note", style: { color: "#10b981", fontWeight: 500 } }, mcpFill(t("importPreviewAdded"), { n: preview.count })) : null,
          error ? McpH("p", { className: "mcp-err" }, error) : null),
        McpH("div", { className: "mcp-form-footer" },
          McpH("button", {
            type: "button", className: "mcp-btn-secondary", disabled: busy, onClick: props.onCancel,
          }, t("cancel")),
          McpH("button", {
            type: "button", className: "mcp-btn-primary",
            disabled: busy || preview === null, onClick: run,
          }, t("importConfirm"))));
    }

    /**
     * The settings section (mcp-manager-gui-spec.md §1–§3): header bar with
     * refresh + add + import, the server list card, and modals.
     */
    function McpSection(props) {
      var t = props.t;
      var useState = React.useState;
      var useEffect = React.useEffect;

      var snapshotState = useState(null);
      var snapshot = snapshotState[0], setSnapshot = snapshotState[1];
      var modeState = useState(null);
      var mode = modeState[0], setMode = modeState[1]; // null | "add" | "edit" | "import"
      var editingState = useState(null);
      var editing = editingState[0], setEditing = editingState[1];
      var busyState = useState(null);
      var busy = busyState[0], setBusy = busyState[1];
      var errorState = useState(null);
      var error = errorState[0], setError = errorState[1];
      var confirmState = useState(null);
      var confirmName = confirmState[0], setConfirm = confirmState[1];
      var expandedState = useState({});
      var expanded = expandedState[0], setExpanded = expandedState[1];
      var refreshingState = useState(false);
      var refreshing = refreshingState[0], setRefreshing = refreshingState[1];
      var probeState = useState({});
      var probes = probeState[0], setProbes = probeState[1]; // name -> {busy}|result
      var offlineState = useState(false);
      var offline = offlineState[0], setOffline = offlineState[1];

      /** A 404 on our own prefix means the master switch took the routes down. */
      function receiveFailure(failure) {
        if (mcpConsoleOffline(failure)) {
          setOffline(true);
          setError(null);
          return;
        }
        setError(failure instanceof Error ? failure.message : String(failure));
      }

      function load() {
        return mcpApi("/servers").then(function (body) {
          setOffline(false);
          setSnapshot(body);
        }, receiveFailure);
      }

      useEffect(function () {
        var stale = false;
        mcpApi("/servers").then(function (body) {
          if (!stale) setSnapshot(body);
        }, function (failure) {
          if (!stale) receiveFailure(failure);
        });
        return function () { stale = true; };
      }, []);

      // Live updates while the settings page is open (plan §5.4 /events).
      // Opened only once data arrived: with the console switched off the route
      // is gone, and EventSource would retry the 404 every few seconds.
      var streamReady = snapshot !== null;
      useEffect(function () {
        if (!streamReady) return undefined;
        var source = new EventSource("/api/dsh-mcp-console/events");
        source.addEventListener("status_changed", function (event) {
          try {
            setSnapshot(JSON.parse(event.data));
          } catch {}
        });
        return function () { source.close(); };
      }, [streamReady]);

      useEffect(function () {
        function onKey(event) {
          if (event.key === "Escape" && mode !== null) setMode(null);
        }
        window.addEventListener("keydown", onKey);
        return function () { window.removeEventListener("keydown", onKey); };
      }, [mode]);

      function withBusy(name, action) {
        setBusy(name);
        setError(null);
        return Promise.resolve(action()).then(function (value) {
          setBusy(null);
          return value;
        }, function (failure) {
          setBusy(null);
          setError(failure instanceof Error ? failure.message : String(failure));
        });
      }

      function refresh() {
        setRefreshing(true);
        withBusy(null, function () {
          return mcpApi("/refresh", { method: "POST" }).then(function () { return load(); });
        }).then(function () { setRefreshing(false); }, function () { setRefreshing(false); });
      }

      function toggleServer(server, next) {
        setSnapshot(function (prev) {
          if (!prev || !prev.servers) return prev;
          return {
            ...prev,
            servers: prev.servers.map(function (s) {
              return s.name === server.name ? { ...s, enabled: next } : s;
            }),
          };
        });
        return withBusy(server.name, function () {
          return mcpApi("/servers/" + encodeURIComponent(server.name) + "/" + (next ? "enable" : "disable"), { method: "POST" });
        });
      }

      function toggleTool(server, tool) {
        var disabled = server.tools.filter(function (item) { return !item.enabled; }).map(function (item) { return item.name; });
        var next = tool.enabled ? disabled.concat([tool.name]) : disabled.filter(function (name) { return name !== tool.name; });
        return withBusy(server.name, function () {
          return mcpApi("/servers/" + encodeURIComponent(server.name), {
            method: "PATCH",
            body: JSON.stringify({ disabledTools: next }),
          });
        });
      }

      function removeServer(server) {
        setConfirm(server.name);
      }

      /**
       * "Test connection" (borrowed from dsh-skills-mcp-manager): the host
       * loads one throwaway official-client fiber, so the outcome (tools,
       * latency, error) is a real handshake result. Results live per card,
       * separate from withBusy so a probe never blocks other controls.
       */
      function probeServer(server) {
        setProbes(function (previous) {
          var next = { ...previous };
          next[server.name] = { busy: true };
          return next;
        });
        mcpApi("/servers/" + encodeURIComponent(server.name) + "/probe", { method: "POST" }).then(
          function (result) {
            setProbes(function (previous) {
              var next = { ...previous };
              next[server.name] = result;
              return next;
            });
          },
          function (failure) {
            setProbes(function (previous) {
              var next = { ...previous };
              next[server.name] = { ok: false, live: false, toolCount: 0, latencyMs: null, error: failure instanceof Error ? failure.message : String(failure) };
              return next;
            });
          });
      }

      function confirmRemove() {
        var name = confirmName;
        setConfirm(null);
        withBusy(name, function () {
          return mcpApi("/servers/" + encodeURIComponent(name), { method: "DELETE" });
        });
      }

      function submitAdd(config) {
        return mcpApi("/servers", { method: "POST", body: JSON.stringify(config) }).then(function () {
          setMode(null);
          setExpanded(function (previous) {
            var next = { ...previous };
            next[config.name] = false;
            return next;
          });
        });
      }

      function submitEdit(config) {
        var body = { ...config };
        delete body.name;
        return mcpApi("/servers/" + encodeURIComponent(config.name), { method: "PATCH", body: JSON.stringify(body) }).then(function () {
          setMode(null);
          setEditing(null);
        });
      }

      var servers = snapshot && snapshot.servers ? snapshot.servers : [];
      var readOnlyServers = snapshot && snapshot.externalServers ? snapshot.externalServers : [];
      var allServers = servers.concat(readOnlyServers);
      var busyAny = busy !== null || refreshing;

      var listChildren = [];
      if (allServers.length === 0) {
        listChildren.push(McpH("div", { className: "mcp-mgr-item", key: "empty" },
          McpH("p", { className: "mcp-mgr-note" }, t("empty"))));
      }
      allServers.forEach(function (server) {
        listChildren.push(McpH(McpServerItem, {
          key: server.name,
          t: t,
          server: server,
          busy: busy,
          open: expanded[server.name] === true,
          onToggleOpen: function (name) {
            setExpanded(function (previous) {
              var next = { ...previous };
              next[name] = !previous[name];
              return next;
            });
          },
          onToggleServer: toggleServer,
          onToggleTool: toggleTool,
          onRemove: removeServer,
          onProbe: probeServer,
          probe: probes[server.name],
          onEdit: function (target) { setEditing(target); setMode("edit"); },
        }));
      });

      var notes = [];
      if (error) notes.push(McpH("p", { className: "mcp-err", key: "api-error" }, t("apiError") + ": " + error));
      (snapshot && snapshot.storeErrors ? snapshot.storeErrors : []).forEach(function (message, index) {
        notes.push(McpH("p", { className: "mcp-mgr-warn", key: "store-" + index }, t("storeError") + ": " + message));
      });
      if (snapshot && snapshot.clientError) {
        notes.push(McpH("p", { className: "mcp-err", key: "client-error" }, t("errorPrefix") + ": " + snapshot.clientError));
      }

      var modal = null;
      if (mode === "add" || mode === "edit") {
        modal = McpH("div", { className: "mcp-modal", key: "modal", onClick: function () { setMode(null); setEditing(null); } },
          McpH("div", { className: "mcp-modal-card", onClick: function (event) { event.stopPropagation(); } },
            McpH("div", { className: "mcp-modal-head" },
              McpH("h3", { className: "mcp-modal-title" }, mode === "add" ? t("addTitle") : t("editTitle")),
              McpH("button", {
                type: "button", className: "mcp-mgr-iconbtn", "aria-label": t("cancel"),
                onClick: function () { setMode(null); setEditing(null); },
              }, McpH(McpIcons.IconCloseOutline16, { size: 14 }))),
            McpH(McpServerForm, {
              t: t,
              initial: editing,
              hasProjectWorkspace: Boolean(snapshot && snapshot.hasProjectWorkspace),
              onSubmit: mode === "add" ? submitAdd : submitEdit,
              onCancel: function () { setMode(null); setEditing(null); },
            })));
      } else if (mode === "import") {
        modal = McpH("div", { className: "mcp-modal", key: "modal", onClick: function () { setMode(null); } },
          McpH("div", { className: "mcp-modal-card", onClick: function (event) { event.stopPropagation(); } },
            McpH("div", { className: "mcp-modal-head" },
              McpH("h3", { className: "mcp-modal-title" }, t("importTitle")),
              McpH("button", {
                type: "button", className: "mcp-mgr-iconbtn", "aria-label": t("cancel"),
                onClick: function () { setMode(null); },
              }, McpH(McpIcons.IconCloseOutline16, { size: 14 }))),
            McpH(McpImportDialog, {
              t: t,
              onCancel: function () { setMode(null); },
              onDone: function (result) {
                setMode(null);
                if (result && result.skipped && result.skipped.length > 0 && result.added.length === 0) {
                  setError(result.skipped.map(function (item) { return item.name + ": " + item.reason; }).join("; "));
                } else {
                  setError(null);
                }
              },
            })));
      } else if (confirmName !== null) {
        modal = McpH("div", { className: "mcp-modal", key: "confirm", onClick: function () { setConfirm(null); } },
          McpH("div", { className: "mcp-modal-card", style: { width: "420px" }, onClick: function (event) { event.stopPropagation(); } },
            McpH("div", { className: "mcp-modal-head" },
              McpH("h3", { className: "mcp-modal-title" }, t("remove")),
              McpH("button", {
                type: "button", className: "mcp-mgr-iconbtn", "aria-label": t("cancel"),
                onClick: function () { setConfirm(null); },
              }, McpH(McpIcons.IconCloseOutline16, { size: 14 }))),
            McpH("div", { className: "mcp-form-body" },
              McpH("p", { className: "mcp-mgr-note" }, t("removeConfirm"))),
            McpH("div", { className: "mcp-form-footer" },
              McpH("button", {
                type: "button", className: "mcp-btn-secondary",
                onClick: function () { setConfirm(null); },
              }, t("confirmNo")),
              McpH("button", {
                type: "button", className: "mcp-btn-danger",
                onClick: confirmRemove,
              }, t("confirmYes")))));
      }

      var topDisabled = refreshing || mode !== null;

      // Master switch off: the whole host side is down, so the page offers the
      // way back instead of actions that cannot work.
      if (offline) {
        return McpH("div", { className: "mcp-mgr", "data-mcp-console-section": "", "data-mcp-console-offline": "" },
          McpH("div", { className: "mcp-mgr-head" },
            McpH("h2", { className: "mcp-mgr-title" }, t("title"))),
          McpH("p", { className: "mcp-mgr-note" }, t("sectionOffline")),
          McpH("p", { className: "mcp-ext" }, t("sectionOfflineHint")));
      }

      return McpH("div", { className: "mcp-mgr", "data-mcp-console-section": "" },
        McpH("div", { className: "mcp-mgr-head" },
          McpH("h2", { className: "mcp-mgr-title" }, t("title")),
          McpH("button", {
            type: "button", className: "mcp-mgr-iconbtn", disabled: refreshing,
            title: t("refresh"), "aria-label": t("refresh"),
            onClick: refresh,
          }, McpH(McpIcons.IconRefreshOutline16, { size: 15 })),
          McpH("button", {
            type: "button", className: "mcp-mgr-btn", disabled: topDisabled,
            onClick: function () { setEditing(null); setMode("add"); },
          }, McpH(McpIcons.IconPlusOutline16, { size: 14 }), t("add")),
          McpH("button", {
            type: "button", className: "mcp-mgr-btn", disabled: topDisabled,
            onClick: function () { setMode("import"); },
          }, t("importAction"))),
        snapshot
          ? McpH("div", { className: "mcp-mgr-list" }, listChildren)
          : McpH("p", { className: "mcp-mgr-note" }, t("loadingData")),
        notes.length > 0 ? McpH("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, notes) : null,
        servers.some(function (server) { return server.tools && server.tools.some(function (tool) { return !tool.enabled; }); })
          ? McpH("p", { className: "mcp-ext" }, t("toolDeniedNote"))
          : null,
        modal);
    }

    var mcpInject = ["slots", "locale"];

    /**
     * Switch for the settings-GUI card: `role="switch"` button matching the
     * official plugin cards on that page (their own component is not exported,
     * so the shape is reproduced rather than imported).
     */
    function McpPluginSwitch(props) {
      return McpH("button", {
        type: "button",
        role: "switch",
        className: "mcp-plugin-switch",
        "aria-checked": props.checked ? "true" : "false",
        "aria-label": props.label,
        disabled: props.disabled,
        onClick: function () { props.onChange(!props.checked); },
      }, McpH("span", { className: "mcp-plugin-thumb" }));
    }

    /**
     * The settings-GUI card body: the enabled / announceToAgent master
     * switches the host registered against the official settings provider.
     * Exported separately from the card shell so the collapsed header and the
     * fields can each be asserted on their own. A toggle writes through the
     * client settings scope (serialized, revision-fenced); external edits
     * arrive through the scope subscription and re-render live.
     */
    function McpPluginCardFields(props) {
      var t = props.t;
      var scope = props.scope;
      var useState = React.useState;
      var bumpState = React.useReducer(function (x) { return x + 1; }, 0);
      var bump = bumpState[1];
      React.useEffect(function () {
        return scope ? scope.subscribe(function () { bump(); }) : undefined;
      }, [scope]);
      var busyState = useState(null); // null | "enabled" | "announceToAgent"
      var busy = busyState[0], setBusy = busyState[1];
      var errorState = useState(null);
      var error = errorState[0], setError = errorState[1];

      function writeFailure(failure) {
        setError(t("pluginCardWriteError") + ": " + (failure && failure.message ? failure.message : String(failure)));
      }

      var snapshot = scope ? scope.getSnapshot() : null;
      if (!snapshot || snapshot.status === "loading") {
        return McpH("div", { className: "mcp-plugin-body" },
          McpH("div", { className: "mcp-plugin-field" },
            McpH("p", { className: "mcp-plugin-hint" }, t("pluginCardLoading"))));
      }
      if (snapshot.status === "unavailable") {
        return McpH("div", { className: "mcp-plugin-body" },
          McpH("div", { className: "mcp-plugin-field" },
            McpH("p", { className: "mcp-plugin-hint" }, t("pluginCardUnavailable"))));
      }
      var value = snapshot.value ?? {};
      var user = snapshot.user && typeof snapshot.user === "object" && !Array.isArray(snapshot.user) ? snapshot.user : {};
      var writable = snapshot.writable !== false;

      function settle(field) {
        return [
          function () { setBusy(null); },
          function (failure) { setBusy(null); writeFailure(failure); },
        ];
      }
      function write(field, next) {
        setBusy(field);
        setError(null);
        var done = settle(field);
        scope.set(field, next).then(done[0], done[1]);
      }
      function reset(field) {
        setBusy(field);
        setError(null);
        var done = settle(field);
        scope.unset(field).then(done[0], done[1]);
      }

      /** One boolean field: label + customized badge + per-field reset + switch, hint below. */
      function field(key, label, help) {
        var overridden = Object.prototype.hasOwnProperty.call(user, key);
        return McpH("div", { className: "mcp-plugin-field", key: key },
          McpH("div", { className: "mcp-plugin-field-head" },
            McpH("span", { className: "mcp-plugin-field-label" }, label),
            overridden ? McpH("span", { className: "mcp-plugin-badge" }, t("pluginCardOverridden")) : null,
            overridden
              ? McpH("button", {
                  type: "button", className: "mcp-plugin-reset", disabled: busy !== null || !writable,
                  onClick: function () { reset(key); },
                }, t("pluginCardReset"))
              : null,
            McpH(McpPluginSwitch, {
              label: label,
              checked: value[key] !== false,
              disabled: !writable || busy !== null,
              onChange: function (next) { write(key, next); },
            })),
          McpH("p", { className: "mcp-plugin-hint" }, help));
      }

      return McpH("div", { className: "mcp-plugin-body" },
        field("enabled", t("pluginCardEnabled"), t("pluginCardEnabledHelp")),
        field("announceToAgent", t("pluginCardAnnounce"), t("pluginCardAnnounceHelp")),
        error ? McpH("p", { className: "mcp-plugin-err" }, error) : null);
    }

    /**
     * The settings-GUI card (settings.plugin.item, keyed "mcp-console"). The
     * plugins tab lists a namespace only when its browser half also registers
     * a card under that key, so this card is what actually surfaces the
     * switches. Shape and collapse behavior follow the official cards on that
     * page: a header button carrying name, description and chevron, with the
     * fields revealed underneath.
     */
    function McpPluginCard(props) {
      var t = props.t;
      var openState = React.useState(false);
      var open = openState[0], setOpen = openState[1];
      var title = t("pluginCardTitle");
      return McpH("li", {
        className: "mcp-plugin-card",
        "data-open": open ? "true" : "false",
        "data-mcp-plugin-card": "",
      },
        McpH("button", {
          type: "button",
          className: "mcp-plugin-header",
          "aria-expanded": open ? "true" : "false",
          "aria-label": (open ? t("pluginCardCollapse") : t("pluginCardExpand")) + ": " + title,
          onClick: function () { setOpen(!open); },
        },
          McpH("span", { className: "mcp-plugin-headtext" },
            McpH("span", { className: "mcp-plugin-name" }, title),
            McpH("span", { className: "mcp-plugin-desc" }, t("pluginCardDesc"))),
          McpH(McpIcons.IconChevronDownOutline14, { size: 14, className: "mcp-plugin-chevron" })),
        open ? McpH(McpPluginCardFields, { t: t, scope: props.scope }) : null);
    }

    function mcpConsoleApply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(McpNS, { zh: mcpZh, en: mcpEn });
      }, "mcp-console: dictionaries");

      var mcpT = ctx.locale.bind(McpNS);

      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "mcp-console",
          order: 12,
          label: function () { return mcpT("nav"); },
          inject: function () { return { t: mcpT }; },
        }, McpSection);
      });

      // Settings-GUI card (settings.plugin.item keyed "mcp-console"): the
      // host half registers the namespace against the official settings
      // provider; this browser half supplies the card the plugins tab pairs
      // with it. Deferred on the settingsScope service so hosts without the
      // settings UI keep the console working (the section above stays).
      ctx.inject(["settingsScope"], function (scope) {
        var settingsScope = scope.settingsScope.bind({ namespace: "mcp-console" });
        scope.slots.inject("settings.plugin.item", function () {
          return scope.slots.register({
            name: "settings.plugin.item",
            key: "mcp-console",
            locale: McpNS,
            inject: function () { return { t: mcpT, scope: settingsScope }; },
          }, McpPluginCard);
        });
      });
    }

    exports.McpSection = McpSection;
    exports.McpServerItem = McpServerItem;
    exports.McpPluginCard = McpPluginCard;
    exports.McpPluginCardFields = McpPluginCardFields;
    exports.mcpConsoleApply = mcpConsoleApply;
    exports.mcpConsoleOffline = mcpConsoleOffline;
    exports.mcpDictionaries = { zh: mcpZh, en: mcpEn };
    exports.mcpInject = mcpInject;

    // ==== end mcp-console client body ====
    return module.exports;
  }
});
