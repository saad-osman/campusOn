# Lodestar frontend

Next.js 14 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui, TanStack Query.
Setup, demo accounts and the full project overview are in the [root README](../README.md);
UI rules are in [DESIGN.md](../DESIGN.md).

```bash
npm install
npm run dev      # http://localhost:3000 (expects the API on :8000; /api is proxied)
npm run build    # production build into .next
npm run lint
npx tsc --noEmit
```

`next dev` writes to `.next-dev` and `next build` to `.next`, so a build never disturbs a
running dev server. Run only one dev server at a time.

## Layout

- `app/`: routes. `globals.css` holds every design token (there is no `tailwind.config`).
- `components/ui/`: shadcn primitives. Feature folders: `bento/`, `brand/`, `home/`,
  `discover/`, `opportunity/`, `workspace/`, `professors/`, `settings/`, `admin/`.
- `lib/`: API client (`api.ts`), React Query hooks per domain, shared `types.ts`, `format.ts`.
- `public/`: embeddable `widget.js`, `sample-cv.docx`, PWA icons.
- `scripts/generate-icons.mjs`: regenerates app icons from the Lodestar mark (dev-only, uses
  `sharp`; never imported by app code).
