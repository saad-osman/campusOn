/*!
 * ScholarRadar embeddable widget (Feature 14).
 *
 *   <script src="https://YOUR-SCHOLARRADAR/widget.js"
 *           data-degree="bachelors" data-field="computer science"
 *           data-region="uae" data-type="research_internship" data-limit="5"
 *           data-title="Research opportunities" async></script>
 *
 * Renders a compact list right after the script tag, inside a Shadow DOM so it
 * neither inherits nor leaks styles. Reads only the public API (no cookies, no
 * personal data) and links back to ScholarRadar.
 */
(function () {
  "use strict";

  var TYPE_LABELS = {
    research_internship: "Internship",
    fellowship: "Fellowship",
    grant: "Grant",
    scholarship: "Scholarship",
    research_position: "Research position",
    summer_school: "Summer school",
  };
  var FUNDING_LABELS = { fully_funded: "Fully funded", stipend: "Stipend", partial: "Partial funding" };

  var STYLES =
    ":host{all:initial;display:block;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a}" +
    ".sr{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden;max-width:520px}" +
    ".sr-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc}" +
    ".sr-title{font-size:14px;font-weight:600;margin:0}" +
    ".sr-brand{font-size:11px;color:#64748b;text-decoration:none}.sr-brand:hover{text-decoration:underline}" +
    ".sr-list{list-style:none;margin:0;padding:0}" +
    ".sr-item{border-bottom:1px solid #f1f5f9}.sr-item:last-child{border-bottom:0}" +
    ".sr-link{display:block;padding:10px 16px;text-decoration:none;color:inherit}.sr-link:hover{background:#f8fafc}" +
    ".sr-link:focus-visible{outline:2px solid #4f46e5;outline-offset:-2px}" +
    ".sr-name{font-size:14px;font-weight:600;line-height:1.3;margin:0 0 2px}" +
    ".sr-meta{font-size:12px;color:#64748b;margin:0;display:flex;flex-wrap:wrap;gap:4px 10px}" +
    ".sr-soon{color:#be123c;font-weight:600}.sr-ok{color:#047857}" +
    ".sr-empty,.sr-error{padding:16px;font-size:13px;color:#64748b;margin:0}" +
    ".sr-foot{padding:10px 16px;border-top:1px solid #e2e8f0;font-size:12px}" +
    ".sr-foot a{color:#4f46e5;text-decoration:none;font-weight:600}.sr-foot a:hover{text-decoration:underline}" +
    "@media (prefers-color-scheme: dark){:host{color:#e2e8f0}.sr{background:#0f172a;border-color:#1e293b}" +
    ".sr-head,.sr-link:hover{background:#111c33}.sr-head,.sr-item,.sr-foot{border-color:#1e293b}.sr-meta,.sr-brand,.sr-empty{color:#94a3b8}}";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text; // textContent: API data is never parsed as HTML
    return node;
  }

  function daysUntil(iso) {
    if (!iso) return null;
    var parts = iso.split("-");
    var target = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function render(script) {
    var origin = new URL(script.src, window.location.href).origin;
    var d = script.dataset;
    var params = new URLSearchParams();
    if (d.degree) params.set("degree", d.degree);
    if (d.field) params.set("field", d.field);
    if (d.type) params.set("type", d.type);
    if (d.region) params.set("region", d.region);
    params.set("limit", String(Math.min(Math.max(parseInt(d.limit || "5", 10) || 5, 1), 20)));

    var host = document.createElement("div");
    host.setAttribute("data-scholarradar-widget", "");
    script.parentNode.insertBefore(host, script.nextSibling);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    var style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    var box = el("section", "sr");
    box.setAttribute("aria-label", d.title || "Research opportunities");
    var head = el("div", "sr-head");
    head.appendChild(el("h2", "sr-title", d.title || "Research opportunities"));
    var brand = el("a", "sr-brand", "via ScholarRadar");
    brand.href = origin;
    brand.target = "_blank";
    brand.rel = "noopener";
    head.appendChild(brand);
    box.appendChild(head);
    var body = el("p", "sr-empty", "Loading opportunities…");
    box.appendChild(body);
    root.appendChild(box);

    fetch(origin + "/api/public/opportunities?" + params.toString(), { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (items) {
        if (!items.length) {
          body.textContent = "No open opportunities match right now.";
          return;
        }
        var list = el("ul", "sr-list");
        items.forEach(function (o) {
          var li = el("li", "sr-item");
          var a = el("a", "sr-link");
          a.href = o.scholarradar_url;
          a.target = "_blank";
          a.rel = "noopener";
          a.appendChild(el("p", "sr-name", o.title));
          var meta = el("p", "sr-meta");
          meta.appendChild(el("span", null, o.organization));
          meta.appendChild(el("span", null, TYPE_LABELS[o.type] || o.type));
          if (FUNDING_LABELS[o.funding_type]) meta.appendChild(el("span", "sr-ok", FUNDING_LABELS[o.funding_type]));
          var days = daysUntil(o.deadline);
          if (days !== null) meta.appendChild(el("span", days < 7 ? "sr-soon" : null, days + " day" + (days === 1 ? "" : "s") + " left"));
          a.appendChild(meta);
          li.appendChild(a);
          list.appendChild(li);
        });
        box.replaceChild(list, body);
        var foot = el("div", "sr-foot");
        var more = el("a", null, "Check your eligibility on ScholarRadar →");
        more.href = origin + "/discover";
        more.target = "_blank";
        more.rel = "noopener";
        foot.appendChild(more);
        box.appendChild(foot);
      })
      .catch(function () {
        body.className = "sr-error";
        body.textContent = "Couldn't load opportunities right now.";
      });
  }

  // Handle every widget tag on the page once, including ones added after load.
  var scripts = document.querySelectorAll('script[src*="widget.js"]:not([data-sr-done])');
  for (var i = 0; i < scripts.length; i++) {
    scripts[i].setAttribute("data-sr-done", "");
    render(scripts[i]);
  }
})();
