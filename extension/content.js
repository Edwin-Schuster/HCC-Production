// Recorder: turns clicks and typing in this tab into step descriptions. Typed values are never recorded.
(() => {
  if (window.__hccRecorder) return;
  window.__hccRecorder = true;

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 80);

  /** The words a person would use for an element: its label, text or placeholder. */
  function describe(el) {
    const target = el.closest("button, a, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], label, input, select, textarea, summary") || el;
    const tag = target.tagName.toLowerCase();
    const aria = target.getAttribute("aria-label") || (target.getAttribute("aria-labelledby") && document.getElementById(target.getAttribute("aria-labelledby"))?.textContent);
    let label = clean(aria) || clean(target.getAttribute("title"));
    if (!label && (tag === "input" || tag === "select" || tag === "textarea")) {
      const id = target.id && document.querySelector(`label[for="${CSS.escape(target.id)}"]`);
      label = clean(id?.textContent) || clean(target.getAttribute("placeholder")) || clean(target.getAttribute("name"));
    }
    if (!label) label = clean(target.innerText || target.textContent);
    if (!label && tag === "img") label = clean(target.getAttribute("alt"));
    const role = target.getAttribute("role") || (tag === "a" ? "link" : tag === "button" ? "button" : tag === "select" ? "menu" : tag === "input" ? target.type || "field" : "");
    return { label, role, tag, target };
  }

  function send(title, detail, point) {
    chrome.runtime.sendMessage({ type: "rec:event", title, detail, url: location.href, point }).catch(() => {});
  }

  function onClick(e) {
    if (!e.isTrusted) return;
    const { label, role, tag, target } = describe(e.target);
    if (tag === "input" && /text|email|search|password|number|tel|url/.test(target.type)) return; // typing is recorded on change
    const what = label ? `“${label}”` : role ? `the ${role}` : "here";
    const verb = tag === "select" ? "Open" : role === "checkbox" || target.type === "checkbox" ? (target.checked ? "Tick" : "Untick") : "Click";
    send(`${verb} ${what}${role && label && !["link", "button"].includes(role) ? ` ${role}` : ""}`, `On ${clean(document.title) || location.host}`, { x: e.clientX, y: e.clientY, viewportWidth: window.innerWidth });
  }

  function onChange(e) {
    if (!e.isTrusted) return;
    const t = e.target;
    const { label } = describe(t);
    const name = label ? `“${label}”` : "the field";
    if (t.tagName === "SELECT") return send(`Choose “${clean(t.selectedOptions[0]?.textContent)}” in ${name}`, `On ${clean(document.title)}`, null);
    if (t.type === "password") return send(`Enter the password in ${name}`, "Use the password from the team's password manager.", null);
    if (t.matches("input, textarea")) send(`Type in ${name}`, `On ${clean(document.title) || location.host}`, null);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "rec:off") {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      window.__hccRecorder = false;
    }
  });
})();
