<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verification

- `npm test` runs phone/form, calendar/contract/error-page rendering, and wedding/couple query regression tests using Node's test runner and the installed TypeScript compiler.
- `npx tsc --noEmit` checks TypeScript types.
- `npm run lint` runs ESLint; `npm run build` verifies the production Next.js build.
- Database changes belong in `supabase/migrations/`. Apply new migrations through the Supabase SQL editor or CLI before deploying code that references new columns or RPC parameters.
- `src/app/globals.css` uses Tailwind CSS v4's valid `@theme` directive. For editor at-rule warnings, use Tailwind CSS IntelliSense's Tailwind CSS language mode rather than removing the directive.
- Keep optional WhatsApp reads separate from core wedding/couple queries. The contact helper tolerates only a missing `whatsapp_phone` column; other database errors must not be treated as missing records.
