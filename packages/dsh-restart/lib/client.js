window.__ModuleLoader__.load({
  id: "@moon16u/dsh-restart",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    var IconRefresh = primitives.IconRefreshOutlineRegular || primitives.IconRefreshOutline16;

    var inject = ["commandUi", "locale"];

    var NS = "dsh-restart";
    var zh = {
      label: "重启",
      desc: "在 3 秒后平滑重启 DSH 进程",
      fail: "重启调度失败",
      logs: "日志",
    };
    var en = {
      label: "Restart",
      desc: "Smoothly restart DSH process in 3 seconds",
      fail: "Failed to schedule restart",
      logs: "Logs",
    };

    function apply(ctx) {
      if (ctx.locale && typeof ctx.locale.register === "function") {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en });
        }, "dsh-restart: dictionaries");
      }
      var t = (ctx.locale && typeof ctx.locale.bind === "function") ? ctx.locale.bind(NS) : function (k) { return zh[k] || k; };

      // Cordis traces borrowed CommandUi calls through this caller's scope.
      ctx.inject(["commandUi", "remote.commands"], function (scope) {
        var commandUi = scope.get ? scope.get("commandUi") : scope.commandUi;
        if (!commandUi) return;

        // Poll only for detached failures; a broken connection during a normal
        // restart is not itself a failure. The host identifies the owning chat.
        if (typeof fetch === "function" && typeof scope.effect === "function") {
          scope.effect(function () {
            var stopped = false;
            var busy = false;
            var seen = null;
            var controller = new AbortController();
            async function poll() {
              if (stopped || busy) return;
              busy = true;
              try {
                var response = await fetch("/api/dsh-restart/status", {
                  credentials: "same-origin",
                  cache: "no-store",
                  signal: controller.signal,
                });
                if (response.status === 404 || response.status === 401) {
                  stopped = true;
                  clearInterval(timer);
                  return;
                }
                if (!response.ok) return;
                var failure = (await response.json()).failure;
                if (stopped || !failure || !failure.sessionId || !failure.attemptId || seen === failure.attemptId) return;
                if (typeof commandUi.scopeFor === "function" && !commandUi.scopeFor(failure.sessionId)) return;
                if (typeof commandUi.noticeFor === "function") {
                  commandUi.noticeFor(failure.sessionId, "error",
                    t("fail") + ": " + failure.reason + (failure.logPath ? "\n" + t("logs") + ": " + failure.logPath : ""));
                  seen = failure.attemptId;
                }
              } catch (_) {
                // Reconnects are expected while DSH restarts.
              } finally {
                busy = false;
              }
            }
            var timer = setInterval(poll, 1000);
            poll();
            return function () {
              stopped = true;
              clearInterval(timer);
              controller.abort();
            };
          });
        }

        if (typeof commandUi.candidates === "function" && !commandUi.__dsh_restart_candidates_wrapped__) {
          commandUi.__dsh_restart_candidates_wrapped__ = true;
          var origCandidates = commandUi.candidates.bind(commandUi);
          commandUi.candidates = async function (session, req) {
            var rows = await origCandidates(session, req);
            var seen = false;
            var result = [];
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              if (row.name === "restart" || row.name === "dsh-restart") {
                if (seen) continue;
                seen = true;
                result.push(Object.assign({}, row, {
                  name: "restart",
                  label: t("label"),
                  description: t("desc"),
                  icon: IconRefresh,
                  hint: undefined,
                }));
              } else {
                result.push(row);
              }
            }
            return result;
          };
        }

        if (typeof commandUi.dispatch === "function" && !commandUi.__dsh_restart_dispatch_wrapped__) {
          commandUi.__dsh_restart_dispatch_wrapped__ = true;
          var origDispatch = commandUi.dispatch.bind(commandUi);
          commandUi.dispatch = function (pick) {
            var name = pick.candidate.name;
            if (name === "restart" || name === "dsh-restart") {
              commandUi.consumeVia(pick.session.sessionId, {
                via: "menu",
                span: pick.span,
              });
              try {
                var actx = typeof commandUi.scopeFor === "function" ? commandUi.scopeFor(pick.session.sessionId) : null;
                var conv = actx && typeof actx.get === "function" ? actx.get("conversation") : null;
                if (conv && conv.input && typeof conv.input.for === "function") {
                  var sh = conv.input.for(actx);
                  if (sh && sh.notices && typeof sh.notices.set === "function") {
                    sh.notices.set(null);
                  }
                }
              } catch (_) {}
              commandUi.execute(pick.session, "/restart");
              return "handled";
            }
            return origDispatch(pick);
          };
        }

        if (typeof commandUi.execute === "function" && !commandUi.__dsh_restart_execute_wrapped__) {
          commandUi.__dsh_restart_execute_wrapped__ = true;
          var origExecute = commandUi.execute.bind(commandUi);
          commandUi.execute = async function (session, line, attachments) {
            if (typeof line === "string") {
              var tok = line.split(/\s/)[0];
              if (tok === "/restart" || tok === "/dsh-restart") {
                var outcome;
                // The RPC envelope can be ok while the command result is an
                // error. Use the host command lifecycle, not obsolete session.command.
                var off = typeof scope.on === "function" ? scope.on("command/executed", function (id, name, result) {
                  if (id === session.sessionId && (name === "restart" || name === "dsh-restart")) outcome = result;
                }) : null;
                try {
                  var result = await origExecute(session, line, attachments);
                  if (outcome && outcome.kind === "error") throw new Error(outcome.text);
                  if (result && result.kind === "error") throw new Error(result.text || t("fail"));
                  return result;
                } catch (e) {
                  var text = t("fail") + ": " + (e.message || String(e));
                  if (typeof commandUi.noticeFor === "function") {
                    commandUi.noticeFor(session.sessionId, "error", text);
                  }
                  return { kind: "error", text: text };
                } finally {
                  if (typeof off === "function") off();
                }
              }
            }
            return origExecute(session, line, attachments);
          };
        }

        if (commandUi.directory && typeof commandUi.directory.resolve === "function" && !commandUi.directory.__dsh_restart_resolve_wrapped__) {
          commandUi.directory.__dsh_restart_resolve_wrapped__ = true;
          var origResolve = commandUi.directory.resolve.bind(commandUi.directory);
          commandUi.directory.resolve = function (sessionId, name) {
            if (name === "restart" || name === t("label") || name === "重启") {
              var resolved = origResolve(sessionId, "restart") || origResolve(sessionId, "dsh-restart");
              if (resolved) return Object.assign({}, resolved, { input: undefined });
            } else if (name === "dsh-restart") {
              var resolved = origResolve(sessionId, "dsh-restart");
              if (resolved) return Object.assign({}, resolved, { input: undefined });
            }
            return origResolve(sessionId, name);
          };
        }
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
