window.__ModuleLoader__.load({
  id: "@moon16u/dsh-plugin-session-copy",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    // ==== session-copy client body ====
    var Menu = primitives.Menu;
    var IconCopyOutline16 = primitives.IconCopyOutlineRegular || primitives.IconCopyOutline16;
    var IconCheckOutline16 = primitives.IconCheckOutlineRegular || primitives.IconCheckOutline16;

    var NS = "session-copy";

    /** Document-relative route served by this package's host half. */
    var DIRECTORY_ROUTE = "api/dsh-session-copy/directory";

    /** Menu item ids: one per copyable value. */
    var DIRECTORY_ITEM = "directory";
    var TITLE_ITEM = "title";
    var CWD_ITEM = "cwd";

    var zh = {
      "label": "复制",
      "copied": "已复制",
      "copyFailed": "复制失败",
      "directory": "会话目录",
      "title": "会话标题",
      "cwd": "工作目录",
      "reasonInvalidSession": "会话标识无效",
      "reasonDirectoryUnavailable": "尚未落盘，或日志格式不受当前定位接口支持",
      "reasonNotSupported": "当前存储后端不支持定位会话目录",
      "reasonServiceMissing": "宿主未提供会话存储服务",
      "reasonResolveFailed": "会话目录解析失败",
      "reasonNetwork": "获取会话目录失败",
      "directoryPending": "正在获取会话目录",
    };

    var en = {
      "label": "Copy",
      "copied": "Copied",
      "copyFailed": "Copy failed",
      "directory": "Session directory",
      "title": "Session title",
      "cwd": "Working directory",
      "reasonInvalidSession": "Invalid session id",
      "reasonDirectoryUnavailable": "Not on disk yet, or the log format cannot be located by this API",
      "reasonNotSupported": "This storage backend cannot locate session directories",
      "reasonServiceMissing": "The host exposes no session storage service",
      "reasonResolveFailed": "Resolving the session directory failed",
      "reasonNetwork": "Loading the session directory failed",
      "directoryPending": "Loading the session directory",
    };

    var css = ".dsh-session-copy-copy{border:1px solid var(--dsw-alias-border-l2);min-width:64px;height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex}.dsh-session-copy-copy:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsh-session-copy-copy:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.dsh-session-copy-copy span,.dsh-session-copy-copy svg{flex:none}.dsh-session-copy-copy span{white-space:nowrap}.dsh-session-copy-menu-hint{display:block}.dsh-session-copy-menu-reason{color:var(--dsw-alias-label-dimmed);font-size:11px;line-height:16px}.dsh-session-copy-status{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}";

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@moon16u/dsh-plugin-session-copy/SessionCopyAction.module.css\"]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "@moon16u/dsh-plugin-session-copy";
      tag.dataset.pluginCss = "@moon16u/dsh-plugin-session-copy/SessionCopyAction.module.css";
      tag.textContent = css;
      document.head.appendChild(tag);
    }


    /** Initial directory lookup state: nothing loaded, nothing asked for. */
    function initialDirectoryState() {
      return { status: "idle", directory: "", reason: "" };
    }

    /**
     * Build the authenticated request URL for one Session's directory.
     * Document-relative so a sub-path deployment keeps working.
     */
    function directoryRequestUrl(sessionId) {
      return DIRECTORY_ROUTE + "?sessionId=" + encodeURIComponent(String(sessionId));
    }

    /** Map one host error code onto a localized reason. */
    function reasonText(t, reason) {
      switch (reason) {
        case "invalid_session_id": return t("reasonInvalidSession");
        case "directory_unavailable": return t("reasonDirectoryUnavailable");
        case "not_supported": return t("reasonNotSupported");
        case "persistence_unavailable": return t("reasonServiceMissing");
        case "resolve_failed": return t("reasonResolveFailed");
        default: return t("reasonNetwork");
      }
    }

    /**
     * Ask the host half where one Session lives on disk.
     * @returns a ready/unavailable state, or null when the request was aborted.
     */
    async function requestDirectory(sessionId, options) {
      var fetchImpl = options.fetch;
      var signal = options.signal;
      var response;
      try {
        response = await fetchImpl(directoryRequestUrl(sessionId), {
          method: "GET",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: signal,
        });
      } catch (error) {
        if (signal && signal.aborted) return null;
        return { status: "unavailable", directory: "", reason: "network_error" };
      }
      var payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (signal && signal.aborted) return null;
      if (response.ok && payload !== null && typeof payload === "object" && payload.ok === true &&
        typeof payload.directory === "string" && payload.directory.length > 0) {
        return { status: "ready", directory: payload.directory, reason: "" };
      }
      var reason = payload !== null && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : "http_" + String(response.status);
      return { status: "unavailable", directory: "", reason: reason };
    }

    /**
     * The exact clipboard text behind each menu item.
     * A missing value is simply absent, so the item renders disabled.
     */
    function copyValuesFor(summary, directory) {
      var values = {};
      if (directory && directory.status === "ready" && typeof directory.directory === "string" && directory.directory.length > 0) {
        values[DIRECTORY_ITEM] = directory.directory;
      }
      if (summary !== undefined && summary !== null) {
        var title = summary.displayTitle;
        if (typeof title === "string" && title.length > 0) values[TITLE_ITEM] = title;
        var cwd = summary.cwd;
        if (typeof cwd === "string" && cwd.length > 0) values[CWD_ITEM] = cwd;
      }
      return values;
    }

    /** Build the three menu rows, disabling whatever has no value to copy yet. */
    function buildMenuEntries(t, summary, directory) {
      var values = copyValuesFor(summary, directory);
      function row(id, label, hint) {
        var disabled = typeof values[id] !== "string";
        var children = [React.createElement("span", { className: "dsh-session-copy-menu-hint", key: "label" }, label)];
        if (disabled && hint) {
          children.push(React.createElement("span", { className: "dsh-session-copy-menu-reason", key: "reason" }, hint));
        }
        return { id: id, label: React.createElement("span", null, children), disabled: disabled };
      }
      var directoryHint = directory && directory.status === "loading"
        ? t("directoryPending")
        : reasonText(t, directory ? directory.reason : "");
      return [
        row(TITLE_ITEM, t("title"), ""),
        row(DIRECTORY_ITEM, t("directory"), directoryHint),
        row(CWD_ITEM, t("cwd"), ""),
      ];
    }

    /** Copy through the shared clipboard helper; reject unsuccessful writes. */
    async function copyText(text) {
      if (!await primitives.writeClipboard(text)) throw new Error("clipboard write failed");
    }

    function SessionCopyAction(props) {
      var sessionId = props.sessionId;
      var t = props.t;
      var useSessions = props.useSessions;
      var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;

      var summary = useSessions(function (state) {
        if (sessionId === undefined || sessionId === null) return undefined;
        return state.byId[sessionId];
      });

      var openState = useState(false), open = openState[0], setOpen = openState[1];
      var feedbackState = useState(""), feedback = feedbackState[0], setFeedback = feedbackState[1];
      var directoryState = useState(initialDirectoryState), directory = directoryState[0], setDirectory = directoryState[1];

      var timerRef = useRef(null);
      var abortRef = useRef(null);
      var sessionSeqRef = useRef(0);
      var mountedRef = useRef(true);
      // Session id whose directory has already resolved, so reopening the menu
      // does not refetch while a failed lookup stays retryable.
      var loadedRef = useRef(null);

      function clearTimer() {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }

      function abortPending() {
        if (abortRef.current !== null) {
          abortRef.current.abort();
          abortRef.current = null;
        }
      }

      function scheduleFeedbackReset() {
        clearTimer();
        timerRef.current = setTimeout(function () {
          timerRef.current = null;
          if (mountedRef.current) setFeedback("");
        }, 2000);
      }

      useEffect(function () {
        mountedRef.current = true;
        return function () {
          mountedRef.current = false;
          clearTimer();
          abortPending();
        };
      }, []);

      // A Session switch invalidates both in-flight work and past feedback.
      useEffect(function () {
        sessionSeqRef.current += 1;
        loadedRef.current = null;
        clearTimer();
        abortPending();
        setFeedback("");
        setDirectory(initialDirectoryState());
      }, [sessionId]);

      // The directory is fetched lazily per open and retried on a later open
      // after a failure, rather than re-fetched on every render. The in-flight
      // marker is kept outside React state so that starting a request cannot
      // re-enter this effect and abort the request it just made.
      useEffect(function () {
        if (!open) return undefined;
        if (sessionId === undefined || sessionId === null) return undefined;
        if (loadedRef.current === sessionId) return undefined;
        if (abortRef.current !== null) return undefined;
        var fetchImpl = typeof fetch === "function" ? fetch : undefined;
        if (fetchImpl === undefined) {
          loadedRef.current = sessionId;
          setDirectory({ status: "unavailable", directory: "", reason: "network_error" });
          return undefined;
        }
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        abortRef.current = controller;
        var token = sessionSeqRef.current;
        var active = true;
        setDirectory({ status: "loading", directory: "", reason: "" });
        requestDirectory(sessionId, { fetch: fetchImpl, signal: controller ? controller.signal : undefined })
          .then(function (next) {
            if (!active || next === null) return;
            if (!mountedRef.current || token !== sessionSeqRef.current) return;
            // A failed lookup only becomes cacheable once it settled for this id.
            if (next.status === "ready") loadedRef.current = sessionId;
            setDirectory(next);
          })
          .catch(function () {
            if (!active || !mountedRef.current || token !== sessionSeqRef.current) return;
            setDirectory({ status: "unavailable", directory: "", reason: "resolve_failed" });
          })
          .then(function () {
            if (abortRef.current === controller) abortRef.current = null;
          });
        return function () {
          active = false;
          if (controller) controller.abort();
          if (abortRef.current === controller) abortRef.current = null;
        };
      }, [open, sessionId]);

      async function handleSelect(id) {
        setOpen(false);
        var values = copyValuesFor(summary, directory);
        var text = values[id];
        if (typeof text !== "string" || text.length === 0) return;
        var token = sessionSeqRef.current;
        var nextFeedback;
        try {
          await copyText(text);
          nextFeedback = "copied";
        } catch (error) {
          nextFeedback = "copyFailed";
          if (typeof console !== "undefined" && console.error) {
            console.error("[dsh-session-copy] copy failed", error);
          }
        }
        if (!mountedRef.current || token !== sessionSeqRef.current) return;
        setFeedback(nextFeedback);
        scheduleFeedbackReset();
      }

      var entries = buildMenuEntries(t, summary, directory);
      var label = feedback === "" ? t("label") : t(feedback);

      var trigger = React.createElement("button", {
        type: "button",
        "data-session-copy-copy": "",
        "aria-label": label,
        "aria-haspopup": "menu",
        "aria-expanded": open ? "true" : "false",
        title: label,
        className: "dsh-session-copy-copy",
        onClick: function () { setOpen(!open); },
      },
        React.createElement("span", null, label),
        feedback === "copied"
          ? React.createElement(IconCheckOutline16, { size: 12 })
          : React.createElement(IconCopyOutline16, { size: 12 }));

      return React.createElement(React.Fragment, null,
        React.createElement(Menu, {
          open: open,
          align: "end",
          portal: true,
          autoFocus: true,
          anchor: trigger,
          items: entries,
          onSelect: handleSelect,
          onClose: function () { setOpen(false); },
        }),
        React.createElement("span", {
          className: "dsh-session-copy-status",
          role: "status",
          "aria-live": "polite",
        }, feedback === "" ? "" : t(feedback)));
    }
    var SessionIdAction = SessionCopyAction;
    // ==== end session-copy client body ====


    // ==== session-copy apply (keep in sync) ====
    var inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-session-copy: dictionaries");

      ctx.slots.inject("conversation.session.header.utilities", function () {
        return ctx.slots.register({
          name: "conversation.session.header.utilities",
          id: "dsh-session-copy",
          order: -1,
          locale: NS,
        }, SessionCopyAction);
      });
    }


    // ==== end session-copy apply ====

    exports.SessionCopyAction = SessionCopyAction;
    exports.SessionIdAction = SessionCopyAction;
    exports.buildMenuEntries = buildMenuEntries;
    exports.copyValuesFor = copyValuesFor;
    exports.copyText = copyText;
    exports.directoryRequestUrl = directoryRequestUrl;
    exports.initialDirectoryState = initialDirectoryState;
    exports.requestDirectory = requestDirectory;
    exports.DIRECTORY_ROUTE = DIRECTORY_ROUTE;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
