// Run explicitly against an already open isolated DSH Hooks page.
// This only opens details/review and scrolls; it never clicks Approve, enables or executes.
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = new URL(process.env.SCROLL_TEST_CDP);
assert.ok(["127.0.0.1", "localhost"].includes(endpoint.hostname));
const origin = process.env.SCROLL_TEST_ORIGIN ?? "http://127.0.0.1:3086";
assert.notEqual(new URL(origin).port, "3080", "Use an isolated DSH, never the live profile");
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map();
let sequence = 0;
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(message.error) : waiter.resolve(message.result);
};
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const target = (await call("Target.getTargets")).targetInfos.find((item) => item.url.startsWith(origin + "/"));
  assert.ok(target, "Open the isolated Hooks page first");
  const { sessionId } = await call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const geometry = () => evaluate(`(() => {
    const dialog = document.querySelector(".wh-modal");
    const body = dialog.querySelector(".wh-modal-content").lastElementChild;
    const rect = dialog.getBoundingClientRect(), b = body.getBoundingClientRect();
    const close = dialog.querySelector("button[aria-label]").getBoundingClientRect();
    const last = [...body.querySelectorAll(".wh-actions button")].at(-1).getBoundingClientRect();
    return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
      closeTop:close.top,closeBottom:close.bottom,scrollTop:body.scrollTop,
      clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,
      bodyTop:b.top,bodyBottom:b.bottom,lastBottom:last.bottom,lastTop:last.top,
      wheelX:b.left+b.width/2,wheelY:b.top+b.height/2,
      width:innerWidth,height:innerHeight,scrollWidth:body.scrollWidth,clientWidth:body.clientWidth};
  })()`);

  for (const [width, height] of [[1440, 768], [1024, 420], [390, 640]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await evaluate(`(() => {
      if (!document.querySelector(".wh-modal")) document.querySelector(".wh-card").click();
    })()`);
    await delay();
    await evaluate(`document.querySelectorAll(".wh-expand[aria-expanded=false]").forEach(node => node.click())`);
    await delay();
    await evaluate(`document.querySelectorAll(".wh-modal details").forEach(node => node.open = true)`);
    const before = await geometry();
    assert.ok(before.top >= 0 && before.bottom <= height + 1, JSON.stringify(before));
    assert.ok(before.left >= 0 && before.right <= width + 1, JSON.stringify(before));
    assert.ok(before.scrollHeight > before.clientHeight, "Fixture must overflow after expanding both hooks");
    assert.ok(before.scrollWidth <= before.clientWidth + 1, "No horizontal overflow");
    await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.wheelX, y: before.wheelY,
      deltaX: 0, deltaY: 10000 }, sessionId);
    await delay(450);
    const bottom = await geometry();
    assert.ok(bottom.scrollTop > 0, "Real wheel input must scroll the body");
    assert.ok(Math.abs(bottom.scrollTop + bottom.clientHeight - bottom.scrollHeight) <= 2, "Bottom must be reachable");
    assert.ok(bottom.lastTop >= bottom.bodyTop && bottom.lastBottom <= bottom.bodyBottom + 1, "Last hook action is reachable");
    assert.ok(Math.abs(bottom.closeTop - before.closeTop) < 1, "Header/close button must not scroll away");
    await evaluate(`document.querySelector(".wh-modal-content").lastElementChild.scrollTop = 0`);
    await evaluate(`document.querySelector(".wh-modal .wh-actions button").focus()`);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "PageDown", code: "PageDown",
      windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 }, sessionId);
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown",
      windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 }, sessionId);
    await delay(450);
    assert.ok((await geometry()).scrollTop > 0, "Keyboard PageDown must reach later content");
    await evaluate(`document.querySelector(".wh-modal-content").lastElementChild.scrollTop = 0`);
    const top = await geometry();
    assert.ok(top.closeTop >= 0 && top.closeBottom <= height, "Close button stays visible");
    console.log(`PASS ${width}x${height}: wheel and keyboard scroll; header fixed; all hooks reachable`);
  }

  // The unapproved switch opens the existing details; Approve now grants immediately.
  const reviewedIndex = await evaluate(`(() => {
    const hooks = [...document.querySelectorAll(".wh-hook")];
    const index = hooks.findIndex(hook => [...hook.querySelectorAll(".wh-actions button")]
      .some(button => ["批准", "Approve"].includes(button.textContent.trim())));
    const toggle = hooks[index]?.querySelector("[role=switch]");
    if (!toggle || toggle.disabled || toggle.getAttribute("aria-checked") !== "false") return -1;
    toggle.click();
    return index;
  })()`);
  assert.ok(reviewedIndex >= 0, "An unapproved fixture is required; never toggle an approved hook");
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!document.querySelectorAll(".wh-hook")[${reviewedIndex}].querySelector(".wh-actions button").disabled`)) break;
    await delay(100);
  }
  const details = await evaluate(`(() => {
    const hook = document.querySelectorAll(".wh-hook")[${reviewedIndex}];
    hook.querySelector(".wh-actions").scrollIntoView({block:"center"});
    return { hidden: hook.querySelector(".wh-hook-body").hidden, lists: hook.querySelectorAll("dl").length,
      moreOpen: hook.querySelector("details").open, inputs: hook.querySelectorAll("input").length,
      checked: hook.querySelector("[role=switch]").getAttribute("aria-checked") };
  })()`);
  assert.deepEqual(details, { hidden: false, lists: 2, moreOpen: false, inputs: 0, checked: "false" });
  const review = await geometry();
  assert.ok(review.top >= 0 && review.bottom <= review.height + 1, "Approval details cannot expand the dialog beyond the viewport");
  if (process.env.SCROLL_TEST_SCREENSHOT) {
    const { data } = await call("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(process.env.SCROLL_TEST_SCREENSHOT, Buffer.from(data, "base64"));
  }
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sessionId);
  await delay();
  assert.equal(await evaluate(`!!document.querySelector(".wh-modal")`), false);
  console.log("PASS single review: no duplicate fields or checkbox, Approve untouched, Escape closes");
} finally {
  socket.close();
}
