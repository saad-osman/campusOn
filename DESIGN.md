# Lodestar design system

The "Oxford" look: navy ink on warm paper in light mode, gold on deep navy in dark mode.
Everything below is what the code does today. Tokens live in `frontend/app/globals.css`
(Tailwind v4, `@theme inline`; there is no `tailwind.config`). Components are shadcn/ui
(`radix-nova` style) in `frontend/components/ui/`.

## Color tokens

Always use the semantic token classes (`bg-card`, `text-muted-foreground`, `border-border`...),
never raw values. Light / dark values are oklch.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | Page | warm paper `0.985 0.004 85` | deep navy `0.18 0.035 260` |
| `--foreground` | Body text | navy `0.21 0.03 260` | cream `0.95 0.01 85` |
| `--card` / `--popover` | Cards, menus | white | `0.22 0.038 260` |
| `--raised` | Floating surfaces (home preview cards) | white | `0.24 0.03 260` |
| `--sidebar` | Filter sidebar / sheet | white | `0.21 0.03 260` |
| `--primary` | Buttons, active states, checked controls | navy `0.33 0.08 260` | gold `0.82 0.11 85` |
| `--secondary`, `--muted` | Quiet fills, tracks, skeletons | warm greys | navy steps `0.27` / `0.26` |
| `--muted-foreground` | Secondary text, icons | `0.5 0.02 260` | `0.7 0.02 260` |
| `--accent` | Gold-tinted fill (icon tiles, demo banner) | `0.95 0.03 85` | `0.29 0.04 260` |
| `--border`, `--input` | Hairlines, switch off-track | `0.9 0.01 85` | white 9% / 14% |
| `--ring` | Focus ring | gold | gold |
| `--destructive` | Errors, delete | red `0.55 0.2 27` | `0.7 0.18 25` |
| `--gold` | Decorative gold: logo star, badge tints and rings, score ring | `0.8 0.12 85` | `0.83 0.11 85` |
| `--honor` | Readable gold *text*: endorsements, verified, icon tiles, counts | `0.52 0.11 75` (4.5:1) | = gold |
| `--hero`, `--hero-foreground`, `--hero-muted` | Bento hero cells, code blocks: navy in **both** modes | | |
| `--grid-dot` | Home star-chart dots | navy 14% | gold-grey 18% |
| `--folder-back` / `--folder-front` | FolderFloat folder on /files (back = `--hero` navy, front one step lighter) | `0.33` / `0.39 0.08 260` | `0.27` / `0.32` navy, above `--card` |
| `--folder-paper` / `--folder-pill` / `--folder-pill-ink` | Folder paper and document pills: warm paper with navy ink, both modes | paper `0.97`, pill `0.985 0.004 85` | paper `0.95`, pill `0.97 0.01 85` |
| `--folder-label` | Folder flap label (= `--hero-foreground`); the sublabel uses `--gold` | | |
| `--chart-1..5` | shadcn chart slots (navy/gold family) | | |

Rules of thumb: gold as a *fill or line* uses `gold`; gold as *text* uses `honor` (pure gold
fails contrast on white). `primary` flips navy to gold in dark mode, so anything that must stay
navy (hero cells) uses `hero`.

## Never-change colors

These encode meaning and are tuned independently of the brand. Do not retheme them.

- **Eligibility pills** (`components/opportunity/eligibility-badge.tsx`): eligible = emerald,
  partially eligible = amber, not eligible = rose; `bg-*-500/12`, `ring-*-600/25`, 700/800
  text in light, 300 text in dark.
- **MatchScore tones** (`components/opportunity/match-score.tsx`): >=75 emerald, >=55 sky,
  >=35 amber, else rose (600 light / 400 dark). The home hero uses its own gold
  `PreviewScore`; the app's `MatchScore` stays as is.
- **`--series-1..3`** (blue / orange / green) plus `--viz-grid`, `--viz-axis`: the validated
  categorical palette for admin charts (`components/admin/charts.tsx`), fixed order.
- **Status semantics** elsewhere follow the same family: emerald = good, amber = warning,
  rose = urgent/danger (deadline under 7 days, unread badge), sky/slate = tracker states.
  Always paired light/dark shades. These are the only raw Tailwind palette colors allowed.

## Typography

- **Fraunces** (`font-heading`, weights 500/600, via `next/font/google`): page titles,
  section and card headings, the wordmark, the hero tagline. Never for body text or UI labels.
- **Geist Sans** (`font-sans`, default): everything else. **Geist Mono** (`font-mono`): code,
  embed snippets.
- Page title: `font-heading text-2xl font-semibold tracking-tight`. Home h1 only:
  `text-5xl sm:text-6xl`. Section headings: `text-2xl`; card/cell headings: `text-base`
  (card titles may use `text-lg`).
- Section labels: `text-xs font-medium uppercase tracking-wider text-muted-foreground`.
- Numbers that change or align (counts, scores, progress): `tabular-nums`.
- Icons: Lucide only, one stroke weight (`svg.lucide { stroke-width: 1.75 }`), `size-4`
  inline, `size-5` in an `IconTile`.

## Bento (`components/bento/bento.tsx`)

- `BentoGrid`: 1 column on mobile, 6 on `md`, 12 on `lg`; `gap-4`; rows `minmax(140px, auto)`.
- `BentoCell` props:
  - `span`: 3 | 4 | 6 | 8 | 12 only (so edges align). On tablet, 3 pairs up, the rest go full width.
  - `rows`: 1 | 2. `order`: first | default | late | last (reorders on phones only).
  - `variant`: `standard` (card surface) or `hero` (navy `bg-hero`, gold-tinted border in
    dark). **At most 1-2 hero cells per page.**
  - `href` makes the whole cell a link (only when it holds no other links); hover changes
    border and shadow, never size.
- Every cell: `rounded-xl p-5 gap-3`, left-aligned. `BentoHeader` = small muted icon +
  serif `text-base` title + optional `BentoAction` ("View all" link, `text-xs`).

**Uses bento:** Home (`app/page.tsx`: How it works, features, universities) and Dashboard.
**Does not:** Discover, Compare, Professors, Files and the Application File workspace, opportunity
detail, Settings, Onboarding, Admin, Faculty review/endorse, auth pages, demo portal. Those use
plain cards and lists.

**Dashboard layout** (`app/dashboard/page.tsx`). No cell spans two rows; each row's cells hold
similar amounts of content. Phone order is source order (greeting, hero, stats, ...):

| Row | Cells (span) | Notes |
|---|---|---|
| 1 | Greeting (8) · TopMatchHero / DeadlineHero (4, **hero**) | greeting: date, "Welcome back", count summary, search, suggested searches, completeness bar if < 100% |
| 2 | Saved · Due this week · Strong matches · Application Files (3 each) | whole cell links; `font-heading text-4xl` count-up number; due > 0 gets a rose border |
| 3 | Top matches (6) · Deadline timeline (6) | 4 match rows: score, 2-line title, up to 2 reason chips, pill + deadline on the right |
| 4 | Continue where you left off (8) · Application Files (4) | files: name, up to 3 member initials, nearest deadline |
| 5 | Near you: UAE & GCC (6) · Recommended by faculty (6) | Near you excludes the hero and Top matches; faculty name once per row |
| 6 | Notifications (12) | up to 6, two columns on lg, an icon per type, footer "N unread · Mark all read" |

Every empty state is an `IconTile`, one sentence and a primary action; every loading state is a
skeleton shaped like the final rows.

**Deadline timeline** (`components/dashboard/deadline-timeline.tsx`): the next 30 days as a
track (Today marker, week ticks). Each saved deadline in range is a focusable link marker placed
by days left: rose ≤ 7 days, amber ≤ 14, `muted-foreground` otherwise; same-day markers stack.
Below it the next 3 deadlines and a legend. Plain divs and tokens, no chart library or gradient;
at phone width the track scrolls inside the cell (`scrollbar-none`). With nothing in range it
lists the next saved deadlines further out.

**Settings layout** (`app/settings/layout.tsx`): title + "name · email", then on lg a sticky
left nav (`w-56`, `bg-sidebar rounded-xl border`, under `--header-h`, `aria-current` on the
active link) beside a `max-w-2xl` column of standard cards (`CardTitle font-heading text-base`).
Below lg the nav is a horizontal tab row (`overflow-x-auto scrollbar-none`). Sections:
Profile (one form, sticky save bar only when dirty), Notifications, Account & access (danger
zone last).

**Nav** (`components/nav.tsx`): every link is a `size-4` Lucide icon + label (`gap-1.5`, the
icon inherits the text colour), in the desktop row and the mobile sheet alike. Dashboard
`LayoutDashboard`, Discover `Compass`, Compare `Columns3`, Professors `GraduationCap`, Files
`Folder`, Review `ClipboardCheck`, Endorse `BadgeCheck`, Admin `ChartColumn`. Compare carries a
count badge when non-empty (`rounded-full bg-primary text-primary-foreground text-[11px]
font-semibold tabular-nums`, 18px tall).

**Compare** (`app/compare/page.tsx`, list in `lib/compare.ts`): up to 4 opportunities, kept per
user in localStorage (`lodestar:compare:<userId>`), not in `/api/state`. The only way in is the
"Add to compare" outline button on the opportunity page's action row (`Columns3`); when on it
reads "In compare" with `Check`, `aria-pressed`, and the honor tint (`bg-accent text-honor
border-honor/30`). Adding toasts "Added to compare · N of 4" with a View action; a fifth is
refused with an error toast. The page: title + one muted line; three summary cards (Best match,
Closes first, Eligible now; section label with a `size-4` icon, semibold value, muted line); a
toolbar ("Show differences only" switch, "N of 4 slots", ghost "Clear all" behind an
AlertDialog); then one standard card holding a real `<table>` (`table-fixed min-w-[640px]`,
scrolls sideways inside the card on phones) with a sticky `w-[168px]` row-label column, a header
per opportunity (remove `X`, 2-line title link, organisation, SaveButton), a dashed "Add from
Discover" slot column while under 4, and `bg-muted` section rows (Fit, Timing and money, Details,
Requirements, Trust and people). **Best here:** with 2+ items and differing values, the winning
cell(s) get `bg-accent/70` and a `text-honor text-[11px]` "Best here" with a small gold star, for
match score, eligibility (eligible > partial > unknown > not), most days left, funding (fully
funded > stipend > partial > unfunded > unknown), endorsements and sources. The Researchers row
(never hidden by the diff toggle) ends with a `text-[11px]` source note: `Database` "From saved
Semantic Scholar results", `Sparkles` "Suggested by AI. Check before contacting", or
`FlaskConical` "Sample researchers (fictional)". Opportunities that 404 or stop being active
are dropped with one toast. Motion: see "Compare page" under Motion.

**Server waking screen** (`components/server-waking.tsx`, state in `lib/backend-status.ts`):
when `/api/health` fails (or a check takes over 2.5s), every page except Home shows one
standard card in place of its content, centred like the auth pages (`max-w-sm py-16`):
a `LatticeLoader` row (3x3 round "orbit" lattice, navy dots in light mode and `gold` in dark, beside "Waking up the server" in
`font-heading` 18px semibold, then a Geist Mono stopwatch), and one sentence. It retries every
4s; after 2 minutes the lattice dissolves into a rose cross, the label reads "Not responding
after" with the frozen time, and a full-width "Try again" button appears. The page stays mounted underneath (`hidden`), so forms keep their values,
and queries refetch once the server answers. Never show "Log in / Sign up" or a logout
redirect just because the session check failed: `undefined` user = unknown, `null` = logged out.

Home is exempt from the card, so its CTAs render immediately: while the session is unknown they
use the readable `lodestar_hint` cookie (`lib/session-hint.ts`, kept by `middleware.ts` and
set/cleared on login/logout): hinted in → "Open your dashboard", otherwise "Get started free".
Clicking through lands on the waking card. The nav does not use the hint, and on Home it shows
only the wordmark and theme toggle (no links, bell, account menu or Log in / Sign up); elsewhere
its links and account menu appear only once the real session confirms the user. The hint only decides what to show; it
never grants access, and the real session replaces it as soon as it loads. Before hydration a
`<head>` script marks `<html>` with `hint-in` so the signed-out CTAs stay invisible (space kept)
for a hinted visitor, with no flash.

## Cards and surfaces

- One card recipe everywhere: `rounded-xl border bg-card` + `shadow-[0_1px_2px_rgb(0_0_0/0.04)]`
  (shadcn `Card`, `OpportunityCard`, bento cells). Padding `p-4` (cards) or `p-5` (bento).
- Interactive cards change border color on hover (`hover:border-primary/40`) only.
- Floating/overlapping elements (home preview only): `bg-raised`, 1px border, larger soft shadow.
- Filter sidebar: `bg-sidebar rounded-xl border`, sticky under the nav (`--header-h`),
  sections `px-5 py-4` split by `divide-y`, inner scroll with `.scrollbar-thin`.
- `IconTile`: `size-10 rounded-lg border-honor/20 bg-accent` with a `size-5 text-honor` icon.
- Pills/badges/chips: `rounded-full`, `text-xs font-medium`, tinted bg + inset ring.

## Spacing and radius

- `--radius: 0.5rem`. Cards, cells, panels: `rounded-xl`. Icon tiles, dropdowns, inner
  blocks: `rounded-lg`. Inputs/buttons: shadcn defaults (`rounded-md`). Pills: `rounded-full`.
- App shell: `max-w-6xl mx-auto px-4 py-6`. Page stacks `gap-6`; home sections `gap-16`.
- Inside components: `gap-2` / `gap-3` / `gap-4` (most common), `gap-1.5` for icon + label.
  Stick to the Tailwind scale; no arbitrary pixel spacing except the documented star-chart
  geometry.
- Buttons in hero/CTA rows are `h-11`; elsewhere default/`sm` shadcn sizes.

## Motion

Motion explains order and change; it never decorates. Shared helpers live in `lib/motion.ts`:
`usePrefersReducedMotion()`, `prefersReducedMotionNow()`, `useCountUp()` and `EASE_OUT`
(`cubic-bezier(0.2, 0.7, 0.2, 1)`, the one entrance easing).

| Component (`components/motion/`) | Where | What |
|---|---|---|
| `BlurText` | Home hero only | "Lodestar" (`h1`) letter by letter: 70ms apart from 100ms; tagline word by word: 150ms apart from 650ms; 0.35s per step, blur 10→0, y ±50→0 |
| `ScrollReveal` | Home section headings only | Words fade 0.1→1 and unblur 4px→0, heading rotates 3°→0, scrubbed to scroll (reverses going up) |
| `ScrollRevealGroup` | Home "How it works" and features bento grids only | Cells fade in, rise 16px, unblur 4px, stagger 0.12, scrubbed; wraps the whole `BentoGrid` (`:scope > div > *`) |
| `LatticeLoader` | Server waking screen only | React Bits loader: cells light in a wave (CSS, `lattice-loader.css` in `@layer components`), the stopwatch ticks; on give-up it freezes into a cross. Reduced motion: the lattice is still, half lit |
| `FolderFloat` | `/files` only (`next/dynamic`, `ssr: false`) | Each Application File's documents spring out of a folder as draggable pills (matter-js); hover (mouse) or tap opens it |

Other motion:
- **Home hero entrance** (`globals.css`): preview cards `.hero-rise` 750ms (main card at 700ms,
  checklist at 950ms); progress fill `.hero-fill` scales 0→1 over 1000ms at 1500ms; the
  `PreviewScore` counts up over 1000ms at 1000ms; the star `.star-intro` (0.5→1, 800ms at
  1200ms) then twinkles from 2000ms. Keyframes use the `translate`/`scale` properties, never
  `transform`, so the star keeps its grid-dot position.
- **Discover results:** `OpportunityCard enterIndex={i}` fades and slides cards in (500ms,
  `min(i, 8) × 60ms` stagger) and delays the score count-up to match. The results grid is keyed
  only on settled data, so a new query, filter or sort replays it; a save toggle, a background
  refetch or placeholder data does not. Without `enterIndex` a card is static.
- **Compare page:** the same timing as Discover. The three summary cards fade and rise in
  (500ms, 60ms apart), then each opportunity column's cells (header included) follow, one step
  per column; the row-label column stays put. Count-ups start 150ms after their element: the
  Best match score, the Eligible now count, and per column the `MatchScore`, endorsement count
  and source count. A column animates only in its first 1.5s on screen, so removing another
  column, a re-render, or "Show differences only" revealing rows never replays it.
- **`MatchScore`:** counts up over 1000ms by default (`animate`, `delay`); colour and label always
  use the final score. Dashboard tiles ripple down each list instead of all at once
  (`delay = min(index, 8) × 60ms + 150ms`, the same timing as Discover's cards).
- **Filter groups:** Radix Collapsible height animation (300ms) via `motion-safe:` classes, and
  the chevron rotates over 300ms.
- **Elsewhere:** colour, border and shadow transitions ~150ms; sheets and menus slide.

Rules:
- **Reduced motion is mandatory:** final state immediately, with no blur, movement, count-up,
  collapsible animation, twinkle or physics (opacity fades of 200ms or less are allowed). Gate
  JS animations on `usePrefersReducedMotion()`, and check `prefersReducedMotionNow()` again
  before creating GSAP triggers; use `motion-safe:` for Tailwind animations.
- **Animate only `transform`/`translate`/`scale`, `opacity` and `filter`**, never width, height
  or margins. The one exception is the Collapsible height animation from tw-animate-css.
- BlurText and ScrollReveal stay on the home page; motion elsewhere is functional, not showy.
- No layout shift and no hydration warnings: anything server-rendered starts in a state the
  server can produce (BlurText has a CSS reduced-motion fallback; count-ups render the final
  number on the server).

## Don't

- **No gradients**, except the home hero star chart (dot grid and its masks).
- **No raw Tailwind brand colors** (`bg-blue-600`, `text-indigo-*`...). Brand color comes from
  tokens; raw palette colors are only for the status semantics above.
- **No glassmorphism.** The only blur is the sticky nav (`bg-background/95 backdrop-blur`) so
  content doesn't show through; don't add frosted cards or panels.
- **No emoji as UI icons.** Use Lucide. (A user-chosen Application File icon is user data
  and renders inside an `IconTile`.)
- **No scale-on-hover** or other size changes on hover; use border/shadow/color.
- Don't put `gold` text on light surfaces (use `honor`), and don't use `primary` where navy
  must survive dark mode (use `hero`).
