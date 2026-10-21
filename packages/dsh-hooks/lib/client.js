window.__ModuleLoader__.load({
  id: "@moon16u/dsh-hooks",
  factory: (require) => {
    const React = require("react");
    const UI = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;
    const NS = "dsh-hooks";
    const API = "/api/dsh-hooks";
    const en = {
      title: "Hooks", description: "Review lifecycle hooks declared in configuration files.",
      project: "From project configuration", user: "From user configuration", profile: "From profile configuration",
      count: " hooks", refresh: "Refresh", close: "Close", loading: "Loading hooks...",
      empty: "No hooks declared. Add definitions to configuration files; this page only reviews and approves them.",
      unavailable: "Hook service unavailable. Check the host logs and subprocess service.",
      source: "Source", cwd: "Execution directory", event: "Hook type", command: "Command",
      matcher: "Matcher", timeout: "Timeout", seconds: " seconds", mode: "Execution",
      synchronous: "Synchronous", asynchronous: "Background (observation only)", observe: "Observation only",
      maxOutputBytes: "Output limit", contextBytes: "Context limit", bytes: " bytes",
      onError: "On error", continue: "Continue", block: "Block", subagents: "Child sessions",
      yes: "Included", no: "Excluded", watchFiles: "Pinned files", env: "Environment variables",
      none: "None", hash: "Definition fingerprint", detail: "Expand configuration", collapse: "Collapse configuration", more: "Additional configuration",
      openSource: "Open configuration file", openUnavailable: "Opening configuration files is unavailable on this host.",
      trusted: "Approved", pending: "Needs approval", disabled: "Disabled", invalid: "Invalid configuration",
      approve: "Approve", revoke: "Revoke approval",
      enable: "Enable hook", disable: "Disable hook",
      gateOff: "Command hooks are disabled by the profile configuration. Approval will not override that setting.",
      configOff: "Disabled in the source file; change that file to enable it.",
      missing: "This source is no longer available. Refresh the list.",
      updated: "Configuration changed; refresh and review the new definition.", latest: "Latest execution",
      SessionStart: "When a session starts or resumes", UserPromptSubmit: "Before admitting a user message",
      PreToolUse: "Before a tool runs", PostToolUse: "After a tool runs", PermissionRequest: "When native approval is requested",
      Stop: "Before the turn stops", PostCompact: "Before the next request after compaction",
      SessionEnd: "When an agent is disposed", SubagentStart: "When a child run starts", SubagentStop: "When a child run ends",
    };
    const zh = {
      title: "钩子", description: "查看和审批配置文件中声明的生命周期钩子。",
      project: "来自项目配置文件", user: "来自用户配置文件", profile: "来自 Profile 配置文件",
      count: " 个钩子", refresh: "刷新", close: "关闭", loading: "正在加载钩子…",
      empty: "尚未声明钩子。请在配置文件中维护定义；此页面仅用于查看和审批。",
      unavailable: "钩子服务不可用，请检查宿主日志及 subprocess 服务。",
      source: "配置来源", cwd: "执行目录", event: "Hook 类型", command: "命令",
      matcher: "匹配器", timeout: "超时", seconds: " 秒", mode: "执行方式",
      synchronous: "同步", asynchronous: "后台（仅观察）", observe: "仅观察",
      maxOutputBytes: "输出上限", contextBytes: "上下文上限", bytes: " 字节",
      onError: "失败时", continue: "继续", block: "阻断", subagents: "子会话",
      yes: "包含", no: "不包含", watchFiles: "固定内容文件", env: "环境变量",
      none: "无", hash: "定义指纹", detail: "展开配置", collapse: "收起配置", more: "更多配置",
      openSource: "打开配置文件", openUnavailable: "当前宿主不支持打开配置文件。",
      trusted: "已批准", pending: "待审批", disabled: "已停用", invalid: "配置无效",
      approve: "批准", revoke: "撤销批准",
      enable: "启用钩子", disable: "停用钩子",
      gateOff: "Profile 配置已关闭命令钩子；单项批准不会覆盖该设置。",
      configOff: "来源文件已禁用此钩子，需修改原文件后才能启用。",
      missing: "此来源已不存在，请刷新列表。", updated: "配置已变化，请刷新并重新审阅。", latest: "最近执行",
      SessionStart: "当会话开始或恢复时", UserPromptSubmit: "用户消息进入请求前",
      PreToolUse: "工具执行前", PostToolUse: "工具执行后", PermissionRequest: "请求原生权限审批时",
      Stop: "回合结束前", PostCompact: "压缩后的下一次请求前",
      SessionEnd: "Agent 释放时", SubagentStart: "子智能体开始时", SubagentStop: "子智能体结束时",
    };
    const css = `
      .wh-page{font:inherit;color:var(--dsw-alias-label-primary);padding:8px 0 32px}
      .wh-group{margin:0 0 24px}.wh-group-head{display:flex;align-items:center;gap:8px;min-height:28px;margin:0 0 8px}
      .wh-group-head h3{font-size:13px;font-weight:500;line-height:1.5;margin:0}
      .wh-refresh{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:5px;border:0;border-radius:6px;background:transparent;color:#8a8a8a;cursor:pointer}
      .wh-refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f0f0f0);color:var(--dsw-alias-label-primary,#222)}
      .wh-refresh:disabled{opacity:.45;cursor:default}.wh-refresh:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#1677ff);outline-offset:2px}
      /* Keep the native action slot, aligned with this page's title instead of its artwork. */
      [data-plugin-item-detail="dsh-hooks"]{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;padding-top:28px}
      [data-plugin-item-detail="dsh-hooks"]>:first-child,[data-plugin-item-detail="dsh-hooks"]>:first-child>:last-child{display:contents}
      [data-plugin-item-detail="dsh-hooks"]>:first-child>:first-child{grid-area:1/1/2/3;justify-self:start}
      [data-plugin-item-detail="dsh-hooks"]>:first-child>:last-child>:first-child{grid-area:2/1/3/3;margin-top:32px}
      [data-plugin-item-detail="dsh-hooks"]>:first-child>:last-child>:last-child{grid-area:3/2/4/3;align-self:center;margin-top:20px}
      [data-plugin-item-detail="dsh-hooks"]>:nth-child(2){grid-area:3/1/4/2}
      [data-plugin-item-detail="dsh-hooks"]>:last-child{grid-area:4/1/5/3;min-width:0}
      [data-platform=darwin] [data-plugin-item-detail="dsh-hooks"]{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .wh-card{box-sizing:border-box;display:flex;align-items:center;gap:14px;width:100%;padding:18px 20px;margin:8px 0;text-align:left;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:14px;background:transparent;color:inherit;cursor:pointer;font:inherit}
      .wh-card:hover{background:var(--dsw-alias-bg-module-platform,#f6f6f6)}
      .wh-card:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#1677ff);outline-offset:3px}
      .wh-card-text{display:flex;flex:1;flex-direction:column;gap:4px;min-width:0}.wh-card strong{font-size:14px;font-weight:500;overflow-wrap:anywhere}
      .wh-muted{color:var(--dsw-alias-label-secondary,#777);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
      .wh-modal{--wh-accent:#086edb;width:min(850px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100vh - 2 * max(24px,var(--dsh-frame-overlay-top,24px)));max-height:calc(100dvh - 2 * max(24px,var(--dsh-frame-overlay-top,24px)));padding:0;border-radius:22px}
      /* Native Modal content owns header, description, then body. Only the body scrolls. */
      .wh-modal-content{box-sizing:border-box;min-width:0;min-height:0;overflow:hidden;padding:24px;gap:0}
      .wh-modal-content>:not(:last-child){flex-shrink:0}
      .wh-modal-content>div:first-child{gap:12px;align-items:center;padding:0}
      .wh-modal-content h2{display:flex;align-items:center;gap:12px;font-size:23px;line-height:1.3;font-weight:600;min-width:0;overflow-wrap:anywhere}
      .wh-modal-content h2:before{content:"";width:20px;height:20px;flex:none;background:currentColor;opacity:.7;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5'%3E%3Cpath d='M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7Zm0 3h18'/%3E%3C/svg%3E") center/contain no-repeat}
      .wh-modal-content>p{margin:7px 0 18px;padding:0;font-size:15px;line-height:1.5;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,#777)}
      .wh-modal-content>:last-child{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;gap:16px;margin-top:0;padding:0}
      .wh-modal-content>:last-child>*{flex-shrink:0}
      .wh-event{border:1px solid var(--dsw-alias-border-l3,#e5e5e5);border-radius:17px;overflow:hidden;margin:0}
      .wh-event-head{display:flex;align-items:center;gap:14px;padding:16px 20px}
      .wh-event-icon{flex:none;color:var(--dsw-alias-label-primary,#222)}
      .wh-event-head strong{font-size:14px;font-weight:600}.wh-event-head p{margin:3px 0 0}
      .wh-hook+.wh-hook{border-top:1px solid var(--dsw-alias-border-l3,#ddd)}
      .wh-row{display:flex;align-items:center;gap:8px;min-height:46px;padding:7px 16px 7px 50px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#222) 5%,transparent);box-sizing:border-box}
      .wh-row-label{display:block;flex:1;min-width:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
      .wh-row-controls{display:flex;align-items:center;gap:4px;flex:none}
      .wh-state{font-size:11px;color:var(--dsw-alias-label-secondary,#777);white-space:nowrap}
      .wh-icon-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:5px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer}
      .wh-icon-button:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#222) 8%,transparent);color:var(--dsw-alias-label-primary,#222)}
      .wh-icon-button:disabled{opacity:.4;cursor:not-allowed}.wh-icon-button:focus-visible{outline:2px solid var(--wh-accent);outline-offset:2px}
      .wh-switch{display:flex;align-items:center;margin-left:8px;flex:none}
      .wh-switch button[role=switch]{width:40px;height:24px;min-width:40px;--dsw-alias-state-business-primary:var(--wh-accent)}
      .wh-switch button[role=switch][aria-checked=true]{background:var(--wh-accent)}
      .wh-switch button[role=switch]>span{width:20px;height:20px;background:#fff}
      .wh-hook-body{padding:10px 14px 14px 50px}.wh-hook-body[hidden]{display:none}
      .wh-hook-notice{margin:8px 16px 8px 50px}
      .wh-details{margin-top:8px}.wh-details summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#777);padding:6px 0}
      .wh-fields{display:grid;grid-template-columns:80px minmax(0,1fr);gap:10px 16px;padding:16px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:10px;margin:0;font-size:13px;line-height:1.5}
      .wh-fields dt{color:var(--dsw-alias-label-secondary,#777)}.wh-fields dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}
      .wh-fields code{font-family:var(--dsw-font-mono,monospace);font-size:12px}
      .wh-details .wh-fields{margin-top:4px}
      .wh-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.wh-error{color:var(--dsw-alias-state-error-primary,#bf3333);font-size:12px;overflow-wrap:anywhere}
      .wh-actions .wh-state{margin-left:auto}
      @media(max-width:560px){.wh-card{padding:16px}.wh-modal-content{padding:18px 14px}.wh-modal-content h2{font-size:20px}.wh-modal-content>p{font-size:13px;margin-bottom:14px}.wh-event-head{padding:14px;gap:10px}.wh-row{padding:8px 10px 8px 14px;gap:6px}.wh-row-label{font-size:13px}.wh-row-controls{gap:2px}.wh-state{font-size:10px}.wh-switch{margin-left:4px}.wh-hook-body{padding:10px}.wh-hook-notice{margin:8px 10px}.wh-fields{grid-template-columns:64px minmax(0,1fr);gap:10px;padding:12px;font-size:12px}.wh-fields code{font-size:11px}.wh-modal{width:calc(100vw - 24px);max-width:calc(100vw - 24px)}}
    `;
    async function request(path, data, signal) {
      const response = await fetch(API + path, data === undefined ? { credentials: "same-origin", signal } : {
        method: "POST", credentials: "same-origin", signal,
        headers: { "content-type": "application/json", "x-dsh-hook-ui": "1" }, body: JSON.stringify(data),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      return response.json();
    }
    const sameDefinition = (a, b) => !!a && !!b && a.key === b.key && a.cwd === b.cwd && a.hash === b.hash;
    async function approveHook(entry, review) {
      const selection = { cwd: entry.cwd, key: entry.key, hash: entry.hash };
      const receipt = sameDefinition(review?.entry, entry) ? review : await request("/review", selection);
      if (!sameDefinition(receipt.entry, entry) || !receipt.nonce) throw new Error("Hook changed; refresh and review it again");
      // The Approve click is consent; retain the server's one-use, exact-definition check.
      await request("/action", { action: "trust", ...selection, nonce: receipt.nonce, confirmation: "RUN AS DSH USER" });
      if (receipt.entry.disabled) await request("/action", { action: "enable", ...selection });
    }
    const basename = (path) => path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path;
    function sourceCards(views) {
      return views.flatMap((view) => view.sources.filter((source) => source.count > 0 || source.error).map((source) => ({
        key: JSON.stringify([view.cwd, source.id]), cwd: view.cwd, source,
        title: source.label === "project" ? basename(view.cwd) : source.label === "profile" ? source.id : basename(view.cwd),
        entries: view.entries.filter((entry) => entry.source === source.id),
        enabled: view.enabled, history: view.history ?? [],
      })));
    }
    function fields(entry, t, fullEnv = false) {
      const env = fullEnv ? Object.entries(entry.env ?? {}).map(([key, value]) => `${key}=${value}`).join("\n")
        : (Array.isArray(entry.env) ? entry.env : Object.keys(entry.env ?? {})).join(", ");
      return [
        [t("event"), entry.event], [t("command"), entry.command], [t("matcher"), entry.matcher],
        [t("timeout"), entry.timeout + t("seconds")],
        [t("mode"), t(entry.async ? "asynchronous" : ["SessionEnd", "SubagentStart", "SubagentStop"].includes(entry.event) ? "observe" : "synchronous")],
        [t("source"), entry.source], [t("cwd"), entry.cwd],
        [t("maxOutputBytes"), entry.maxOutputBytes + t("bytes")], [t("contextBytes"), entry.contextBytes + t("bytes")],
        [t("onError"), t(entry.onError)], [t("subagents"), t(entry.subagents ? "yes" : "no")],
        [t("watchFiles"), (entry.watchFiles ?? []).join("\n") || t("none")], [t("env"), env || t("none")],
        [t("hash"), entry.hash ?? t("invalid")],
      ];
    }
    function FieldList({ entry, t, fullEnv = false }) {
      const values = fields(entry, t, fullEnv);
      const list = (rows) => h("dl", { className: "wh-fields" }, ...rows.flatMap(([label, value]) => [
        h("dt", { key: `label:${label}` }, label), h("dd", { key: `value:${label}` },
          [t("command"), t("matcher"), t("source"), t("cwd"), t("hash"), t("env"), t("watchFiles")].includes(label) ? h("code", null, value) : value),
      ]));
      return h("div", null, list(values.slice(0, 4)),
        h("details", { className: "wh-details" }, h("summary", null, t("more")), list(values.slice(4))));
    }
    function FolderIcon() {
      return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true },
        h("path", { d: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7Zm0 3h18" }));
    }
    function HookIcon() {
      return h("svg", { className: "wh-event-icon", width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
        h("circle", { cx: 12, cy: 5, r: 2 }), h("path", { d: "M12 7v12m-7-8H3v4a5 5 0 0 0 9 3 5 5 0 0 0 9-3v-4h-2M3 11l2-2m16 2-2-2" }));
    }
    function RowIcon({ open = false, source = false }) {
      return h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        source ? h("path", { d: "M14 4h6v6m0-6-9 9M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" })
          : h("path", { d: open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6" }));
    }
    function HookRow({ entry, index = 1, card, t, busy, review, onReview, onAction, onApprove, onCancel, onOpenSource }) {
      const [expanded, setExpanded] = React.useState(false);
      const panelId = React.useId();
      const reviewing = sameDefinition(review?.entry, entry);
      const open = expanded || reviewing;
      const approved = entry.trusted && !entry.error;
      const active = approved && !entry.disabled && entry.enabled && card.enabled;
      const latest = card.history.find((run) => run.key === entry.key);
      const label = entry.statusMessage || entry.id;
      const state = t(entry.error ? "invalid" : !approved ? "pending" : entry.disabled || !entry.enabled ? "disabled" : "trusted");
      return h("div", { className: "wh-hook" },
        h("div", { className: "wh-row" },
          h("span", { className: "wh-row-label" }, `${index} - ${label}`),
          h("div", { className: "wh-row-controls" },
            !approved || entry.disabled || !entry.enabled ? h("span", { className: "wh-state" }, state) : null,
            onOpenSource && entry.sourceLabel !== "profile" ? h("button", { type: "button", className: "wh-icon-button", title: t("openSource"),
              "aria-label": `${t("openSource")}: ${label}`, disabled: busy, onClick: () => onOpenSource(entry) }, h(RowIcon, { source: true })) : null,
            h("button", { type: "button", className: "wh-icon-button wh-expand", title: t(open ? "collapse" : "detail"),
              "aria-label": `${t(open ? "collapse" : "detail")}: ${label}`, "aria-expanded": open, "aria-controls": panelId,
              disabled: busy, onClick: () => { if (reviewing) onCancel(); setExpanded(!open); } }, h(RowIcon, { open })),
            h("span", { className: "wh-switch" }, h(UI.Switch, { label: `${t(active ? "disable" : "enable")}: ${label} (${state})`, checked: active,
              disabled: busy || !!entry.error || !entry.enabled || !card.enabled,
              onChange: () => {
                if (approved) onAction(entry.disabled ? "enable" : "disable", entry);
                else { setExpanded(true); onReview(entry); }
              } })))),
        entry.error ? h("p", { className: "wh-error wh-hook-notice", role: "alert" }, entry.error) : null,
        !entry.enabled ? h("p", { className: "wh-muted wh-hook-notice" }, t("configOff")) : null,
        h("div", { className: "wh-hook-body", id: panelId, hidden: !open },
          h(FieldList, { key: reviewing ? review.nonce : entry.hash, entry: reviewing ? review.entry : entry, t, fullEnv: reviewing }),
          latest ? h("p", { className: "wh-muted" }, `${t("latest")}: ${latest.status} · ${latest.startedAt}`) : null,
          h("div", { className: "wh-actions" },
            approved ? h(UI.Button, { variant: "ghost", disabled: busy, onClick: () => onAction("revoke", entry) }, t("revoke"))
              : h(UI.Button, { variant: "primary", disabled: busy || !!entry.error || !entry.enabled || !card.enabled,
                onClick: () => onApprove(entry) }, t("approve")),
            approved ? h("span", { className: "wh-state" }, state) : null)));
    }
    function createRefreshControl() {
      let snapshot = { disabled: true, loading: true };
      let callback;
      const listeners = new Set();
      const publish = (next) => { snapshot = next; listeners.forEach((listener) => listener()); };
      return {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        getSnapshot: () => snapshot,
        connect: (refresh, loading, busy) => {
          callback = refresh;
          publish({ disabled: loading || busy, loading });
          return () => {
            if (callback !== refresh) return;
            callback = undefined;
            publish({ disabled: true, loading: false });
          };
        },
        refresh: () => {
          if (!callback || snapshot.disabled) return;
          const run = callback;
          publish({ disabled: true, loading: true });
          return run();
        },
      };
    }
    function RefreshAction({ subject, t, refreshControl }) {
      if (subject.kind !== "item" || subject.id !== "dsh-hooks") return null;
      return h(RefreshButton, { t, refreshControl });
    }
    function RefreshButton({ t, refreshControl }) {
      const state = React.useSyncExternalStore(refreshControl.subscribe, refreshControl.getSnapshot, refreshControl.getSnapshot);
      return h("button", { type: "button", className: "wh-refresh", title: t("refresh"),
        "aria-label": t("refresh"), "aria-busy": state.loading, disabled: state.disabled, onClick: refreshControl.refresh },
        h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5,
          strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        h("path", { d: "M3 12a9 9 0 0 1 15.36-6.36L21 8m0-5v5h-5" }),
        h("path", { d: "M21 12a9 9 0 0 1-15.36 6.36L3 16m5 0H3v5" })));
    }
    function HooksPage({ t, view: surface, openSource, refreshControl }) {
      if (surface === "summary") return t("description");
      return h(ApprovalPage, { t, openSource, refreshControl });
    }
    function ApprovalPage({ t, openSource, refreshControl }) {
      const [views, setViews] = React.useState([]);
      const [selected, setSelected] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState("");
      const [review, setReview] = React.useState(null);
      const generation = React.useRef(0);
      const actionPending = React.useRef(false);
      const close = () => { setSelected(null); setReview(null); setError(""); };
      const refresh = async (signal) => {
        const current = ++generation.current;
        setLoading(true); setReview(null);
        try {
          const first = await request("/status", undefined, signal);
          const rest = await Promise.all(first.roots.filter((cwd) => cwd !== first.cwd).map((cwd) => request(`/status?cwd=${encodeURIComponent(cwd)}`, undefined, signal)));
          if (current === generation.current) { setViews([first, ...rest]); setError(""); }
        } catch (failure) { if (current === generation.current && !signal?.aborted) setError(failure.message); }
        finally { if (current === generation.current) setLoading(false); }
      };
      React.useEffect(() => {
        const abort = new AbortController(); void refresh(abort.signal);
        return () => { generation.current++; abort.abort(); };
      }, []);
      React.useEffect(() => refreshControl?.connect(() => refresh(), loading, busy), [refreshControl, loading, busy]);
      const act = async (callback) => {
        if (actionPending.current) return;
        actionPending.current = true;
        setBusy(true); setError("");
        try { await callback(); } catch (failure) { setError(failure.message); }
        finally { actionPending.current = false; setBusy(false); }
      };
      const cards = sourceCards(views);
      const card = cards.find((item) => item.key === selected);
      const onAction = (action, entry) => act(async () => {
        await request("/action", { action, cwd: entry.cwd, key: entry.key, hash: entry.hash }); await refresh();
      });
      const onReview = (entry) => act(async () => {
        setReview(null);
        setReview(await request("/review", { cwd: entry.cwd, key: entry.key, hash: entry.hash }));
      });
      const onOpenSource = openSource ? (entry) => act(() => openSource(entry.source)) : undefined;
      const onApprove = (entry) => act(async () => {
        try { await approveHook(entry, review); }
        finally { setReview(null); }
        await refresh();
      });
      const alert = error ? h("p", { role: "alert", className: "wh-error" }, error) : null;
      const groups = ["project", "user", "profile"].map((kind) => ({
        kind, items: cards.filter((item) => item.source.label === kind),
      })).filter((group) => group.items.length);
      return h("div", { className: "wh-page" }, h("style", null, css),
        !selected ? alert : null,
        loading ? h("p", { role: "status", className: "wh-muted" }, t("loading")) : null,
        !loading && !cards.length ? h("p", { className: "wh-muted" }, error ? t("unavailable") : t("empty")) : null,
        ...groups.map(({ kind, items }) => {
          return h("section", { key: kind, className: "wh-group" },
            h("div", { className: "wh-group-head" }, h("h3", null, t(kind))),
            ...items.map((item) => h("button", { key: item.key, type: "button", className: "wh-card",
              onClick: () => { setSelected(item.key); setReview(null); setError(""); } },
              h(FolderIcon), h("span", { className: "wh-card-text" }, h("strong", null, item.title),
                h("span", { className: "wh-muted" }, item.entries.length + t("count"))), h("span", { "aria-hidden": true }, ">"))));
        }),
        selected ? h(UI.Modal, { open: true, title: card?.title ?? t("title"), description: card?.cwd,
          closeLabel: t("close"), className: "wh-modal", contentClassName: "wh-modal-content", onClose: busy ? () => {} : close },
          alert,
          !card ? h("p", { className: "wh-muted" }, t("missing")) : h(React.Fragment, null,
            !card.enabled ? h("p", { className: "wh-muted", role: "status" }, t("gateOff")) : null,
            card.source.error ? h("p", { role: "alert", className: "wh-error" }, card.source.error) : null,
            ...[...new Set(card.entries.map((entry) => entry.event))].map((event) => h("section", { key: event, className: "wh-event" },
              h("header", { className: "wh-event-head" }, h(HookIcon), h("div", null, h("strong", null, event), h("p", { className: "wh-muted" }, t(event)))),
              ...card.entries.filter((entry) => entry.event === event).map((entry, index) => h(HookRow, {
                key: entry.key, entry, index: index + 1, card, t, busy, review, onReview, onAction, onApprove, onOpenSource,
                onCancel: () => setReview(null),
              })))))) : null);
    }
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "hooks: locale");
      const t = ctx.locale.bind(NS);
      const refreshControl = createRefreshControl();
      ctx.slots.inject("plugins.detail.actions", () => ctx.slots.register({
        name: "plugins.detail.actions", id: "dsh-hooks-refresh", order: 45, locale: NS,
        inject: () => ({ t, refreshControl }),
      }, RefreshAction));
      ctx.slots.inject("plugins.item", () => ctx.slots.register({
        name: "plugins.item", id: "dsh-hooks", order: 45, locale: NS,
        label: () => t("title"), inject: () => {
          const session = ctx.remote.session;
          return { t, refreshControl, openSource: typeof session?.openWorkspacePath === "function" ? async (path) => {
            const result = await session.openWorkspacePath({ path });
            if (!result.ok) throw new Error(result.error?.message || t("openUnavailable"));
          } : undefined };
        },
      }, HooksPage));
    }
    return { apply, inject: ["slots", "locale", "remote", "remote.session"], HooksPage, ApprovalPage, HookRow, FieldList, fields, sourceCards, RefreshAction, RefreshButton, createRefreshControl, approveHook };
  },
});
