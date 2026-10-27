import { api, getSettings } from "./lib.js";

const $ = (id) => document.getElementById(id);

(async () => {
  const s = await getSettings();
  $("server").value = s.server;
  $("key").value = s.apiKey;
})();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const server = $("server").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ server, apiKey: $("key").value.trim() });
  $("status").className = "muted";
  $("status").textContent = "Testing…";
  try {
    const me = await api("/api/v1/me");
    if (!me.id) throw new Error("The key wasn't accepted.");
    $("status").className = "ok";
    $("status").textContent = `Connected as ${me.name} (${me.role}).`;
  } catch (err) {
    $("status").className = "error";
    $("status").textContent = err.message;
  }
});
