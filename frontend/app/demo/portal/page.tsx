"use client";

import * as React from "react";

/**
 * Mock university portal for the live demo (Feature 14). A fictional university,
 * deliberately styled unlike ScholarRadar (serif type, its own colours and an
 * aggressive global stylesheet) to show the embedded widgets stay intact.
 */

const PORTAL_CSS = `
.portal { font-family: Georgia, "Times New Roman", serif; color: #1f2937; background: #f4f1ea; min-height: 100vh; }
.portal h1, .portal h2, .portal h3 { font-family: Georgia, serif; color: #7a1f2b; margin: 0; }
/* Hostile global-ish rules a real portal might have; the widget must ignore them. */
.portal ul { list-style: square; }
.portal a { color: #7a1f2b; text-decoration: underline; font-weight: bold; }
.portal p { line-height: 1.7; }
`;

function Widget(props: Record<string, string>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const key = JSON.stringify(props);
  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";
    const s = document.createElement("script");
    s.src = "/widget.js";
    s.async = true;
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string>)) s.dataset[k] = v;
    host.appendChild(s);
    return () => {
      host.innerHTML = "";
    };
  }, [key]);
  return <div ref={ref} />;
}

export default function DemoPortalPage() {
  const [origin, setOrigin] = React.useState("https://your-scholarradar.example");
  React.useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Static CSS via innerHTML: React escapes quotes in style children differently on server and client. */}
      <style dangerouslySetInnerHTML={{ __html: PORTAL_CSS }} />
      <div className="portal">
        <div style={{ background: "#7a1f2b", color: "#fff", padding: "6px 24px", fontSize: 12, fontFamily: "Arial, sans-serif" }}>
          Demo page: a fictional university portal embedding the ScholarRadar widget with one script tag.
        </div>
        <header style={{ background: "#fff", borderBottom: "4px solid #c9a227", padding: "18px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div aria-hidden style={{ width: 44, height: 44, borderRadius: "50%", background: "#7a1f2b", color: "#c9a227", display: "grid", placeItems: "center", fontWeight: 700 }}>
                CU
              </div>
              <div>
                <h1 style={{ fontSize: 22 }}>Crescent University</h1>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Student Services Portal · Dubai Academic City</div>
              </div>
            </div>
            <nav style={{ display: "flex", gap: 18, fontSize: 14, fontFamily: "Arial, sans-serif" }} aria-label="Portal">
              <a href="#announcements">Announcements</a>
              <a href="#research">Research</a>
              <a href="#careers">Careers</a>
            </nav>
          </div>
        </header>

        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <section id="announcements" style={{ background: "#fff", padding: 20, border: "1px solid #e5e0d5" }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Announcements</h2>
            <ul>
              <li><p>Spring registration closes Friday at 5 pm.</p></li>
              <li><p>The library extends exam-week hours until midnight.</p></li>
              <li><p>Undergraduate Research Day: posters due on the 14th.</p></li>
            </ul>
            <h3 style={{ fontSize: 16, marginTop: 16 }}>From the Office of Undergraduate Research</h3>
            <p>
              Below is a live feed of open research opportunities for our students, provided by ScholarRadar. Every listing is
              checked regularly and links to full eligibility details.
            </p>
          </section>

          <section id="research" aria-label="Research opportunities for undergraduates">
            <Widget title="Undergraduate research opportunities" degree="bachelors" field="computer science" limit="5" />
          </section>

          <section id="careers" aria-label="Opportunities in the UAE and GCC">
            <Widget title="Near campus: UAE opportunities" region="uae" limit="4" />
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
              Embed code used on this page:
            </p>
            <pre style={{ fontSize: 12, background: "#1f2937", color: "#f9fafb", padding: 12, overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {`<script src="${origin}/widget.js"
        data-region="uae" data-limit="4"
        data-title="Near campus: UAE opportunities" async></script>`}
            </pre>
          </section>
        </main>
        <footer style={{ textAlign: "center", padding: 24, fontSize: 12, color: "#6b7280", fontFamily: "Arial, sans-serif" }}>
          © Crescent University (fictional) · Demo for ScholarRadar
        </footer>
      </div>
    </div>
  );
}
