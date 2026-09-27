// Note: Keep in sync with the restart block in dsh-pouch/lib/client.js
window.__ModuleLoader__.load({
  id: "@moon16u/dsh-plugin-restart",
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
    };
    var en = {
      label: "Restart",
      desc: "Smoothly restart DSH process in 3 seconds",
      fail: "Failed to schedule restart",
    };

    function apply(ctx) {
      if (ctx.locale && typeof ctx.locale.register === "function") {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en });
        }, "dsh-plugin-restart: dictionaries");
      }
      var t = (ctx.locale && typeof ctx.locale.bind === "function") ? ctx.locale.bind(NS) : function (k) { return zh[k] || k; };

      ctx.inject(["commandUi"], function (scope) {
        var commandUi = scope.get ? scope.get("commandUi") : scope.commandUi;
        if (!commandUi) return;

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
              try {
                var sessions = typeof commandUi.sessions === "function" ? commandUi.sessions() : null;
                var binding = sessions && typeof sessions.binding === "function" ? sessions.binding(pick.session.sessionId) : null;
                var s = binding ? binding.session : null;
                if (s && typeof s.command === "function") {
                  s.command("/restart").then(function (res) {
                    if (!res || !res.ok || (res.value && res.value.matched === false)) {
                      return s.command("/dsh-restart");
                    }
                  }).catch(function () {
                    return s.command("/dsh-restart");
                  });
                } else if (sessions && typeof sessions.using === "function") {
                  sessions.using(pick.session.sessionId, { source: "restart" }, function (ref) {
                    var sess = ref && ref.binding ? ref.binding.session : null;
                    if (sess && typeof sess.command === "function") {
                      return sess.command("/restart").then(function (res) {
                        if (!res || !res.ok || (res.value && res.value.matched === false)) {
                          return sess.command("/dsh-restart");
                        }
                      }).catch(function () {
                        return sess.command("/dsh-restart");
                      });
                    }
                  }).catch(function (err) {
                    console.error("[dsh-restart] sessions.using failed:", err);
                    if (typeof commandUi.noticeFor === "function") {
                      commandUi.noticeFor(pick.session.sessionId, "error", t("fail") + ": " + (err.message || String(err)));
                    }
                  });
                }
              } catch (err) {
                console.error("[dsh-restart] dispatch failed:", err);
                if (typeof commandUi.noticeFor === "function") {
                  commandUi.noticeFor(pick.session.sessionId, "error", t("fail") + ": " + (err.message || String(err)));
                }
              }
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
                try {
                  var sessions = typeof commandUi.sessions === "function" ? commandUi.sessions() : null;
                  var binding = sessions && typeof sessions.binding === "function" ? sessions.binding(session.sessionId) : null;
                  var s = binding ? binding.session : null;
                  if (s && typeof s.command === "function") {
                    var res = await s.command("/restart").catch(function () { return { ok: false }; });
                    if (!res || !res.ok || (res.value && res.value.matched === false)) {
                      res = await s.command("/dsh-restart").catch(function () { return { ok: false }; });
                    }
                    var ok = res && res.ok && !(res.value && res.value.matched === false);
                    if (!ok) {
                      if (typeof commandUi.noticeFor === "function") {
                        commandUi.noticeFor(session.sessionId, "error", t("fail"));
                      }
                      return { kind: "error", text: t("fail") };
                    }
                    return { kind: "success" };
                  }
                } catch (e) {
                  console.error("[dsh-restart] execute interception error:", e);
                  if (typeof commandUi.noticeFor === "function") {
                    commandUi.noticeFor(session.sessionId, "error", t("fail") + ": " + (e.message || String(e)));
                  }
                  return { kind: "error", text: t("fail") };
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
