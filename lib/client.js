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
    }

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
