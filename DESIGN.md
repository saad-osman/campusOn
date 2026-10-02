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
**Does not:** Discover, Professors, Files and the Application File workspace, opportunity
detail, Settings, Onboarding, Admin, Faculty review/endorse, auth pages, demo portal. Those use
plain cards and lists.

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

Subtle and functional: color/shadow transitions ~150ms, chevrons rotate, sheets slide.
The home star twinkles slowly and stops under `prefers-reduced-motion`.

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
