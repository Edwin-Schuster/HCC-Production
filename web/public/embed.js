/*
 * HCC Production embed. Add to any page:
 *   <div data-hcc-sop="SOP_ID"></div>            (SOPs in public folders)
 *   <div data-hcc-share="SHARE_TOKEN"></div>     (any shared SOP)
 *   <script src="https://YOUR-HCC-HOST/embed.js" async></script>
 * Optional: data-theme="light" or "dark".
 */
(function () {
  var script = document.currentScript;
  var origin = new URL(script ? script.src : location.href).origin;
  var frames = [];
  function mount(el) {
    if (el.getAttribute("data-hcc-mounted")) return;
    var sop = el.getAttribute("data-hcc-sop");
    var share = el.getAttribute("data-hcc-share");
    if (!sop && !share) return;
    var path = sop ? "/embed/" + encodeURIComponent(sop) : "/embed/s/" + encodeURIComponent(share);
    var theme = el.getAttribute("data-theme");
    var f = document.createElement("iframe");
    f.src = origin + path + (theme ? "?theme=" + encodeURIComponent(theme) : "");
    f.title = "Standard operating procedure";
    f.loading = "lazy";
    f.style.cssText = "width:100%;border:0;min-height:200px;border-radius:12px;display:block";
    el.setAttribute("data-hcc-mounted", "1");
    el.appendChild(f);
    frames.push(f);
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "hcc-embed-height") return;
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) frames[i].style.height = e.data.height + "px";
  });
  document.querySelectorAll("[data-hcc-sop],[data-hcc-share]").forEach(mount);
})();
