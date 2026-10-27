// Background worker: badge counts for the current page, and the step recorder.
import { api, getSettings } from "./lib.js";

// ---------- Relevant SOPs badge ----------
const lastMatch = new Map(); // tabId -> { url, sops }

async function updateBadge(tabId, url) {
  if (!url || !/^https?:/.test(url)) return chrome.action.setBadgeText({ tabId, text: "" });
  try {
    const { server } = await getSettings();
    if (server && url.startsWith(server)) return chrome.action.setBadgeText({ tabId, text: "" });
    const { sops } = await api(`/api/v1/match?url=${encodeURIComponent(url)}`);
    lastMatch.set(tabId, { url, sops });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#3f3f46" });
    await chrome.action.setBadgeText({ tabId, text: sops.length ? String(sops.length) : "" });
  } catch {
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") void updateBadge(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  void updateBadge(tabId, tab.url);
});

// ---------- Recorder ----------
// State lives in storage so it survives the worker being stopped between clicks.
async function getRec() {
  const { rec } = await chrome.storage.local.get("rec");
  return rec || { recording: false, tabId: null, steps: [] };
}
const setRec = (rec) => chrome.storage.local.set({ rec });

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).catch(() => {});
}

/** Screenshot of the visible tab with a red ring where the click happened. */
async function capture(windowId, point) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const scale = bitmap.width / point.viewportWidth;
  const x = point.x * scale;
  const y = point.y * scale;
  const r = 18 * scale;
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = "#ef4444";
  ctx.fillStyle = "rgba(239,68,68,0.18)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === "rec:start") {
      await setRec({ recording: true, tabId: msg.tabId, steps: [] });
      await inject(msg.tabId);
      reply({ ok: true });
    } else if (msg.type === "rec:stop") {
      const rec = await getRec();
      await setRec({ ...rec, recording: false });
      if (rec.tabId) await chrome.tabs.sendMessage(rec.tabId, { type: "rec:off" }).catch(() => {});
      reply({ ok: true });
    } else if (msg.type === "rec:get") {
      reply(await getRec());
    } else if (msg.type === "rec:set-steps") {
      const rec = await getRec();
      await setRec({ ...rec, steps: msg.steps });
      reply({ ok: true });
    } else if (msg.type === "rec:clear") {
      await setRec({ recording: false, tabId: null, steps: [] });
      reply({ ok: true });
    } else if (msg.type === "rec:event") {
      // From the content script in the recorded tab.
      const rec = await getRec();
      if (!rec.recording || sender.tab?.id !== rec.tabId) return reply({ ok: false });
      // Only clicks get a screenshot: one taken after typing would show what was typed.
      let screenshot = null;
      if (msg.point) {
        try {
          screenshot = await capture(sender.tab.windowId, msg.point);
        } catch {
          /* the tab wasn't visible; keep the step without a picture */
        }
      }
      rec.steps.push({ id: crypto.randomUUID(), title: msg.title, detail: msg.detail, url: msg.url, screenshot });
      await setRec(rec);
      reply({ ok: true });
    } else if (msg.type === "match:get") {
      reply(lastMatch.get(msg.tabId) || null);
    }
  })();
  return true; // async reply
});

// Keep recording across page loads in the recorded tab.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const rec = await getRec();
  if (rec.recording && rec.tabId === tabId) await inject(tabId);
});
