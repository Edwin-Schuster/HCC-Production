// Shared helpers for the popup, options page and background worker.

/** Settings saved by the options page. */
export async function getSettings() {
  const { server = "", apiKey = "" } = await chrome.storage.local.get(["server", "apiKey"]);
  return { server: server.replace(/\/+$/, ""), apiKey };
}

/** Calls the HCC REST API with the saved key. Throws an Error with the server's message on failure. */
export async function api(path, init = {}) {
  const { server, apiKey } = await getSettings();
  if (!server || !apiKey) throw new Error("Set the server address and API key in the extension's options.");
  const res = await fetch(server + path, { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error(body?.error || `The server answered ${res.status}.`);
  return body;
}
