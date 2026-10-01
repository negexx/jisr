# ADR 0006: Program pages are statically generated; personal results are client leaves

**Status:** Accepted
**Date:** 2026-10-01

## Context

M3 built the guest journey: profile, matches, program page. Three forces shaped the program page. (1) Traffic is spiky and the hosting budget is fixed (Vercel Hobby, ADR 0004): pages must cost nothing per request and need no function call. (2) Trust: nothing on a page may claim freshness, a deadline status or a match result that depends on today's date or on a student's profile unless it was computed in that student's browser; a build-time page ages silently. (3) Privacy: a student's grades and nationality never leave the device, so the personal result cannot be rendered by a server.

## Decision

`/[locale]/programs/[slug]` is generated at build time: `generateStaticParams` takes the slugs from the snapshot through `src/lib/snapshot/server.ts` (the page starts with `import "server-only"`; the reader uses `fs` on `public/snapshots`), the `[locale]` layout supplies the locales, and `dynamicParams = false`. The HTML contains only facts independent of the clock and of the student. Everything else is a client leaf with a neutral server placeholder (so there is no hydration mismatch and no stale claim): freshness marks, the page-level aging/stale banner, the next-deadline line, and the personal result (status, route text, reasons, budget fit, nationality-filtered scholarships). The matching code is a separate chunk imported only when a profile exists. Profile and Matches are static shells with one client island each.

`dynamicParams = false` is not optional: Vercel does not trace `public/` into functions, so a request-time render of an unlisted slug would fail reading the snapshot (expected ENOENT and HTTP 500; reasoned from Vercel's behaviour, not verified on a deployment). With an empty `data/` the route has no pages and the real build passes (verified).

### Routing and 404 (decided in M3-T15)

- Production depends on the EXPERIMENTAL Next flag `experimental.globalNotFound` (Next 16.3.7) and `src/app/global-not-found.tsx`. The app has no root layout of its own (the `[locale]` layout renders `<html>`), so without the flag unknown paths and slugs get Next's bare English 404 with no `lang`.
- `dynamicParams = false` is set on the `[locale]` layout and inherited by its children. A future dynamic child under `[locale]` without `generateStaticParams` must set `dynamicParams = true` itself (the layout comment says so). Without it on the layout, `/no-such-file.txt` (the proxy skips paths with a dot) reached the layout with a bogus locale and produced a blank error shell.
- `src/app/[locale]/not-found.tsx` is effectively unreachable today: it renders only for a `notFound()` thrown while rendering a request under a valid locale, and no route does that. Next 16.3 does not server-render that boundary (it sends an empty `__next_error__` shell and the browser renders the page after the JavaScript loads), so it must not be relied on.
- A `[locale]/[...rest]` catch-all calling `notFound()` (the next-intl documented pattern) was tried and rejected: it returned 404 with an empty `__next_error__` shell and no content in the server HTML, and for unknown program slugs the browser's `_rsc` request fell into a 307 redirect loop (`ERR_TOO_MANY_REDIRECTS`) on Next 16.3.
- Trade-off: one trilingual page (French default, `<html lang="fr" dir="ltr">`, three sections with their own `lang` and `dir` so screen readers switch voice) answers every unmatched URL; it is not localized to the URL's locale.
- Upgrade checklist for any Next upgrade: does `[locale]/not-found.tsx` server-render now (then a per-locale 404 with a catch-all may work); is `globalNotFound` stable, renamed or removed; do unknown slugs still answer 404 with the global page. Guards: `tests/next-config.test.ts` (flag), `tests/app/global-not-found.test.tsx`, and the e2e 404 tests in `tests/e2e/empty-and-errors.spec.ts` (status, `lang`, `dir`, headings, axe).

## Alternatives considered

- **Fully client-rendered program pages** (one shell, data from the snapshot in the browser): rejected because the official facts and their sources would be absent from the HTML (SEO, no-JavaScript readers, link previews) and every visit would pay the fetch before any content.
- **Server-rendered per request (dynamic)**: rejected: needs a function call per view (Hobby caps), cannot read `public/` on Vercel, and still cannot compute the personal result because the profile must not leave the device.
- **`dynamicParams = true` with a request-time guard**: rejected, for the Vercel reason above; a build-phase check at request time is a hack.

## Consequences

- Positive: program pages cost nothing to serve; nothing personal or time-dependent is in the HTML (tested: no status, route, budget sentence, intake status, freshness or banner in the static output); an old build cannot claim freshness.
- Negative: `next start` (and any Node host) logs `Error: Internal: NoFallbackError` for every unknown slug while answering the correct 404. This is Next's own logging of its fallback-false path; filter it out of Sentry when Sentry arrives. Behaviour on Vercel (global 404, fallback false) is not verified.
- Negative: the 404 depends on an experimental flag and is not localized per URL.
- Negative: the static page ships the client message catalogue of its nested provider inside its script payload (public text, not student data); any "HTML contains no profile-dependent text" check must ignore script tags.
- Neutral: the static server output contains cost-line fact references stamped with a fixed date; the stamp is never displayed or sent to a client leaf (`SourceBadge` passes only fact metadata).

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one; do not edit this in place.
