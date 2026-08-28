window.__ModuleLoader__.load({
  id: "@moon16u/dsh-pouch",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var IconCopyOutline16 = require("@deepseek-ai/dsh-client-ui-primitives").IconCopyOutline16;
    var IconCheckOutline16 = require("@deepseek-ai/dsh-client-ui-primitives").IconCheckOutline16;

    var NS = "session-id";

    var zh = {
      "label": "Session ID",
      "copy": "复制会话 ID",
      "copied": "已复制",
      "copyFailed": "复制失败",
    };

    var en = {
      "label": "Session ID",
      "copy": "Copy session ID",
      "copied": "Copied",
      "copyFailed": "Copy failed",
    };

    var css = ".dsh-session-id-copy{border:1px solid var(--dsw-alias-border-l2);min-width:111px;height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex}.dsh-session-id-copy:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsh-session-id-copy:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.dsh-session-id-copy span,.dsh-session-id-copy svg{flex:none}.dsh-session-id-copy span{white-space:nowrap}";

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@moon16u/dsh-pouch/SessionIdAction.module.css\"]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "@moon16u/dsh-pouch";
      tag.dataset.pluginCss = "@moon16u/dsh-pouch/SessionIdAction.module.css";
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function SessionIdAction(props) {
      var sessionId = props.sessionId;
      var t = props.t;
      var useState = React.useState, useRef = React.useRef;
      var copiedState = useState(false), copied = copiedState[0], setCopied = copiedState[1];
      var timerRef = useRef(null);

      function resetTimer() {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }

      function cleanup() {
        resetTimer();
      }

      React.useEffect(function () {
        return cleanup;
      }, []);

      async function copy() {
        var text = String(sessionId);
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else {
            var textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            var ok = document.execCommand("copy");
            textarea.remove();
            if (!ok) throw new Error("execCommand copy failed");
          }
          setCopied(true);
          resetTimer();
          timerRef.current = setTimeout(function () { setCopied(false); }, 2000);
        } catch (e) {
          setCopied(false);
          console.error("[dsh-session-id] copy failed", e);
        }
      }

      return React.createElement("button", {
        type: "button",
        "data-session-id-copy": "",
        "aria-label": copied ? t("copied") : t("copy"),
        title: copied ? t("copied") : t("copy"),
        className: "dsh-session-id-copy",
        onClick: copy,
      },
        React.createElement("span", null, t("label")),
        copied ? React.createElement(IconCheckOutline16, { size: 12 }) : React.createElement(IconCopyOutline16, { size: 12 }));
    }

    // ---------------------------------------------------------------------------
    // dsh-plugin-llm-headers: the Request Headers settings section.
    //
    // The official Models page cannot host this. Its provider card renders a
    // hand-written `<details>` block and the page declares no inner slot, so
    // nothing can add a field there. And a header written into `llm-pi-ai`
    // would be stripped by that adapter's requestHeaders() anyway. So this is
    // its own `settings.section` occupant, editing the `llm-headers` namespace
    // that @moon16u/dsh-plugin-llm-headers serves.
    // ---------------------------------------------------------------------------

    var HEADERS_NS = "llm-headers";
    var PI_AI_NS = "llm-pi-ai";
    var DEEPSEEK_NS = "llm-deepseek";

    var headersZh = {
      "nav": "请求头",
      "description": "为提供方注入请求头。这里的请求头会覆盖 DSH 自己的标识（含 User-Agent），用于按客户端标识鉴权的网关。",
      "empty": "没有已启用的提供方。先在「模型」里配置一个提供方，它就会出现在这里。",
      "unavailable": "此浏览器无法读取设置。",
      "readOnly": "当前设置源只读，无法写入。",
      "loading": "加载中…",
      "headerName": "名称",
      "headerValue": "值（留空 = 移除该请求头）",
      "addHeader": "添加请求头",
      "noHeaders": "未设置请求头。",
      "save": "保存",
      "saving": "保存中…",
      "saved": "已保存",
      "conflict": "设置已被其他窗口修改，请重新打开本页后再试。",
      "moved": "已接管：该提供方的配置已从「模型」移到本页，请求头才能生效。",
      "movedHint": "保存后本提供方由请求头插件接管，「模型」页不再显示它的配置。",
      "duplicate": "该路由同时存在于「模型」配置中，请求头不会生效。请重新保存以完成接管。",
      "inactive": "此路由已在本页声明，但当前没有适配器在服务它——通常是上一次接管没走完。保存一次即可重新登记。",
    };

    var headersEn = {
      "nav": "Request headers",
      "description": "Inject request headers per provider. These outrank the harness's own identity (User-Agent included) — what a gateway that gates on client identity needs.",
      "empty": "No provider is active. Configure one under Models and it will appear here.",
      "unavailable": "Settings are unavailable in this browser.",
      "readOnly": "This settings source is read-only.",
      "loading": "Loading…",
      "headerName": "Name",
      "headerValue": "Value (empty = remove this header)",
      "addHeader": "Add header",
      "noHeaders": "No headers set.",
      "save": "Save",
      "saving": "Saving…",
      "saved": "Saved",
      "conflict": "Settings changed in another window; reopen this page and retry.",
      "moved": "Taken over: this provider's profile moved out of Models so its headers can take effect.",
      "movedHint": "On save this provider is served by the headers plugin; the Models page stops showing its profile.",
      "duplicate": "This route is also configured under Models, so its headers do not apply. Save again to finish the takeover.",
      "inactive": "Declared here but no adapter is serving it — usually a takeover that did not finish. Saving once re-registers it.",
    };

    var headersCss = [
      ".dsh-lh{color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:20px;display:flex;flex-direction:column;gap:16px}",
      ".dsh-lh-note{color:var(--dsw-alias-label-secondary);margin:0}",
      ".dsh-lh-warn{color:var(--dsw-alias-state-warn-label);margin:0}",
      ".dsh-lh-err{color:var(--dsw-alias-state-error-primary);margin:0}",
      ".dsh-lh-ok{color:var(--dsw-alias-state-success-primary);margin:0}",
      ".dsh-lh-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}",
      ".dsh-lh-head{display:flex;align-items:baseline;gap:8px}",
      ".dsh-lh-name{font-weight:500}",
      ".dsh-lh-route{color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".dsh-lh-row{display:flex;gap:8px;align-items:center}",
      ".dsh-lh-in{border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);border-radius:8px;padding:6px 10px;font-size:13px;min-width:0}",
      ".dsh-lh-in:focus{outline:none;border-color:var(--dsw-alias-border-l3)}",
      ".dsh-lh-in-name{flex:0 0 34%}",
      ".dsh-lh-in-value{flex:1 1 auto}",
      ".dsh-lh-x{border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:6px;flex:none;width:26px;height:26px;font-size:15px;line-height:1}",
      ".dsh-lh-x:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
      ".dsh-lh-actions{display:flex;align-items:center;gap:10px;margin-top:2px}",
      ".dsh-lh-btn{border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;border-radius:16px;padding:5px 12px;font-size:13px}",
      ".dsh-lh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-lh-btn:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
      ".dsh-lh-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}",
      ".dsh-lh-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
    ].join("");

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@moon16u/dsh-pouch/HeadersSection.module.css\"]") === null) {
      var headersTag = document.createElement("style");
      headersTag.dataset.plugin = "@moon16u/dsh-pouch";
      headersTag.dataset.pluginCss = "@moon16u/dsh-pouch/HeadersSection.module.css";
      headersTag.textContent = headersCss;
      document.head.appendChild(headersTag);
    }

    var h = React.createElement;

    /**
     * The credential reference a route resolves keys through when its profile
     * names none. Mirrors the Models page's own derivation so a moved route
     * keeps reading the key that page stored.
     */
    function deriveKeyRef(provider) {
      return provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_API_KEY";
    }

    function plainObject(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
    }

    /**
     * Header rows as the editor holds them. A stored `null` renders as an empty
     * value, which is also how the editor spells "remove this header" — so the
     * two round-trip through each other.
     */
    function rowsOf(headers) {
      var record = plainObject(headers);
      if (record === undefined) return [];
      return Object.keys(record).map(function (name) {
        var value = record[name];
        return { name: name, value: value === null || value === undefined ? "" : String(value) };
      });
    }

    /** The header map to store: unnamed rows dropped, empty values kept as removals. */
    function headersOf(rows) {
      var headers = {};
      for (var index = 0; index < rows.length; index += 1) {
        var name = rows[index].name.trim();
        if (name.length === 0) continue;
        headers[name] = rows[index].value.length > 0 ? rows[index].value : null;
      }
      return headers;
    }

    /**
     * Decide what one save writes, without touching the wire.
     *
     * A route the stock adapter still serves has to MOVE: DSH allows one adapter
     * per route, and a header written into `llm-pi-ai` is stripped by that
     * adapter before it reaches the socket. So an `llm-pi-ai` profile is copied
     * verbatim into `llm-headers` (schemastery passes fields this schema does not
     * name straight through) and the `llm-pi-ai` entry is scheduled for removal.
     *
     * When BOTH sections declare the route — someone re-added it on the Models
     * page — the profile already here wins as the base. It is the one this page
     * has been editing and the one carrying the headers; taking the freshly
     * created pi-ai copy instead would silently discard whatever models, compat,
     * or endpoint this route had. The duplicate is still removed either way.
     *
     * The copy carries the derived credential reference only when it invents the
     * profile from nothing; a real source profile already records its own.
     *
     * Emitting the plan as data keeps the irreversible part — a two-namespace,
     * non-atomic write — a pure function the tests can pin.
     *
     * @param route - provider route id.
     * @param headers - the header map to store (may be empty to clear).
     * @param piAiProfile - the route's current `llm-pi-ai` profile, or undefined.
     * @param headersProfile - the route's current `llm-headers` profile, or undefined.
     * @returns `{ profile, removeFromPiAi }` — the profile to set, and whether to unset the pi-ai one.
     */
    function savePlan(route, headers, piAiProfile, headersProfile) {
      var source = headersProfile !== undefined ? headersProfile : piAiProfile;
      var profile = source === undefined ? {} : JSON.parse(JSON.stringify(source));
      if (source === undefined && profile.apiKeyEnv === undefined) profile.apiKeyEnv = deriveKeyRef(route);
      if (Object.keys(headers).length > 0) profile.headers = headers;
      else delete profile.headers;
      return { profile: profile, removeFromPiAi: false };
    }

    function HeadersSection(props) {
      var api = props.api;
      var mirror = props.mirror;
      var schema = props.schema;
      var t = props.t;
      var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback;

      var subscribe = useCallback(function (listener) { return mirror.subscribe(listener); }, [mirror]);
      var getSnapshot = useCallback(function () { return mirror.getSnapshot(); }, [mirror]);
      var mirrored = React.useSyncExternalStore(subscribe, getSnapshot);

      var providersState = useState(null), providers = providersState[0], setProviders = providersState[1];
      var draftsState = useState({}), drafts = draftsState[0], setDrafts = draftsState[1];
      var busyState = useState(""), busy = busyState[0], setBusy = busyState[1];
      var errorState = useState(null), error = errorState[0], setError = errorState[1];
      var savedState = useState(""), saved = savedState[0], setSaved = savedState[1];
      var reloadState = useState(0), reload = reloadState[0], setReload = reloadState[1];

      useEffect(function () { mirror.ensure(); }, [mirror]);

      useEffect(function () {
        var stale = false;
        api.llm.providers({}).then(function (response) {
          if (stale) return;
          if (response.result.ok) setProviders(response.result.value.providers);
          else setError(response.result.error.message);
        }, function (reason) {
          if (!stale) setError(String(reason));
        });
        return function () { stale = true; };
      }, [api, reload]);

      function namespaceOf(ns) {
        var view = mirrored.view;
        if (view === undefined) return undefined;
        for (var index = 0; index < view.namespaces.length; index += 1) {
          if (view.namespaces[index].ns === ns) return view.namespaces[index];
        }
        return undefined;
      }

      var headersNs = namespaceOf(HEADERS_NS);
      var piAiNs = namespaceOf(PI_AI_NS);

      if (mirrored.status === "unavailable" || (mirrored.view !== undefined && headersNs === undefined && piAiNs === undefined)) {
        return h("div", { className: "dsh-lh" }, h("p", { className: "dsh-lh-note" }, t("unavailable")));
      }
      if (mirrored.view === undefined || providers === null) {
        return h("div", { className: "dsh-lh" }, h("p", { className: "dsh-lh-note" }, t("loading")));
      }

      var writable = mirrored.view.writable === true;

      function storedAt(view, route, tail) {
        if (view === undefined) return undefined;
        return schema.getPath(view.user, ["providers", route].concat(tail || []));
      }

      /** What is in effect for a route here, checking pi-ai then headers. */
      function effectiveAt(route, tail) {
        if (piAiNs !== undefined) {
          var fromPiAi = schema.getPath(piAiNs.value, ["providers", route].concat(tail || []));
          if (fromPiAi !== undefined) return fromPiAi;
        }
        if (headersNs === undefined) return undefined;
        return schema.getPath(headersNs.value, ["providers", route].concat(tail || []));
      }

      /** Every route declared under llm-headers. */
      function declaredRoutes() {
        if (headersNs === undefined) return [];
        var dict = plainObject(schema.getPath(headersNs.value, ["providers"]));
        return dict === undefined ? [] : Object.keys(dict);
      }

      var declared = declaredRoutes();
      var live = providers.filter(function (entry) {
        return entry.active === true && entry.settingsNs !== DEEPSEEK_NS;
      });
      var byRoute = {};
      for (var l = 0; l < live.length; l += 1) byRoute[live[l].provider] = live[l];
      var rows = [];
      var listed = {};
      for (var d = 0; d < declared.length; d += 1) {
        listed[declared[d]] = true;
        rows.push(byRoute[declared[d]] === undefined
          ? { provider: declared[d], displayName: declared[d], settingsNs: HEADERS_NS, active: false }
          : byRoute[declared[d]]);
      }
      for (var v = 0; v < live.length; v += 1) {
        if (listed[live[v].provider] !== true) rows.push(live[v]);
      }

      function rowsFor(route) {
        if (Object.prototype.hasOwnProperty.call(drafts, route)) return drafts[route];
        return rowsOf(effectiveAt(route, ["headers"]));
      }

      function setRows(route, next) {
        setDrafts(function (previous) {
          var copy = Object.assign({}, previous);
          copy[route] = next;
          return copy;
        });
        setSaved("");
        setError(null);
      }

      function clearDraft(route) {
        setDrafts(function (previous) {
          var copy = Object.assign({}, previous);
          delete copy[route];
          return copy;
        });
      }

      async function save(route) {
        setBusy(route);
        setError(null);
        setSaved("");
        try {
          var headers = headersOf(rowsFor(route));
          var hasHeaders = Object.keys(headers).length > 0;
          var inPiAi = piAiNs !== undefined && schema.getPath(piAiNs.value, ["providers", route]) !== undefined;

          if (inPiAi) {
            var ops = hasHeaders
              ? [{ op: "set", path: ["providers", route, "headers"], value: headers }]
              : [{ op: "unset", path: ["providers", route, "headers"] }];
            var written = await api.settings.mutate({
              ns: PI_AI_NS,
              ops: ops,
              expectedRevision: piAiNs.revision,
            });
            if (!written.result.ok) {
              setError(written.result.error.code === "settings-conflict" ? t("conflict") : written.result.error.message);
              return;
            }
            mirror.acceptView(written.result.value);
          } else if (headersNs !== undefined) {
            var plan = savePlan(
              route,
              headers,
              plainObject(storedAt(piAiNs, route)),
              plainObject(storedAt(headersNs, route))
            );
            var written = await api.settings.mutate({
              ns: HEADERS_NS,
              ops: [{ op: "set", path: ["providers", route], value: plan.profile }],
              expectedRevision: headersNs.revision,
            });
            if (!written.result.ok) {
              setError(written.result.error.code === "settings-conflict" ? t("conflict") : written.result.error.message);
              return;
            }
            mirror.acceptView(written.result.value);
          }

          clearDraft(route);
          setSaved(route);
          setReload(function (value) { return value + 1; });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setBusy("");
        }
      }

      function card(entry) {
        var route = entry.provider;
        var current = rowsFor(route);
        var dirty = Object.prototype.hasOwnProperty.call(drafts, route);
        var disabled = !writable || busy.length > 0;

        var children = [h("div", { className: "dsh-lh-head", key: "head" },
          h("span", { className: "dsh-lh-name" }, entry.displayName),
          entry.displayName === route ? null : h("span", { className: "dsh-lh-route" }, route))];

        if (current.length === 0) {
          children.push(h("p", { className: "dsh-lh-note", key: "none" }, t("noHeaders")));
        }
        for (var index = 0; index < current.length; index += 1) {
          children.push(headerRow(route, current, index, disabled));
        }

        var actions = [h("button", {
          key: "add",
          type: "button",
          className: "dsh-lh-btn",
          disabled: disabled,
          onClick: function () { setRows(route, current.concat([{ name: "", value: "" }])); },
        }, t("addHeader")), h("button", {
          key: "save",
          type: "button",
          className: "dsh-lh-btn dsh-lh-btn-primary",
          disabled: disabled || !dirty,
          onClick: function () { save(route); },
        }, busy === route ? t("saving") : t("save"))];

        if (saved === route) actions.push(h("span", { className: "dsh-lh-ok", key: "ok" }, t("saved")));

        children.push(h("div", { className: "dsh-lh-actions", key: "actions" }, actions));
        return h("div", { className: "dsh-lh-card", key: route }, children);
      }

      function headerRow(route, current, index, disabled) {
        return h("div", { className: "dsh-lh-row", key: "row-" + String(index) },
          h("input", {
            className: "dsh-lh-in dsh-lh-in-name",
            type: "text",
            value: current[index].name,
            placeholder: t("headerName"),
            "aria-label": t("headerName"),
            disabled: disabled,
            onChange: function (event) {
              var next = current.slice();
              next[index] = { name: event.target.value, value: next[index].value };
              setRows(route, next);
            },
          }),
          h("input", {
            className: "dsh-lh-in dsh-lh-in-value",
            type: "text",
            value: current[index].value,
            placeholder: t("headerValue"),
            "aria-label": t("headerValue"),
            disabled: disabled,
            onChange: function (event) {
              var next = current.slice();
              next[index] = { name: next[index].name, value: event.target.value };
              setRows(route, next);
            },
          }),
          h("button", {
            type: "button",
            className: "dsh-lh-x",
            "aria-label": "×",
            title: "×",
            disabled: disabled,
            onClick: function () {
              var next = current.slice();
              next.splice(index, 1);
              setRows(route, next);
            },
          }, "×"));
      }

      var body = [h("p", { className: "dsh-lh-note", key: "desc" }, t("description"))];
      if (!writable) body.push(h("p", { className: "dsh-lh-warn", key: "ro" }, t("readOnly")));
      if (error !== null) body.push(h("p", { className: "dsh-lh-err", key: "err" }, error));
      if (rows.length === 0) body.push(h("p", { className: "dsh-lh-note", key: "empty" }, t("empty")));
      for (var cursor = 0; cursor < rows.length; cursor += 1) body.push(card(rows[cursor]));

      return h("div", { className: "dsh-lh" }, body);
    }

    var inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-session-id: dictionaries");

      ctx.slots.inject("conversation.session.header.utilities", function () {
        return ctx.slots.register({
          name: "conversation.session.header.utilities",
          id: "dsh-session-id",
          order: -1,
          locale: NS,
        }, SessionIdAction);
      });

      // The headers section needs the settings surface, which activates
      // independently of this plugin. Deferring on those services rather than
      // declaring them in `inject` keeps the badge above mounting on a host
      // that carries no settings UI at all.
      ctx.inject(["connection", "settingsScope", "settingsSchema"], function (scope) {
        scope.effect(function () {
          return scope.locale.register(HEADERS_NS, { zh: headersZh, en: headersEn });
        }, "dsh-llm-headers: dictionaries");

        var headersT = scope.locale.bind(HEADERS_NS);
        var mirror = scope.settingsScope.describe();
        var injected = function () {
          return {
            api: scope.get("connection").api,
            mirror: mirror,
            schema: scope.settingsSchema,
            t: headersT,
          };
        };

        scope.slots.inject("settings.section", function () {
          return scope.slots.register({
            name: "settings.section",
            id: "llm-headers",
            order: 11,
            label: function () { return headersT("nav"); },
            inject: injected,
          }, HeadersSection);
        });
      });

      // mcp-console: entry pill + management panel (root-only wiring; the
      // synced body itself lives below between the sync markers).
      mcpConsoleApply(ctx);
    }

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
      ".mcp-switch input:disabled{cursor:wait}",
      ".mcp-switch input:disabled ~ .mcp-switch-track{opacity:.5}",
      ".mcp-mgr-summary{display:inline-flex;align-items:center;gap:6px;background:0 0;border:0;padding:0;color:var(--dsw-alias-label-secondary,#6b7280);font-family:var(--dsw-font-family);font-size:13px;cursor:pointer;user-select:none;align-self:flex-start}",
      ".mcp-mgr-summary:hover{color:var(--dsw-alias-label-primary,#111827)}",
      ".mcp-mgr-chevron{display:inline-block;width:0;height:0;border-left:4px solid currentColor;border-top:5px solid transparent;border-bottom:5px solid transparent;transition:transform .15s ease;flex:none}",
      ".mcp-mgr-summary[data-open=true] .mcp-mgr-chevron{transform:rotate(90deg)}",
      ".mcp-mgr-name-btn{background:0 0;border:0;padding:0;color:inherit;font-family:inherit;font-size:inherit;font-weight:inherit;cursor:pointer;text-align:left;min-width:0}",
      ".mcp-mgr-name-btn:hover{text-decoration:underline;text-underline-offset:3px}",
      ".mcp-mgr-err{color:var(--dsw-alias-state-error-primary,#ef4444);margin:0;font-size:12px;word-break:break-word}",
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
          throw new Error(message);
        }
        return body;
      });
    }

    function mcpFill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, function (_, key) {
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
     * One server item: header row (name + status + badge | delete + master
     * switch), summary row (chevron + count, expand trigger), tool pills.
     * Read-only entries (profile-declared, review §2-4) hide delete, disable
     * switch and pills, and skip tooltips. Editing opens by clicking the
     * server name (the explicit edit button is gone per review §2-2).
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

      function load() {
        return mcpApi("/servers").then(setSnapshot, function (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        });
      }

      useEffect(function () {
        var stale = false;
        mcpApi("/servers").then(function (body) {
          if (!stale) setSnapshot(body);
        }, function (failure) {
          if (!stale) setError(failure instanceof Error ? failure.message : String(failure));
        });
        return function () { stale = true; };
      }, []);

      // Live updates while the settings page is open (plan §5.4 /events).
      useEffect(function () {
        var source = new EventSource("/api/dsh-mcp-console/events");
        source.addEventListener("status_changed", function (event) {
          try {
            setSnapshot(JSON.parse(event.data));
          } catch {}
        });
        return function () { source.close(); };
      }, []);

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

      return McpH("div", { className: "mcp-mgr", "data-mcp-console-section": "" },
        McpH("div", { className: "mcp-mgr-head" },
          McpH("h2", { className: "mcp-mgr-title" }, t("title")),
          McpH("button", {
            type: "button", className: "mcp-mgr-iconbtn", disabled: busyAny,
            title: t("refresh"), "aria-label": t("refresh"),
            onClick: refresh,
          }, McpH(McpIcons.IconRefreshOutline16, { size: 15 })),
          McpH("button", {
            type: "button", className: "mcp-mgr-btn", disabled: busyAny,
            onClick: function () { setEditing(null); setMode("add"); },
          }, McpH(McpIcons.IconPlusOutline16, { size: 14 }), t("add")),
          McpH("button", {
            type: "button", className: "mcp-mgr-btn", disabled: busyAny,
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
    }

    exports.McpSection = McpSection;
    exports.mcpConsoleApply = mcpConsoleApply;
    exports.mcpInject = mcpInject;

    // ==== end mcp-console client body ====

    exports.HeadersSection = HeadersSection;
    exports.SessionIdAction = SessionIdAction;
    exports.apply = apply;
    exports.headersOf = headersOf;
    exports.savePlan = savePlan;
    exports.inject = inject;
    exports.rowsOf = rowsOf;
    return module.exports;
  }
});
