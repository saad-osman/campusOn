import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Code2,
  FileUp,
  Kanban,
  Mail,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { HomeCTA } from "@/components/home-cta";

const STEPS = [
  { icon: FileUp, title: "Upload your CV", body: "We read it and fill in your profile. You check every value before it's saved." },
  { icon: CheckCircle2, title: "See what you qualify for", body: "Every listing says eligible, almost, or not, and exactly why: “IELTS 6.5 required, you have none.”" },
  { icon: Users, title: "Find who to contact", body: "Researchers publishing in your area right now, with BITS and UAE labs highlighted." },
  { icon: Kanban, title: "Apply together", body: "A shared Application File with drafts, a checklist, a tracker and your teammates." },
];

const FEATURES = [
  {
    icon: Target,
    title: "Explainable match scores",
    body: "0–100 with the top three reasons in plain language. No black box: topic fit, eligibility, field, time to prepare and funding.",
    className: "md:col-span-2",
  },
  { icon: Search, title: "Search like you'd ask a senior", body: "“Funded summer AI internships in Europe for 3rd-years” becomes filters you can see and remove." },
  { icon: Mail, title: "Application copilot", body: "A checklist, an SOP draft and a short cold email, written only from facts in your profile." },
  { icon: Bell, title: "Change alerts", body: "Deadline moved? Funding changed? Everyone following it hears about it." },
  { icon: ShieldCheck, title: "Checked, not just scraped", body: "Low-confidence extractions wait for faculty review. Verified listings say so, and every card shows when it was last checked." },
  { icon: MapPin, title: "UAE & GCC first", body: "Regional sources, an “open to UAE residents” filter, and a near-you section.", className: "md:col-span-2" },
  { icon: CalendarClock, title: "Never miss a deadline", body: "Countdowns, a weekly digest, Telegram, and one-click calendar export with reminders." },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-20 pb-16 pt-6 sm:pt-12">
      <section className="flex flex-col items-center gap-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden /> Built for BPDC students &middot; CampusOPS 2026
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          From discovery to a <span className="text-primary">submitted application</span>.
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          ScholarRadar finds research internships, fellowships and scholarships, tells you which ones you actually qualify
          for, who to contact, and what to send, and lets you apply with your teammates.
        </p>
        <HomeCTA />
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">{i + 1}</span>
                Step {i + 1}
              </span>
              <s.icon className="size-5 text-primary" aria-hidden />
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-6">
        <h2 id="features" className="text-center text-2xl font-semibold tracking-tight">More than a list of links</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={`flex flex-col gap-2 rounded-2xl border bg-card p-5 ${f.className ?? ""}`}>
              <f.icon className="size-5 text-primary" aria-hidden />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="unis" className="grid gap-6 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 id="unis" className="text-2xl font-semibold tracking-tight">For universities and faculty</h2>
          <p className="text-muted-foreground">
            Faculty verify listings and endorse opportunities to the students they suit. Admins see coverage, quality and
            outcomes, and any portal can embed a live feed with one script tag.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Review queue and faculty endorsements</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Analytics, success stories and CSV reports</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Public API, RSS feed and embeddable widget</li>
          </ul>
          <Link href="/demo/portal" className="mt-1 w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
            See the widget on a sample university portal &rarr;
          </Link>
        </div>
        <pre className="overflow-x-auto rounded-2xl bg-zinc-950 p-5 text-xs leading-relaxed text-zinc-100" aria-label="Widget embed code">
          <Code2 className="mb-3 size-4 text-zinc-400" aria-hidden />
          {`<script src="https://your-scholarradar.example/widget.js"
        data-degree="bachelors"
        data-field="computer science"
        data-region="uae"
        async></script>`}
        </pre>
      </section>

      <footer className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
        <p>ScholarRadar &middot; CampusOPS (IEEE BPDC), Problem Statement 03</p>
        <p>Demo listings are illustrative. Always confirm details on the official page before applying.</p>
      </footer>
    </div>
  );
}
