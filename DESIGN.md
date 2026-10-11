---
name: Jisr
description: A confident, atmospheric bridge from a school-leaver's profile to real, honestly labelled study options in Europe. Navy ink on a cool near-white canvas, one electric-indigo accent, thin display type, and soft navy-tinted depth — trust carried by source badges, never by gloss.
colors:
  navy-ink: "oklch(0.2591 0.0544 250.72)"
  ink-secondary: "oklch(0.3405 0.0485 255.87)"
  ink-muted: "oklch(0.4968 0.0408 260.28)"
  indigo: "oklch(0.5211 0.2679 277.43)"
  indigo-deep: "oklch(0.4621 0.23 276.92)"
  indigo-press: "oklch(0.3614 0.1551 276.67)"
  indigo-soft: "oklch(0.5836 0.2282 278.87)"
  indigo-wash: "oklch(0.9684 0.016 289.93)"
  navy-band: "oklch(0.2701 0.0962 276.24)"
  canvas: "oklch(0.995 0.002 250)"
  canvas-soft: "oklch(0.9807 0.0051 247.88)"
  hairline: "oklch(0.9289 0.0097 252.81)"
  control-slate: "oklch(0.5552 0.0435 259.24)"
  official-teal: "oklch(0.5109 0.0861 186.39)"
  official-wash: "oklch(0.942 0.034 189)"
  estimate-ink: "oklch(0.4469 0.0845 75.89)"
  estimate-cream: "oklch(0.925 0.075 88)"
  guidance-ink: "oklch(0.4968 0.0408 260.28)"
  guidance-wash: "oklch(0.9807 0.0051 247.88)"
  match-green: "oklch(0.528 0.1208 155)"
  match-green-ink: "oklch(0.475 0.115 155)"
  match-green-wash: "oklch(0.9612 0.0173 159.12)"
  check-amber: "oklch(0.5553 0.1455 49)"
  check-amber-ink: "oklch(0.5553 0.1455 49)"
  check-amber-wash: "oklch(0.9685 0.0203 74.66)"
  fail-red: "oklch(0.5433 0.174 29.7)"
  fail-red-ink: "oklch(0.5003 0.1821 29.51)"
  fail-red-wash: "oklch(0.956 0.0187 25.6)"
  error-red: "oklch(0.5433 0.174 29.7)"
  error-blush: "oklch(0.956 0.0187 25.6)"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 600
    lineHeight: 1.35
  subtitle:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "7.2px"
  md: "9.6px"
  lg: "12px"
  xl: "16.8px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "88px"
  tap: "48px"
shadows:
  sm: "0 1px 2px rgba(13, 37, 61, 0.08), 0 1px 1px rgba(13, 37, 61, 0.04)"
  md: "0 12px 30px -12px rgba(13, 37, 61, 0.22), 0 2px 6px rgba(13, 37, 61, 0.06)"
  lg: "0 30px 60px -24px rgba(28, 30, 84, 0.35), 0 6px 16px rgba(13, 37, 61, 0.08)"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-deep}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.indigo}"
    rounded: "{rounded.pill}"
  text-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.control-slate}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "48px"
  choice-row-selected:
    backgroundColor: "{colors.indigo-wash}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.indigo}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "48px"
  source-badge-official:
    backgroundColor: "{colors.official-teal}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  source-badge-estimate:
    backgroundColor: "{colors.estimate-cream}"
    textColor: "{colors.estimate-ink}"
    borderColor: "{colors.estimate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  source-badge-guidance:
    backgroundColor: "{colors.guidance-wash}"
    textColor: "{colors.guidance-ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  match-status-ok:
    backgroundColor: "{colors.match-green-wash}"
    textColor: "{colors.match-green-ink}"
    borderColor: "{colors.match-green}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  match-status-check:
    backgroundColor: "{colors.check-amber-wash}"
    textColor: "{colors.check-amber-ink}"
    borderColor: "{colors.check-amber}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  match-status-failed:
    backgroundColor: "{colors.fail-red-wash}"
    textColor: "{colors.fail-red-ink}"
    borderColor: "{colors.fail-red}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  page-band:
    backgroundColor: "{colors.indigo-wash}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.display}"
    padding: "40px 16px 32px"
  status-summary:
    textColor: "{colors.navy-ink}"
    typography: "{typography.label}"
  match-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.xl}"
    padding: "24px"
    shadow: "{shadows.sm}"
  empty-state:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.navy-ink}"
    typography: "{typography.title}"
    padding: "40px 0"
  skeleton:
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.xl}"
  feature-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.navy-ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    padding: "24px"
    shadow: "{shadows.sm}"
  profile-strip:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  dark-band:
    backgroundColor: "{colors.navy-band}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.xl}"
    padding: "48px"
---

# Design System: Jisr

## 1. Overview

**Creative North Star: "The Gradient Bridge"**

Jisr means bridge. The product is still a calm, plainly spoken crossing from a school-leaver's profile to real, honestly labelled options — but it now looks and feels like the craft is on purpose. The interface opens with an atmospheric indigo wash over a cool near-white canvas, sets its headline in thin Geist with tight tracking, and floats one near-white card of real product (the hero match demo) at the gradient's edge. Depth is soft and navy-tinted; motion is small and physical. The student decides alone on a mid-range phone, so every flourish stays cheap, legible and task-serving.

**This world supersedes "The Plain Bridge."** The incumbent system (warm paper, hue-90 neutrals, deep teal ink, flat surfaces, a ban on shadows) is kept only as evidence and anti-reference. The trust semantics, product truth, copy voice, content, RTL discipline and privacy rules are unchanged; the *look* is replaced. Where a later component still reads warm-paper or teal-accented, it is un-migrated, not a deliberate exception.

The palette is navy ink on a cool near-white canvas with a single electric-indigo accent for anything that can be pressed, followed or is current. Teal is no longer the brand colour: it is reserved for the "official" fact-kind, a trust semantic. Match green, amber and red keep their meaning. Depth comes from one soft shadow scale, not from tone alone, and never from glassmorphism or gradient text. Light theme only.

**Key Characteristics:**
- Cool near-white canvas (`#ffffff` intent, authored imperceptibly off pure white), navy-ink text, hairline borders.
- One accent: electric indigo. Primary buttons, links, the current nav underline, focus, selected-choice borders.
- Teal reserved for the official fact-kind only. Estimates are dashed cream; guidance is grey.
- Thin display type: Geist at weight 300 with `-0.03em` tracking on the display step; 400/500/600 for UI.
- Soft, navy-tinted shadows (`shadow-sm`/`md`/`lg`) give cards and floating panels their lift.
- Every fact wears its kind pill, verified date and official source link.
- RTL is native: logical properties only, mirrored directional icons, Latin isolated in `<bdi>`, Latin digits in Arabic.
- Motion is 150–220 ms colour and transform only, and none under `prefers-reduced-motion`.

## 2. Colors

OKLCH is the canonical format (it is what `src/app/globals.css` defines); the hex values named here are the visual intent. The Stitch linter warns about non-hex colours and that warning is accepted. Tokens live in `:root`; Tailwind utilities are mapped in `@theme inline`.

### Accent
- **Indigo** (`--primary`, `#533afd`): The only accent. Primary buttons, links, the current-nav underline, focus ring, selected choice borders.
- **Indigo Deep** (`#4434d4`): Hover and press-warmth for the primary; also `--accent-foreground` on the indigo wash.
- **Indigo Press** (`#2e2b8c`): Pressed-state lift.
- **Indigo Soft** (`#665efd`): Product-UI accents and chart highlights.
- **Indigo Wash** (`--accent`, `--indigo-wash`, `#f4f3ff`): The pale fill behind selected rows and soft tags.

### Surface
- **Canvas** (`--background`, `--card`, `--popover`): The page, cards and popovers. Authored as a near-white `oklch(0.995 0.002 250)`, never literal `#fff`.
- **Canvas Soft** (`--secondary`, `--muted`, `--canvas-soft`, `#f6f9fc`): Feature bands, footer, input groups, hover fills, the locale track.
- **Navy Band** (`--navy`, `#1c1e54`): The one full-bleed dark band and its gradient.
- **Hairline** (`--border`, `#e3e8ee`): The default 1px border and divider.
- **Control Slate** (`--input`, `#64748d`): Input and outline-button borders, sized to meet 3:1 against the canvas.

### Text
- **Navy Ink** (`--foreground`, `#0d253d`): Body text. Deep navy, never black.
- **Ink Secondary** (`--secondary-foreground`, `#273951`): Lead paragraphs, nav links, secondary text on white.
- **Ink Muted** (`--muted-foreground`, `#55637a`): Hints, captions, table labels, inactive nav.

### Status (match status only)
- **Match Green** (`--status-ok`, `-fg`, `-bg`, `-border`, `#1a7f4b`): "Published requirements appear met". Icon and border in the base, text in `-fg`, wash fill.
- **Check Amber** (`--status-check`, `-fg`, `-bg`, `-border`, `#b45309`): "Something to check" and the foundation-year route. Also aging and stale freshness chips.
- **Fail Red** (`--status-fail`, `-fg`, `-bg`, `-border`, `#c0392b`): "Published requirements not met".
- **Error Red / Error Blush** (`--destructive`, `--destructive-bg`): Form errors and the destructive button only. Never a match status.

### Fact kinds
- **Official Teal** (`--kind-official`, `#0f766e`): Filled pill, light text, shield-check icon. The teal is a trust semantic reserved for official facts.
- **Estimate Cream** (`--kind-estimate`, `#6f4d13`; `--kind-estimate-bg`, `#fbeecb`): Dashed warm-cream outline on a cream fill, calculator icon. Tuned so it can never read as an official or a check colour.
- **Guidance Grey** (`--kind-guidance`, `#55637a`; `--kind-guidance-bg`, `#f6f9fc`): Solid hairline outline on a soft fill, info icon.

### Named Rules
**The One Voice Rule.** Electric indigo is the only accent. It marks what can be pressed, followed or is current. It never decorates.

**The Words-Beside-Colour Rule.** Status never relies on colour alone. Every status colour ships with an icon and a sentence, and the three fact kinds also differ in fill, border style and icon.

**The Source-Always Rule.** No fact without its source badge: kind, verified date and official source link travel with every important fact, in every component and on every page.

**The One Mapping Rule.** Match status becomes icon, colour and text in `MatchStatusBadge` only. No other component re-implements the mapping.

**The Never-Official Rule.** Estimate and guidance are never styled or worded as official: no teal fill, no shield, no "official" language, and "go to the official page" wording appears only on official facts.

**The Status-Is-Status Rule.** Green, amber and red mean match status and nothing else — never success toasts, tags or emphasis. Amber is also permitted for freshness warnings, because those share the same "check this" meaning.

**The No-Pure-Black Rule.** No `#000` or `#fff`. The canvas is a cool near-white with a faint cool tint; ink is navy; every neutral stays cool.

## 3. Typography

**Display Font:** none as a second face. Geist carries display and body; Noto Sans Arabic carries `ar`.
**Body Font:** Geist (with `system-ui, sans-serif`).
**Arabic:** Noto Sans Arabic, loaded lazily, applied on `:lang(ar)` and `html[lang="ar"]`.

**Character:** One humanist-geometric sans, hierarchy from size, weight and tracking. The display tier is thin (300) with tight negative tracking — the world's typographic signature. Arabic reads about 1px larger (root 106.25%) with 1.75 leading. No second typeface, no new font file, no new font dependency.

### Hierarchy
- **Display** (300, 3.5rem / 56px, 1.05, tracking `-0.03em`; `--text-display`): The hero headline and every product page's band title. One per page.
- **Headline** (300, 1.75rem / 28px, 1.25, tracking `-0.03em`): Section openers and group/section headings (the Matches groups, Scholarships country headings and the Plan program heading).
- **Title** (600, 1.4375rem / 23px, 1.35): Section and empty-state headings.
- **Subtitle** (600, 1.1875rem / 19px, 1.5): Card titles, wordmark.
- **Body** (400 to 500, 1rem / 16px, 1.5): Everything readable; inputs never below 16px. Prose capped at `max-w-prose`.
- **Label** (500, 0.875rem / 14px, 1.5): Badges, source lines, hints, fact captions. `tabular-nums` for money.

### Named Rules
**The Display-Is-Thin Rule.** The display and section openers render at weight 300 with `-0.03em` tracking. Bumping them to 400+ collapses the editorial air that makes the world feel expensive.

**The Fixed Scale Rule.** Only 14, 16, 19, 23, 28 and 56 px (plus `text-xs` for tiny labels inside dense controls). No fluid clamp, no in-between sizes.

**The Isolated Latin Rule.** Official names, URLs, hostnames, currency codes and amounts sit in `<bdi>` (amounts and URLs with `dir="ltr"`) so Arabic sentences never reorder them. Digits are always Latin.

**The Arabic Leading Rule.** Under `lang="ar"` the root scales to 106.25% and line heights rise to 1.75, easing to 1.6 and 1.5 across the three largest steps (xl 1.6, 2xl and display 1.5); the display step also resets its letter-spacing to zero, because cursive Arabic never takes negative tracking. Tap targets grow with the root; the target is 48px.

## 4. Elevation

Soft depth is allowed and expected: surfaces lift off the canvas with a navy-tinted shadow rather than with a heavy border. Three steps exist — `--shadow-sm`, `--shadow-md`, `--shadow-lg` — mapped to `shadow-sm`/`shadow-md`/`shadow-lg`. They are navy-tinted (`rgba(13, 37, 61, …)` / `rgba(28, 30, 84, …)`) so depth stays cool, never grey.

### Shadow Vocabulary
- **`shadow-sm`** (`0 1px 2px rgba(13,37,61,.08), 0 1px 1px rgba(13,37,61,.04)`): At-rest cards, source pills, the current locale chip, the segmented control's selected segment.
- **`shadow-md`** (`0 12px 30px -12px rgba(13,37,61,.22), 0 2px 6px rgba(13,37,61,.06)`): Card hover lift, dropdowns and popovers.
- **`shadow-lg`** (`0 30px 60px -24px rgba(28,30,84,.35), 0 6px 16px rgba(13,37,61,.08)`): The one hero demo panel and modal overlays.

### Named Rules
**The Soft-Depth Rule.** Lift with `shadow-sm` at rest and step up to `shadow-md` on hover; reserve `shadow-lg` for the single hero panel and modals. Never stack shadows on the same element, and never glow.

**The Hairline-Still-Works Rule.** A card at rest may pair `shadow-sm` with the 1px hairline, but the shadow is the lift: if a surface looks like it floats for no reason, remove the step, not the border.

## 5. Shape and Spacing

- **Radius**: inputs and cards share the 12px (`--radius`) family (`rounded-lg`, `rounded-xl` for cards); buttons and badges are fully rounded pills (`rounded-full`). `rounded-md` (9.6px) is for compact badges and alerts.
- **Spacing**: an 8px base with the existing sub-tokens. Marketing/hero sections breathe at ~88px; product sections tighten to 32–48px; card padding is 24px (32px on feature cards from 768px).
- **Tap targets**: 48px by default; `sm` is 44px on phone and 36px from 768px.
- **Layout**: one column on phone; content capped at 64rem. Prose capped at `max-w-prose`.

## 6. Components

### Buttons
- **Shape:** Fully rounded pill. 48px tall by default and in `lg`; `icon` is 48px square. `sm` is 44px on phone and 36px from 768px.
- **Primary:** Indigo fill, near-white text, 16px medium, 22px side padding, 9px icon gap, soft indigo-tinted shadow. Hover shifts to Indigo Deep and lifts 1px.
- **Secondary / Outline:** Canvas fill with a Hairline border and `shadow-sm`; hover lifts to `shadow-md`.
- **Ghost / Link:** No fill until hover; indigo text.
- **Destructive:** Error Blush fill with a 30% Error Red border and Error Red text.
- **Hover / Focus / Active:** 150–220 ms colour and transform transition (`cubic-bezier(.2,.8,.2,1)`). Focus is the global 2px indigo ring at 2px offset. Disabled is 50% opacity.

### Source Badge (signature)
The trust surface. Every fact line carries: a kind pill (Official filled teal with shield-check; Estimate dashed cream with calculator; Guidance grey outline with info), the verified date ("Verified on DD/MM/YYYY") in Ink Muted, a "Source" external link, and, when aging or stale, a freshness mark in Check Amber. The compact variant is one wrapping row; the full variant adds the meaning sentence and, for estimates, a "how we estimated" disclosure. Pills are fully rounded, 14px medium, 10px side padding, `shadow-sm`.

### Match Status Badge
The one place a match group becomes icon, colour and wording. Bordered, 9.6px radius, 16px text, wash fill, `-fg` text colour, 16px icon in the status base colour. Groups: appears met (circle-check, green), to check (triangle-alert, amber), foundation year (triangle-alert, amber, own wording), not met (circle-x, red). Never colour alone.

### Status Summary
The at-a-glance count row in a product page band. One chip per non-zero group: a `sm` MatchStatusBadge beside the count, and the count is visible Latin digits in a `<bdi className="tabular-nums">`. The One Mapping Rule holds: the chip renders the badge, never its own icon, colour or wording. A zero count renders no chip, and an all-zero summary renders nothing. Number and wording travel together, so the count never rests on colour alone.

### Page Band
The full-bleed header band of the Profile, Matches, Scholarships and Plan pages: the hero's breakout (`w-screen max-w-none` with `mx-[calc(50%-50vw)]`) inside the constrained main, a radial wash from Indigo Wash through Canvas Soft into Canvas carried as a CSS custom property (no image asset), a hairline bottom border, an optional uppercase indigo eyebrow, the page's one `text-display` h1, an optional Ink Secondary lead capped near 52ch, and a children slot for the status summary or actions. It is a server component that takes every string as a prop: no client JS, and no freshness, clock or profile claim of its own.

### Empty States
A canvas-soft panel at the card radius, centred on phone and start-aligned from md: a muted icon (alert triangle and `role="alert"` in the error tone, loader in the loading tone), a title in the Title step, a short muted description in a prose-width column, then one action. No illustration. An empty, error or loading state never borrows match-status colours or wording, and never rounds missing or stale information into a verdict.

### Skeletons
Decorative blocks that reserve the layout's height while data loads, inside the `aria-busy` container; the live loading text is a separate `output`, so the skeleton itself is hidden from assistive tech. Card-shaped blocks take the card vocabulary (`rounded-xl border border-border bg-card`); inner blocks take Canvas Soft. The pulse is `motion-safe:` only, and `prefers-reduced-motion` cuts it.

### Cards / Containers
- **Feature / match card:** Canvas fill, 1px Hairline border, 16.8px radius, `shadow-sm` at rest and `shadow-md` on hover; 16px padding on phone, 24px from md. Text-first: the program name is the primary link in Indigo (19px semibold) with the institution and city in Ink Muted beside the match status badge, then a hairline-divided label-and-value fact list (teaching language, tuition, application channel, estimated cost) with a SourceBadge under every recorded fact, the reason list, and an outline "See details" button plus the save control. The title is the primary link; the card is not clickable, and no card nests inside another. The Source-Always Rule holds inside the card: kind, verified date and source link stay with each fact, and estimates and guidance are never restyled as official requirements.
- **Hero demo panel:** The single `shadow-lg` surface. A near-white card floating at the gradient's edge, containing the segmented controls and the live match card.
- **Dark band:** Navy Band fill with an atmospheric indigo gradient, light text; carries the trust story and the fact-kind/status legend only.
- **Profile strip / notices:** Canvas Soft fill, 16.8px radius; chips are pills with a Hairline border and Canvas fill.

### Inputs / Fields
- **Style:** 48px tall, 12px radius, 1px Control Slate border, Canvas fill, 16px text, 12px side padding.
- **Structure:** 16px medium label with "(required)" or "(optional)" in Ink Muted, hint above the control, error below. Tight inside a field (6px), generous between fields.
- **Choice rows:** The whole 48px row is the target. Selected state is an Indigo border and Indigo Wash fill.
- **Focus / Error:** Global indigo focus ring. Invalid fields take an Error Red border and a message with an alert icon; an error summary (Error Red border, Error Blush fill) links to each field.

### Navigation / Shell
- **Header:** Sticky, translucent (`bg-canvas/70` with `backdrop-blur`), 1px Hairline bottom border, 64px bar. Wordmark "Jisr" plus Arabic "جسر" in Ink Muted, 20px semibold.
- **Nav links:** 15px medium; the current item draws a 2px indigo underline via a logical `inset-inline` pseudo-element; hover fills with Canvas Soft.
- **Locale switcher:** A pill group on a Canvas Soft track; the current locale is a Canvas pill with `shadow-sm`.
- **Footer:** Canvas Soft with a top hairline; the privacy line and the "Clear my data" outline button opening a modal alert dialog.

## 7. Do's and Don'ts

### Do:
- **Do** give every important fact its kind badge, verified date (DD/MM/YYYY) and official source link: the Source-Always Rule.
- **Do** write status as icon plus words in `MatchStatusBadge` only: the One Mapping Rule.
- **Do** keep estimate and guidance visibly different from official: dashed cream with calculator, grey outline with info, never the filled teal shield.
- **Do** show missing, stale or ambiguous information as something to check, with an alert icon and a sentence. Honest uncertainty is never rounded up to a yes or a no.
- **Do** keep teal for the official fact-kind only; indigo is the only accent.
- **Do** set display headlines in thin Geist (300) with `-0.03em` tracking, and use soft navy-tinted shadows for lift.
- **Do** show costs as ranges with the 10-month assumption, and tuition as an official fee or "to be checked".
- **Do** write for a school-leaver: plain words, short steps, one clear next action, one primary button per screen.
- **Do** use logical utilities only (`ms-`, `pe-`, `text-start`, `border-s`) and mirror directional icons with `rtl:rotate-180`.
- **Do** keep motion to 150–220 ms colour and transform, and let `prefers-reduced-motion` cut it to near zero.

### Don't:
- **Don't** let estimates and guidance be styled as official. No teal fill, no shield, no official wording on anything that is not an official source.
- **Don't** present trust as persuasion. No hype, no guarantees, never "eligible" or "admitted" as a promise, no percentages, no testimonials or usage statistics.
- **Don't** round missing, stale or unofficial data up to a confirmed yes or no.
- **Don't** use teal as a brand or decoration colour; it means "official" and nothing else.
- **Don't** use `#000`, `#fff` or a cold/grey neutral; no dark mode until a deliberate token swap.
- **Don't** add glassmorphism, gradient text, coloured side-stripe borders, or more than one gradient per page.
- **Don't** convey status by colour alone, or use green, amber and red for anything but match status.
- **Don't** use `ml-`, `mr-`, `pl-`, `pr-`, `left-` or `right-`, and never let Latin names, URLs or numbers go un-isolated inside Arabic text.
- **Don't** use a modal as a first thought, choreographed page-load motion, or em dashes in copy.
- **Don't** add a new accent hue, a second typeface or a size outside the fixed scale.
- **Don't** put any profile value in a URL, log or analytics event.
