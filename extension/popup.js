import { api, getSettings } from "./lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const send = (msg) => chrome.runtime.sendMessage(msg);
let server = "";

function sopList(sops, empty) {
  if (!sops.length) return `<p class="muted">${empty}</p>`;
  return `<ul class="list">${sops
    .map((s) => `<li><a href="${server}/sops/${encodeURIComponent(s.id)}" target="_blank"><span class="code">${esc(s.documentCode)}</span> ${esc(s.title)}</a>${s.summary ? `<div class="muted">${esc(s.summary)}</div>` : ""}</li>`)
    .join("")}</ul>`;
}

/** The tab the popup acts on. Opened as a page (tests, pinned tab), it can be told which tab with ?tab=. */
async function targetTab() {
  const forced = new URLSearchParams(location.search).get("tab");
  if (forced) return chrome.tabs.get(Number(forced));
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function showMatches(tab) {
  try {
    const { sops } = await api(`/api/v1/match?url=${encodeURIComponent(tab.url || "")}`);
    $("matches").innerHTML = sopList(sops, "No SOPs are linked to this page. Add it under an SOP's ⋯ → Owner, folder, tags & review → Web pages.");
  } catch (e) {
    $("matches").innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  $("results").innerHTML = '<p class="muted">Searching…</p>';
  try {
    const { results } = await api(`/api/v1/search?q=${encodeURIComponent(q)}&limit=8`);
    $("results").innerHTML = sopList(results.map((r) => ({ ...r, summary: r.hits?.[0] ? `${r.hits[0].label}` : r.summary })), "Nothing found.");
  } catch (err) {
    $("results").innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
});

async function renderRecorder(tab) {
  const rec = await send({ type: "rec:get" });
  const box = $("recorder");
  if (rec.recording) {
    box.innerHTML = `<div class="row"><span class="dot"></span><span class="grow">Recording: ${rec.steps.length} step${rec.steps.length === 1 ? "" : "s"} so far. Work through the task in the page.</span><button id="stop" class="primary">Stop</button></div>`;
    $("stop").onclick = async () => {
      await send({ type: "rec:stop" });
      renderRecorder(tab);
    };
    return;
  }
  if (!rec.steps.length) {
    box.innerHTML = `<p class="muted">Clicks and typing in this tab become numbered steps with screenshots. Typed text and passwords are never recorded.</p><button id="start" class="primary" ${/^https?:/.test(tab.url || "") ? "" : "disabled"}>Start recording</button>`;
    $("start").onclick = async () => {
      await send({ type: "rec:start", tabId: tab.id });
      renderRecorder(tab);
    };
    return;
  }
  // Review: edit titles, drop steps, then create a draft SOP.
  let folders = [];
  try {
    folders = (await api("/api/v1/folders")).folders;
  } catch {
    /* shown when creating */
  }
  box.innerHTML = `
    <ol class="list" style="list-style:none;padding:0">${rec.steps
      .map(
        (s, i) => `<li class="step" data-id="${s.id}"><span class="num">${i + 1}</span><div><input class="title" value="${esc(s.title)}" aria-label="Step ${i + 1}" /><div class="muted">${esc(s.detail || "")}</div>${s.screenshot ? `<img src="${s.screenshot}" alt="" />` : ""}</div><button class="danger del" aria-label="Remove step">✕</button></li>`,
      )
      .join("")}</ol>
    <p><input id="title" placeholder="SOP title" /></p>
    <p><select id="folder">${folders.map((f) => `<option value="${esc(f.id)}">${"&nbsp;&nbsp;".repeat(f.depth)}${esc(f.name)}</option>`).join("")}</select></p>
    <div class="row"><button id="discard">Discard</button><span class="grow"></span><button id="create" class="primary">Create draft SOP</button></div>
    <p id="status" class="muted"></p>`;
  const save = async () => {
    const titles = [...box.querySelectorAll("li.step")].map((li) => [li.dataset.id, li.querySelector(".title").value]);
    const steps = rec.steps.filter((s) => titles.some(([id]) => id === s.id)).map((s) => ({ ...s, title: titles.find(([id]) => id === s.id)[1] }));
    await send({ type: "rec:set-steps", steps });
    return steps;
  };
  box.querySelectorAll(".del").forEach((b) => (b.onclick = async () => {
    b.closest("li").remove();
    await save();
    renderRecorder(tab);
  }));
  box.querySelectorAll(".title").forEach((i) => (i.onchange = save));
  $("discard").onclick = async () => {
    if (!confirm("Throw away these recorded steps?")) return;
    await send({ type: "rec:clear" });
    renderRecorder(tab);
  };
  $("create").onclick = async () => {
    const steps = await save();
    const title = $("title").value.trim();
    if (!title) return ($("status").textContent = "Give the SOP a title.");
    $("create").disabled = true;
    try {
      const blocks = [];
      for (const [i, s] of steps.entries()) {
        $("status").textContent = `Uploading screenshot ${i + 1} of ${steps.length}…`;
        const children = [];
        if (s.screenshot) {
          const fd = new FormData();
          fd.append("file", await (await fetch(s.screenshot)).blob(), `step-${i + 1}.png`);
          const { url } = await api("/api/files", { method: "POST", body: fd });
          children.push({ id: crypto.randomUUID(), type: "image", content: { url, caption: "" }, children: [] });
        }
        blocks.push({ id: crypto.randomUUID(), type: "step", content: { title: [{ text: s.title.slice(0, 2000) }], description: s.detail || "" }, children });
      }
      $("status").textContent = "Creating the SOP…";
      const created = await api("/api/v1/sops", { method: "POST", body: JSON.stringify({ title, folderId: $("folder").value, summary: `Recorded on ${new URL(steps[0]?.url || tab.url).host}.`, blocks }) });
      await send({ type: "rec:clear" });
      chrome.tabs.create({ url: `${server}/sops/${created.id}/edit` });
      window.close();
    } catch (e) {
      $("status").innerHTML = `<span class="error">${esc(e.message)}</span>`;
      $("create").disabled = false;
    }
  };
}

(async () => {
  ({ server } = await getSettings());
  const { apiKey } = await getSettings();
  if (!server || !apiKey) return ($("setup").hidden = false);
  $("main").hidden = false;
  const tab = await targetTab();
  showMatches(tab);
  renderRecorder(tab);
})();
