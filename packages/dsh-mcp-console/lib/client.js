window.__ModuleLoader__.load({
  id: "@moon16u/dsh-mcp-console",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    // ==== mcp-console client body ====

    var McpIcons = require("@deepseek-ai/dsh-client-ui-primitives");
    var IconRefresh = McpIcons.IconRefreshOutlineRegular || McpIcons.IconRefreshOutline16;
    var IconPlus = McpIcons.IconPlusOutlineRegular || McpIcons.IconPlusOutline16;
    var IconClose = McpIcons.IconCloseOutlineRegular || McpIcons.IconCloseOutline16;
    var IconTrash = McpIcons.IconTrashOutlineRegular || McpIcons.IconTrashOutline16;
    var IconLink = McpIcons.IconLinkOutlineRegular || McpIcons.IconLinkOutline16;
    var IconChevronRight = McpIcons.IconChevronRightOutlineRegular || McpIcons.IconChevronRightOutline14;
    var IconChevronDown = McpIcons.IconChevronDownOutlineRegular || McpIcons.IconChevronDownOutline14;

    // ---------------------------------------------------------------------------
    // mcp-console client: an "MCP" settings section (mcp-manager-gui-spec.md)
    // over /api/dsh-mcp-console/*. All identifiers carry an Mcp/mcp prefix.
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
      reconnect: "重连",
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
      formMaxInstruction: "服务器指令字节上限",
      formMaxInstructionPlaceholder: "留空使用官方默认值 (32768)",
      formMaxInstructionInvalid: "指令字节上限必须是正整数",
      formReconnect: "重连策略",
      formReconnectPlaceholder: "每行一个 key=value，例如:\nmaxAttempts=5\ninitialDelayMs=1000",
      formReconnectHelp: "可选 enabled / initialDelayMs / maxDelayMs / maxAttempts；留空使用官方默认值",
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
      handoffNotice: "安装后自动接管；卸载后全局配置交回官方客户端。带工具级禁用的服务器返还为停用，限制记录保留；项目配置留在原项目，不转为全局。",
      handoffSummary: "配置接管与卸载说明",
      handoffStatus: "自动接管",
      pluginCardDesc: "MCP 服务器的连接、工具开关与导入。",
      pluginCardAnnounce: "向模型公告 MCP 管理能力",
      pluginCardAnnounceHelp: "告知模型直接编辑插件配置 dsh-mcp.json，保存后同步配置。",
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
      reconnect: "Reconnect",
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
      formMaxInstruction: "Server instruction byte cap",
      formMaxInstructionPlaceholder: "Leave empty for the official default (32768)",
      formMaxInstructionInvalid: "The instruction byte cap must be a positive integer",
      formReconnect: "Reconnect policy",
      formReconnectPlaceholder: "One key=value per line, e.g.:\nmaxAttempts=5\ninitialDelayMs=1000",
      formReconnectHelp: "Optional enabled / initialDelayMs / maxDelayMs / maxAttempts; empty uses the official defaults",
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
      handoffNotice: "Installed: automatic takeover. Removed: global configuration returns to the official client. Tool-restricted servers return disabled with restrictions preserved; project configuration stays in its project, never promoted to global.",
      handoffSummary: "Configuration ownership & uninstall",
      handoffStatus: "Automatic takeover",
      pluginCardDesc: "Connections, per-tool switches and import for MCP servers.",
      pluginCardAnnounce: "Announce MCP management to the model",
      pluginCardAnnounceHelp: "Tell the model to edit dsh-mcp.json directly, then sync configuration.",
      pluginCardUnavailable: "Plugin settings are not exposed to this client (read-only or local mode).",
      pluginCardLoading: "Loading…",
      pluginCardWriteError: "Write failed",
    };

    var mcpCss = [
      ".mcp-console-page{width:100%;max-width:760px;min-width:0;display:flex;flex-direction:column;gap:24px;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-console-page,.mcp-console-page *{box-sizing:border-box}",
      ".mcp-console-preferences{display:flex;flex-direction:column;gap:12px}",
      ".mcp-handoff{padding:12px 0 0;border-top:.5px solid var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1.6}",
      ".mcp-handoff-summary{display:flex;align-items:center;gap:8px;min-height:28px;cursor:pointer;list-style:none;user-select:none}",
      ".mcp-handoff-summary::-webkit-details-marker{display:none}",
      ".mcp-handoff-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:3px;border-radius:4px}",
      ".mcp-handoff-arrow{display:inline-flex;flex:none;transition:transform .15s ease}",
      ".mcp-handoff[open] .mcp-handoff-arrow{transform:rotate(90deg)}",
      ".mcp-handoff-label{flex:1;min-width:0}",
      ".mcp-handoff-status{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".mcp-handoff-status::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".mcp-handoff-copy{margin:10px 0 2px;padding-left:22px;font-size:12px;line-height:1.75;overflow-wrap:anywhere}",
      "@media(max-width:480px){.mcp-console-page{gap:20px}.mcp-handoff-summary{flex-wrap:wrap}.mcp-handoff-label{flex-basis:60%}.mcp-handoff-copy{padding-left:0}.mcp-console-page .mcp-mgr-head{flex-wrap:wrap;gap:8px}.mcp-console-page .mcp-mgr-title{flex-basis:100%}}",
      "@media(prefers-reduced-motion:reduce){.mcp-console-page .mcp-handoff-arrow,.mcp-console-page .mcp-plugin-switch,.mcp-console-page .mcp-plugin-thumb{transition:none}}",
      ".mcp-mgr{color:var(--dsw-alias-label-primary,#111827);font-family:var(--dsw-font-family);font-size:13px;line-height:20px;display:flex;flex-direction:column;gap:14px;max-width:760px;box-sizing:border-box}",
      ".mcp-mgr *{box-sizing:border-box}",
      ".mcp-mgr-head{display:flex;align-items:center;gap:10px}",
      ".mcp-mgr-title{font-size:17px;font-weight:600;margin:0;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mcp-mgr-iconbtn{border:0;background:0 0;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;border-radius:8px;width:30px;height:30px;display:grid;place-items:center;flex:none;padding:0}",
      ".mcp-mgr-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-mgr-iconbtn:disabled{color:var(--dsw-alias-label-dimmed,#9ca3af);cursor:wait}",
      // A refresh keeps the icon at its normal color and spins it; the disabled
      // dimming was the entire feedback, and at ~50 ms it read as a blink.
      ".mcp-mgr-iconbtn[data-busy=true]{color:var(--dsw-alias-label-secondary,#6b7280);cursor:progress}",
      ".mcp-spin{animation:mcp-spin .8s linear infinite;transform-origin:50% 50%}",
      "@keyframes mcp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
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
      ".mcp-plugin-body{margin:0}",
      ".mcp-plugin-field{padding:6px 0}",
      ".mcp-plugin-field + .mcp-plugin-field{border-top:.5px solid var(--dsw-alias-border-l2,#e5e7eb)}",
      ".mcp-plugin-field-head{display:flex;align-items:flex-start;gap:20px;color:var(--dsw-alias-label-primary,#111827);font-size:13px;line-height:1.5}",
      ".mcp-plugin-field-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}",
      ".mcp-plugin-field-label{font-size:13px;line-height:20px;font-weight:600}",
      ".mcp-plugin-switch{box-sizing:border-box;flex:none;position:relative;width:36px;height:20px;padding:2px;border:0;border-radius:10px;cursor:pointer;background:var(--dsw-alias-border-l3,#d1d5db);transition:background .12s}",
      ".mcp-plugin-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".mcp-plugin-switch:disabled{cursor:default;opacity:.5}",
      ".mcp-plugin-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}",
      ".mcp-plugin-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#ffffff);transition:transform .12s}",
      ".mcp-plugin-switch[aria-checked=true] .mcp-plugin-thumb{transform:translateX(16px)}",
      ".mcp-plugin-hint{color:var(--dsw-alias-label-secondary,#6b7280);margin:0;font-size:12px;line-height:1.65;overflow-wrap:anywhere}",
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

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@moon16u/dsh-mcp-console/McpSection.module.css\"]") === null) {
      var mcpStyleTag = document.createElement("style");
      mcpStyleTag.dataset.plugin = "@moon16u/dsh-mcp-console";
      mcpStyleTag.dataset.pluginCss = "@moon16u/dsh-mcp-console/McpSection.module.css";
      mcpStyleTag.textContent = mcpCss;
      document.head.appendChild(mcpStyleTag);
    }

    var McpH = React.createElement;

    function mcpSessionId() {
      try {
        var sessions = globalThis.__dshMcpConsoleSession;
        var id = typeof sessions === "function" ? sessions() : sessions;
        return typeof id === "string" && id ? id : "";
      } catch {
        return "";
      }
    }

    function mcpWithSession(path) {
      var id = mcpSessionId();
      if (!id) return path;
      return path + (path.indexOf("?") >= 0 ? "&" : "?") + "sessionId=" + encodeURIComponent(id);
    }

    function mcpApi(path, options) {
      return fetch("/api/dsh-mcp-console" + mcpWithSession(path), {
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
          failure.status = response.status;
          throw failure;
        }
        return body;
      });
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

    /**
     * The disabledTools list after clicking one tool pill.
     *
     * Based on the STORED list, never on the live tool list: a server that is
     * currently down exposes no tools, so rebuilding from the live list would
     * silently erase every per-tool restriction on the next unrelated toggle.
     */
    function mcpNextDisabledTools(server, tool) {
      var stored = Array.isArray(server && server.disabledTools) ? server.disabledTools : [];
      var rest = stored.filter(function (name) { return name !== tool.name; });
      return tool.enabled ? rest.concat([tool.name]) : rest;
    }

    /**
     * `reconnect` as the advanced box shows it: one `key=value` per line, the
     * four options the official client accepts. An absent policy stays empty
     * (the official defaults apply).
     */
    var MCP_RECONNECT_KEYS = ["enabled", "initialDelayMs", "maxDelayMs", "maxAttempts"];

    function mcpFormatReconnect(policy) {
      if (!policy || typeof policy !== "object") return "";
      return MCP_RECONNECT_KEYS
        .filter(function (key) { return policy[key] !== undefined; })
        .map(function (key) { return key + "=" + String(policy[key]); })
        .join("\n");
    }

    /** Parse the reconnect box; throws a user-facing message on bad input. */
    function mcpParseReconnect(text) {
      var out = {};
      String(text ?? "").split(/\r?\n/).forEach(function (line) {
        var trimmed = line.trim();
        if (trimmed.length === 0) return;
        var at = trimmed.indexOf("=");
        if (at <= 0) throw new Error("reconnect: expected key=value, got \"" + trimmed + "\"");
        var key = trimmed.slice(0, at).trim();
        var raw = trimmed.slice(at + 1).trim();
        if (MCP_RECONNECT_KEYS.indexOf(key) < 0) throw new Error("reconnect: unknown option \"" + key + "\"");
        if (key === "enabled") {
          if (raw !== "true" && raw !== "false") throw new Error("reconnect.enabled must be true or false");
          out.enabled = raw === "true";
        } else {
          var n = Number(raw);
          if (!Number.isSafeInteger(n) || n < 1) throw new Error("reconnect." + key + " must be a positive integer");
          out[key] = n;
        }
      });
      return Object.keys(out).length > 0 ? out : undefined;
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
            }, McpH(IconLink, { size: 14 })),
            readOnly || !enabled ? null : McpH("button", {
              type: "button", className: "mcp-mgr-iconbtn", disabled: busy,
              title: t("reconnect"), "aria-label": t("reconnect"),
              onClick: function () { props.onReconnect(server); },
            }, McpH(IconRefresh, { size: 14 })),
            readOnly ? null : McpH("button", {
              type: "button", className: "mcp-mgr-del", disabled: busy,
              title: t("remove"), "aria-label": t("remove"),
              onClick: function () { props.onRemove(server); },
            }, McpH(IconTrash, { size: 14 })),
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
      var maxInstructionState = useState(initial.maxInstructionBytes === undefined ? "" : String(initial.maxInstructionBytes));
      var maxInstruction = maxInstructionState[0], setMaxInstruction = maxInstructionState[1];
      var reconnectState = useState(mcpFormatReconnect(initial.reconnect));
      var reconnect = reconnectState[0], setReconnect = reconnectState[1];
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
        // Advanced fields are optional. An empty box means "use the official
        // default": omitting the key does that on add, but PATCH merges over
        // the stored config, so an edit must send null to clear a set value.
        var policy = mcpParseReconnect(reconnect);
        if (policy) config.reconnect = policy;
        else if (isEdit) config.reconnect = null;
        var cap = Number(maxInstruction);
        if (maxInstruction.trim().length > 0) {
          if (!Number.isSafeInteger(cap) || cap < 1) throw new Error(t("formMaxInstructionInvalid"));
          config.maxInstructionBytes = cap;
        } else if (isEdit) config.maxInstructionBytes = null;
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
        var config;
        try {
          config = collect();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          return;
        }
        setBusy(true);
        Promise.resolve(props.onSubmit(config)).then(function () {
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
          McpH(IconChevronRight, { size: 14, style: { transform: advancedOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" } }),
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
                McpH("span", null, t("formFail"))),
              fieldRow("max-instruction", t("formMaxInstruction"), false,
                McpH("input", {
                  className: "mcp-in", type: "number", min: "1", value: maxInstruction,
                  "aria-label": t("formMaxInstruction"),
                  placeholder: t("formMaxInstructionPlaceholder"),
                  onChange: function (event) { setMaxInstruction(event.target.value); },
                })),
              fieldRow("reconnect", t("formReconnect"), false,
                McpH("textarea", {
                  className: "mcp-in mcp-in-area mcp-in-mono", value: reconnect,
                  "aria-label": t("formReconnect"), rows: 4,
                  placeholder: t("formReconnectPlaceholder"),
                  onChange: function (event) { setReconnect(event.target.value); },
                }),
                t("formReconnectHelp")))
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
     * Late-bound settings scope over the official `configForms` entry.
     *
     * The console's sections are registered before the optional `configForms`
     * service resolves, so the scope starts unavailable and is bound to the
     * real form once it arrives. Every subscriber is re-wired at bind time and
     * notified, so a card already on screen switches from "unavailable" to the
     * live switches instead of staying frozen on the first snapshot.
     */
    function createMcpScope() {
      var fallback = { announceToAgent: true };
      var listeners = new Set();
      var bindings = new Map(); // listener -> form disposer
      var form = null;

      function notify() {
        listeners.forEach(function (listener) { try { listener(); } catch (error) {} });
      }

      function release() {
        bindings.forEach(function (off) { if (off) off(); });
        bindings.clear();
      }

      return {
        /** Attach (or detach) the official form; re-wires and notifies. */
        bind: function (next) {
          release();
          form = next && typeof next.getSnapshot === "function" ? next : null;
          if (form && typeof form.subscribe === "function") {
            listeners.forEach(function (listener) { bindings.set(listener, form.subscribe(listener)); });
          }
          notify();
        },
        subscribe: function (listener) {
          listeners.add(listener);
          if (form && typeof form.subscribe === "function") bindings.set(listener, form.subscribe(listener));
          return function () {
            listeners.delete(listener);
            var off = bindings.get(listener);
            if (off) { off(); bindings.delete(listener); }
          };
        },
        getSnapshot: function () {
          if (!form) return { status: "unavailable", value: fallback, user: {}, writable: false };
          var snapshot = form.getSnapshot();
          return {
            status: snapshot.status,
            value: snapshot.value || fallback,
            user: snapshot.user || {},
            writable: snapshot.writable !== false,
          };
        },
        set: function (field, value) {
          if (!form) return Promise.reject(new Error("Official plugin settings are unavailable"));
          return form.set(field, value);
        },
        unset: function (field) {
          if (!form) return Promise.reject(new Error("Official plugin settings are unavailable"));
          return form.unset(field);
        },
      };
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
      // Import outcome line: added / skipped counts plus every reason, kept
      // even on partial success so silently dropped entries stay visible.
      var importNoteState = useState(null);
      var importNote = importNoteState[0], setImportNote = importNoteState[1];
      var expandedState = useState({});
      var expanded = expandedState[0], setExpanded = expandedState[1];
      var refreshingState = useState(false);
      var refreshing = refreshingState[0], setRefreshing = refreshingState[1];
      var probeState = useState({});
      var probes = probeState[0], setProbes = probeState[1]; // name -> {busy}|result
      // Bumped to rebuild the SSE stream after a transport error (the source
      // was closed, and the effect only re-runs when one of its inputs changes).
      var streamEpochState = useState(0);
      var streamEpoch = streamEpochState[0], setStreamEpoch = streamEpochState[1];

      function receiveFailure(failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }

      function load() {
        return mcpApi("/servers").then(function (body) {
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

      // Open SSE only after a successful server snapshot.
      var streamReady = snapshot !== null;
      useEffect(function () {
        if (!streamReady) return undefined;
        var retry = null;
        var source = new EventSource("/api/dsh-mcp-console" + mcpWithSession("/events"));
        source.addEventListener("status_changed", function (event) {
          try {
            setSnapshot(JSON.parse(event.data));
          } catch {}
        });
        // The host is unloading this endpoint; stop the stream.
        source.addEventListener("bye", function () { source.close(); setSnapshot(null); });
        // A transport error says nothing about WHY: EventSource reports the
        // same event for a network blip and for a non-200. Verify with a real
        // request, and reopen the stream only
        // when the console answered.
        source.onerror = function () {
          source.close();
          retry = setTimeout(function () {
            retry = null;
            mcpApi("/servers").then(function (body) {
              setSnapshot(body);
              setStreamEpoch(function (n) { return n + 1; });
            }, receiveFailure);
          }, 2000);
        };
        return function () {
          if (retry) clearTimeout(retry);
          source.close();
        };
      }, [streamReady, streamEpoch]);

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
        if (refreshing) return;
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
        var next = mcpNextDisabledTools(server, tool);
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

      function reconnectServer(server) {
        return withBusy(server.name, function () {
          return mcpApi("/servers/" + encodeURIComponent(server.name) + "/reconnect", { method: "POST" });
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
          onReconnect: reconnectServer,
          probe: probes[server.name],
          onEdit: function (target) { setEditing(target); setMode("edit"); },
        }));
      });

      var notes = [];
      if (error) notes.push(McpH("p", { className: "mcp-err", key: "api-error" }, t("apiError") + ": " + error));
      if (importNote) {
        notes.push(McpH("p", { className: "mcp-mgr-warn", key: "import-summary" }, importNote.summary));
        notes.push(McpH("p", { className: "mcp-mgr-note", key: "import-reasons" }, importNote.reasons.join("; ")));
      }
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
              }, McpH(IconClose, { size: 14 }))),
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
              }, McpH(IconClose, { size: 14 }))),
            McpH(McpImportDialog, {
              t: t,
              onCancel: function () { setMode(null); },
              onDone: function (result) {
                setMode(null);
                var added = result && Array.isArray(result.added) ? result.added : [];
                var skipped = result && Array.isArray(result.skipped) ? result.skipped : [];
                var parseErrors = result && Array.isArray(result.parseErrors) ? result.parseErrors : [];
                var reasons = skipped
                  .map(function (item) { return item.name + ": " + item.reason; })
                  .concat(parseErrors);
                setImportNote(reasons.length > 0 ? {
                  summary: mcpFill(t("importResult"), { added: added.length, skipped: skipped.length }),
                  reasons: reasons,
                } : null);
                if (added.length === 0 && reasons.length > 0) setError(reasons.join("; "));
                else setError(null);
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
              }, McpH(IconClose, { size: 14 }))),
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

      // Only the refresh control reflects refresh progress. Disabling the two
      // write buttons for the same round-trip made the whole header blink.
      var topDisabled = mode !== null;

      return McpH("div", { className: "mcp-mgr", "data-mcp-console-section": "" },
        McpH("div", { className: "mcp-mgr-head" },
          McpH("h2", { className: "mcp-mgr-title" }, t("title")),
          McpH("button", {
            type: "button", className: "mcp-mgr-iconbtn", disabled: refreshing,
            "data-busy": refreshing ? "true" : "false",
            title: t("refresh"), "aria-label": t("refresh"),
            onClick: refresh,
          }, McpH(IconRefresh, { size: 15, className: refreshing ? "mcp-spin" : undefined })),
          McpH("button", {
            type: "button", className: "mcp-mgr-btn", disabled: topDisabled,
            onClick: function () { setEditing(null); setMode("add"); },
          }, McpH(IconPlus, { size: 14 }), t("add")),
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

    // Required only where the console cannot work without them. `configForms`
    // and `sessions` are optional host services: reaching them through
    // ctx.inject() keeps the console alive on hosts that never composed them.
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
     * Announcement preference bound to the official settings provider.
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
      var busyState = useState(null); // null | "announceToAgent"
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
      /** One boolean field: label + switch, hint below. */
      function field(key, label, help) {
        return McpH("div", { className: "mcp-plugin-field", key: key },
          McpH("div", { className: "mcp-plugin-field-head" },
            McpH("div", { className: "mcp-plugin-field-copy" },
              McpH("span", { className: "mcp-plugin-field-label" }, label),
              McpH("p", { className: "mcp-plugin-hint" }, help)),
            McpH(McpPluginSwitch, {
              label: label,
              checked: value[key] !== false,
              disabled: !writable || busy !== null,
              onChange: function (next) { write(key, next); },
            })));
      }

      return McpH("div", { className: "mcp-plugin-body" },
        field("announceToAgent", t("pluginCardAnnounce"), t("pluginCardAnnounceHelp")),
        error ? McpH("p", { className: "mcp-plugin-err" }, error) : null);
    }

    /** The official Plugins page owns the surrounding title and navigation. */
    function McpPluginCard(props) {
      if (props.view === "summary") return props.t("pluginCardDesc");
      return McpH("div", { className: "mcp-console-page" },
        McpH("div", { className: "mcp-console-preferences" },
          McpH(McpPluginCardFields, { t: props.t, scope: props.scope }),
          McpH("details", { className: "mcp-handoff" },
            McpH("summary", { className: "mcp-handoff-summary" },
              McpH("span", { className: "mcp-handoff-arrow", "aria-hidden": "true" }, McpH(IconChevronRight, { size: 14 })),
              McpH("span", { className: "mcp-handoff-label" }, props.t("handoffSummary")),
              McpH("span", { className: "mcp-handoff-status" }, props.t("handoffStatus"))),
            McpH("p", { className: "mcp-handoff-copy" }, props.t("handoffNotice")))),
        McpH(McpSection, { t: props.t }));
    }

    function mcpConsoleApply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(McpNS, { zh: mcpZh, en: mcpEn });
      }, "mcp-console: dictionaries");

      var mcpT = ctx.locale.bind(McpNS);
      var mcpDefaultScope = createMcpScope();

      // One entry owns all MCP UI, even if configuration forms are unavailable.
      ctx.slots.inject("plugins.item", function () {
        return ctx.slots.register({
          name: "plugins.item",
          id: "ui-mcp-console",
          order: 40,
          label: function () { return mcpT("pluginCardTitle"); },
          locale: McpNS,
          inject: function () { return { t: mcpT, scope: mcpDefaultScope }; },
        }, McpPluginCard);
      });
      if (typeof ctx.inject === "function") {
        ctx.inject(["configForms"], function (scope) {
          var form = scope.configForms.get("ui-mcp-console");
          mcpDefaultScope.bind(form);
          scope.effect(function () { return function () {
            mcpDefaultScope.bind(null);
            form.dispose();
          }; }, "mcp-console: settings form");
        });
      }

      /**
       * The session the main view is showing right now. `uiSession.adapter.current`
       * is the retained main-view binding; scanning `sessions.list.byId` only sees
       * which sessions are *retained*, so with several open tabs it answers with an
       * arbitrary one and a project-scope write lands in a different workspace.
       */
      function mcpFocusedSession() {
        try {
          var uiSession = typeof ctx.get === "function" ? ctx.get("uiSession") : undefined;
          var current = uiSession && uiSession.adapter ? uiSession.adapter.current : undefined;
          var key = current && typeof current.getSnapshot === "function" ? current.getSnapshot().key : undefined;
          return typeof key === "string" ? key : "";
        } catch {
          return "";
        }
      }

      // The session id routes the MCP API to the right project store. Without
      // this service the console stays global-only and says so through
      // hasProjectWorkspace=false rather than guessing a workspace.
      if (typeof ctx.inject === "function") {
        ctx.inject(["sessions"], function (scope) {
          var sessions = scope.sessions;
          globalThis.__dshMcpConsoleSession = function () {
            var focused = mcpFocusedSession();
            if (focused) return focused;
            // Fallback for hosts without `uiSession`: the single retained
            // main-view session, if exactly one exists. Ambiguity answers ""
            // (global scope) instead of guessing another workspace.
            try {
              var list = sessions && sessions.list && sessions.list.getSnapshot();
              if (!list) return "";
              var byId = list.byId || {};
              var retained = Object.keys(byId).filter(function (key) {
                return ((byId[key].retainedBy || {}).mainView || 0) > 0;
              });
              return retained.length === 1 ? retained[0] : "";
            } catch { return ""; }
          };
        });
      }
    }

    exports.McpSection = McpSection;
    exports.McpServerItem = McpServerItem;
    exports.McpPluginCard = McpPluginCard;
    exports.McpPluginCardFields = McpPluginCardFields;
    exports.mcpConsoleApply = mcpConsoleApply;
    exports.mcpDictionaries = { zh: mcpZh, en: mcpEn };
    exports.mcpNextDisabledTools = mcpNextDisabledTools;
    exports.mcpInject = mcpInject;

    // The bundle's own entry identity: cordis resolves a client module by its
    // `apply`/`inject` exports, so the prefixed aliases above are not enough.
    exports.apply = mcpConsoleApply;
    exports.inject = mcpInject;

    // ==== end mcp-console client body ====
    return module.exports;
  }
});
