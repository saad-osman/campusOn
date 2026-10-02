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
import { BentoCell, BentoGrid, type BentoSpan } from "@/components/bento/bento";
import { HomeCTA } from "@/components/home-cta";

const STEPS = [
  { icon: FileUp, title: "Upload your CV", body: "We read it and fill in your profile. You check every value before it's saved." },
  { icon: CheckCircle2, title: "See what you qualify for", body: "Every listing says eligible, almost, or not, and exactly why: “IELTS 6.5 required, you have none.”" },
  { icon: Users, title: "Find who to contact", body: "Researchers publishing in your area right now, with BITS and UAE labs highlighted." },
  { icon: Kanban, title: "Apply together", body: "A shared Application File with drafts, a checklist, a tracker and your teammates." },
];

const FEATURES: { icon: React.ElementType; title: string; body: string; span: BentoSpan; hero?: boolean }[] = [
  {
    icon: Target,
    title: "Explainable match scores",
    body: "0–100 with the top three reasons in plain language. No black box: topic fit, eligibility, field, time to prepare and funding.",
    span: 8,
    hero: true,
  },
  { icon: Search, title: "Search like you'd ask a senior", body: "“Funded summer AI internships in Europe for 3rd-years” becomes filters you can see and remove.", span: 4 },
  { icon: Mail, title: "Application copilot", body: "A checklist, an SOP draft and a short cold email, written only from facts in your profile.", span: 4 },
  { icon: Bell, title: "Change alerts", body: "Deadline moved? Funding changed? Everyone following it hears about it.", span: 4 },
  { icon: ShieldCheck, title: "Checked, not just scraped", body: "Low-confidence extractions wait for faculty review. Verified listings say so, and every card shows when it was last checked.", span: 4 },
  { icon: MapPin, title: "UAE & GCC first", body: "Regional sources, an “open to UAE residents” filter, and a near-you section.", span: 8 },
  { icon: CalendarClock, title: "Never miss a deadline", body: "Countdowns, a weekly digest, Telegram, and one-click calendar export with reminders.", span: 4 },
];

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-heading text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-16 pb-16 pt-2 sm:pt-6">
      {/* Full-width hero above the grid; the only gradient on the site. */}
      <section className="flex flex-col items-start gap-6 rounded-xl bg-gradient-to-b from-accent/70 to-transparent px-5 py-12 sm:px-10 sm:py-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden /> Built for BPDC students &middot; CampusOPS 2026
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-5xl font-semibold tracking-tight sm:text-6xl">Lodestar</h1>
          <p className="font-heading text-2xl font-medium tracking-tight text-primary sm:text-3xl">Find your direction.</p>
        </div>
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-balance text-lg font-medium">From discovery to a submitted application.</p>
          <p className="text-balance text-lg text-muted-foreground">
            Lodestar finds research internships, fellowships and scholarships, tells you which ones you actually qualify
            for, who to contact, and what to send, and lets you apply with your teammates.
          </p>
        </div>
        <HomeCTA />
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <SectionHeading id="how">How it works</SectionHeading>
        <BentoGrid>
          {STEPS.map((s, i) => (
            <BentoCell key={s.title} span={3} label={s.title}>
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary tabular-nums text-primary-foreground">{i + 1}</span>
                Step {i + 1}
              </span>
              <s.icon className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="font-heading text-base font-semibold tracking-tight">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </BentoCell>
          ))}
        </BentoGrid>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-4">
        <SectionHeading id="features">More than a list of links</SectionHeading>
        <BentoGrid>
          {FEATURES.map((f) =>
            f.hero ? (
              <BentoCell key={f.title} span={f.span} variant="hero" label={f.title} className="justify-end">
                <f.icon className="size-4 text-hero-muted" aria-hidden />
                <h3 className="font-heading text-2xl font-semibold tracking-tight text-gold">{f.title}</h3>
                <p className="max-w-xl text-sm text-hero-muted">{f.body}</p>
              </BentoCell>
            ) : (
              <BentoCell key={f.title} span={f.span} label={f.title}>
                <f.icon className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="font-heading text-base font-semibold tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </BentoCell>
            )
          )}
        </BentoGrid>
      </section>

      <section aria-labelledby="unis" className="flex flex-col gap-4">
        <SectionHeading id="unis">For universities and faculty</SectionHeading>
        <BentoGrid>
          <BentoCell span={6} label="For universities and faculty">
            <p className="text-sm text-muted-foreground">
              Faculty verify listings and endorse opportunities to the students they suit. Admins see coverage, quality and
              outcomes, and any portal can embed a live feed with one script tag.
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> Review queue and faculty endorsements</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> Analytics, success stories and CSV reports</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> Public API, RSS feed and embeddable widget</li>
            </ul>
            <Link href="/demo/portal" className="mt-auto w-fit text-sm font-medium underline-offset-4 hover:underline">
              See the widget on a sample university portal &rarr;
            </Link>
          </BentoCell>
          <BentoCell span={6} label="Widget embed code">
            <pre className="flex-1 overflow-x-auto rounded-lg bg-hero p-4 text-xs leading-relaxed text-hero-foreground" aria-label="Widget embed code">
              <Code2 className="mb-3 size-4 text-hero-muted" aria-hidden />
              {`<script src="https://your-lodestar.example/widget.js"
        data-degree="bachelors"
        data-field="computer science"
        data-region="uae"
        async></script>`}
            </pre>
          </BentoCell>
        </BentoGrid>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>
          <span className="font-heading text-sm font-semibold text-foreground">Lodestar</span> &middot; Find your direction.
        </p>
        <p>CampusOPS (IEEE BPDC), Problem Statement 03</p>
        <p>Demo listings are illustrative. Always confirm details on the official page before applying.</p>
      </footer>
    </div>
  );
}
