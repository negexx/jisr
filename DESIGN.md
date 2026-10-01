---
name: Jisr
description: A calm, plainly spoken bridge from a school-leaver's profile to real, honestly labelled study options in Europe.
colors:
  warm-paper: "oklch(0.985 0.006 90)"
  card-cream: "oklch(0.995 0.003 90)"
  sand-wash: "oklch(0.955 0.008 90)"
  hairline-sand: "oklch(0.9 0.01 90)"
  ink-slate: "oklch(0.22 0.02 215)"
  quiet-slate: "oklch(0.45 0.02 215)"
  control-slate: "oklch(0.62 0.02 215)"
  deep-teal-ink: "oklch(0.4 0.075 205)"
  teal-mist: "oklch(0.95 0.02 205)"
  teal-ink-dark: "oklch(0.3 0.06 205)"
  focus-teal: "oklch(0.55 0.1 205)"
  error-brick: "oklch(0.45 0.16 25)"
  error-blush: "oklch(0.95 0.025 25)"
  match-green: "oklch(0.5 0.11 155)"
  match-green-text: "oklch(0.4 0.09 155)"
  match-green-wash: "oklch(0.96 0.03 155)"
  match-green-edge: "oklch(0.58 0.11 155)"
  check-amber: "oklch(0.52 0.11 70)"
  check-amber-text: "oklch(0.42 0.09 70)"
  check-amber-wash: "oklch(0.96 0.04 85)"
  check-amber-edge: "oklch(0.6 0.12 75)"
  unmet-red: "oklch(0.5 0.16 25)"
  unmet-red-text: "oklch(0.43 0.15 25)"
  unmet-red-wash: "oklch(0.955 0.03 25)"
  unmet-red-edge: "oklch(0.58 0.15 25)"
  official-teal: "oklch(0.36 0.075 205)"
  estimate-plum: "oklch(0.42 0.06 310)"
  estimate-plum-wash: "oklch(0.92 0.04 300)"
  guidance-grey: "oklch(0.42 0.01 90)"
  guidance-grey-wash: "oklch(0.95 0.005 90)"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
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
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  tap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.deep-teal-ink}"
    textColor: "{colors.warm-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-outline-hover:
    backgroundColor: "{colors.sand-wash}"
  button-secondary:
    backgroundColor: "{colors.sand-wash}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.error-blush}"
    textColor: "{colors.error-brick}"
    rounded: "{rounded.lg}"
    height: "48px"
  text-field:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink-slate}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "48px"
  choice-row-selected:
    backgroundColor: "{colors.teal-mist}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "48px"
  source-badge-official:
    backgroundColor: "{colors.official-teal}"
    textColor: "{colors.teal-mist}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  source-badge-estimate:
    backgroundColor: "{colors.estimate-plum-wash}"
    textColor: "{colors.estimate-plum}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  source-badge-guidance:
    backgroundColor: "{colors.guidance-grey-wash}"
    textColor: "{colors.guidance-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  match-status-ok:
    backgroundColor: "{colors.match-green-wash}"
    textColor: "{colors.match-green-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  match-status-check:
    backgroundColor: "{colors.check-amber-wash}"
    textColor: "{colors.check-amber-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  match-status-failed:
    backgroundColor: "{colors.unmet-red-wash}"
    textColor: "{colors.unmet-red-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  match-card:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.xl}"
    padding: "24px"
  profile-strip:
    backgroundColor: "{colors.sand-wash}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Jisr

## 1. Overview

**Creative North Star: "The Plain Bridge"**

Jisr means bridge. The interface is a calm, plainly spoken crossing from a school-leaver's profile to real, honestly labelled options. It is a product register: the student is deciding alone, on a mid-range phone, often on slow data, so every surface serves the task and none performs. Warmth lives in shape and rhythm (rounded controls, generous gaps between fields, a progress bar that also says its step in words), never in promotional copy or decoration.

The palette is Restrained: warm-tinted neutrals (hue 90) plus one deep teal-ink accent (hue 205). Status colour exists only for match status. Fact kinds (official, estimate, guidance) get three distinct treatments in shape and icon as well as colour, so an estimate can never pass for an official figure. Depth comes from tonal surfaces and hairline borders. Light theme only.

This system rejects what PRODUCT.md rejects: persuasion over trust, rounded-up certainty, and anything written for parents or counselors instead of the student. Visually that means no marketing gloss, no promise styling, no catalogue-of-universities look. Component philosophy: **calm, rounded, text-first**. Rounded controls (12px radius), 48px tap targets, status always icon plus words (never colour alone), tinted badges only where meaning needs them.

**Key Characteristics:**
- Warm paper ground, deep teal ink for actions, links, current nav and focus only.
- Flat at rest: no shadows anywhere; tonal surfaces and 1px borders carry structure.
- Fixed type scale, 14 / 16 / 19 / 23 / 28 px, Geist for Latin and Noto Sans Arabic for Arabic.
- Every fact wears its kind, verified date and source link.
- RTL is native: logical properties only, mirrored directional icons, Latin names, URLs and numbers isolated in `bdi`, Latin digits in Arabic.
- Motion is 150 ms colour and state changes only, and none under `prefers-reduced-motion`.
- Layout: one column on phone, content width capped at 64rem (matches use a 15rem sticky side column from 1024px; the profile form uses a 40rem column with a 16rem aside); prose capped at `max-w-prose`.

## 2. Colors

A restrained warm-neutral field with one deep teal-ink voice. OKLCH is the canonical format (it is what `src/app/globals.css` defines); the Stitch linter will warn about non-hex colours, and that warning is accepted. Values live only in the frontmatter.

### Primary
- **Deep Teal Ink** (`deep-teal-ink`): Primary buttons, links, the current nav item underline, filled progress segments, selected-choice border. Text on it is Warm Paper.
- **Teal Mist** (`teal-mist`): Selected choice-row fill and the tint behind the Official badge text. **Teal Ink Dark** (`teal-ink-dark`) is its accent foreground.
- **Focus Teal** (`focus-teal`): The 2px focus outline, 2px offset, on every focusable element.

### Neutral
- **Warm Paper** (`warm-paper`): Page background, input fill, text on primary.
- **Card Cream** (`card-cream`): Cards, popovers and dialogs, one half-step lighter than the page.
- **Sand Wash** (`sand-wash`): Footer, profile strip, secondary and hover fills, current locale chip.
- **Hairline Sand** (`hairline-sand`): The default 1px border and divider.
- **Ink Slate** (`ink-slate`): Body text. A slightly cool slate, never black.
- **Quiet Slate** (`quiet-slate`): Secondary text, hints, inactive nav.
- **Control Slate** (`control-slate`): Input and outline-button borders; sized to meet 3:1 against the page.

### Status (match status only)
- **Match Green** family (`match-green`, `-text`, `-wash`, `-edge`): "Published requirements appear met". Icon in the base, text in `-text`, wash fill, `-edge` border.
- **Check Amber** family (`check-amber`, `-text`, `-wash`, `-edge`): "Something to check" and the foundation-year route. Also used for aging and stale freshness chips and the foundation explanation box.
- **Unmet Red** family (`unmet-red`, `-text`, `-wash`, `-edge`): "Published requirements not met".
- **Error Brick** and **Error Blush** (`error-brick`, `error-blush`): Form errors and the destructive button only. Never a match status.

### Fact kinds
- **Official Teal** (`official-teal`): Filled pill, light text, shield-check icon.
- **Estimate Plum** (`estimate-plum`, `estimate-plum-wash`): Dashed 1px plum outline on a pale plum fill, calculator icon.
- **Guidance Grey** (`guidance-grey`, `guidance-grey-wash`): Solid grey outline at 40% on a pale grey fill, info icon.

### Named Rules
**The One Voice Rule.** Deep Teal Ink is the only accent. It marks what can be pressed, followed or is current. It never decorates.

**The Words-Beside-Colour Rule.** Status never relies on colour alone. Every status colour ships with an icon and a sentence, and the three fact kinds also differ in fill, border style and icon.

**The Status-Is-Status Rule.** Green, amber and red mean match status and nothing else. Do not borrow them for success toasts, tags or emphasis. Amber is also permitted for freshness warnings, because those are the same "check this" meaning.

**The Never-Official Rule.** Estimate and guidance are never styled or worded as official: no teal fill, no shield, no "official" language, and stale wording that says "go to the official page" is shown only on official facts.

**The Source-Always Rule.** No fact without its source badge: kind, verified date and source link travel with every important fact, in every component and on every page.

**The One Mapping Rule.** Match status becomes icon, colour and text in `MatchStatusBadge` only. No other component re-implements the mapping.

**The No-Pure-Black Rule.** No `#000` or `#fff`. Every neutral carries warmth (hue 90) or slate (hue 215).

## 3. Typography

**Display Font:** none; there is no display face. Headings use the body face.
**Body Font:** Geist (with `system-ui, sans-serif`). Arabic: Noto Sans Arabic, loaded lazily, applied on `:lang(ar)` and `html[lang="ar"]`.
**Label/Mono Font:** Geist; a monospace stack is declared but unused.

**Character:** One plain humanist-geometric sans at a fixed 1.2 ratio. Hierarchy comes from size and weight, never from a second face. Arabic reads about 1px larger (root 106.25%) with 1.75 leading.

### Hierarchy
- **Headline** (700, 1.75rem / 28px, 1.25, tracking -0.025em, balanced wrap): Page title (h1).
- **Title** (600, 1.4375rem / 23px, 1.35): Section and empty-state headings.
- **Subtitle** (600, 1.1875rem / 19px, 1.5): Card titles, group headings, wordmark, step error-summary heading.
- **Body** (400 to 500, 1rem / 16px, 1.5): Everything readable; inputs never below 16px. Prose is capped at `max-w-prose`.
- **Label** (500, 0.875rem / 14px, 1.5): Badges, source lines, hints, fact captions. Use `tabular-nums` for money.

### Named Rules
**The Fixed Scale Rule.** Only 14, 16, 19, 23 and 28 px. No fluid clamp, no in-between sizes. `text-xs` is for tiny labels inside dense controls only.

**The Isolated Latin Rule.** Official names, URLs, hostnames, currency codes and amounts sit in `bdi` (amounts and URLs with `dir="ltr"`) so Arabic sentences never reorder them. Digits are always Latin.

**The Arabic Leading Rule.** Under `lang="ar"` the root scales to 106.25% and line heights rise to 1.75 (1.6 and 1.5 for the two largest steps). Tap targets grow with the root and never fall below 48px.

## 4. Elevation

Flat by default. The shipped code contains no `box-shadow` or `shadow-*` utility. Structure comes from tonal surfaces (Warm Paper, Card Cream, Sand Wash) and 1px Hairline Sand borders. Two overlay exceptions exist, both in the clear-data dialog: a scrim and a hairline ring.

### Shadow Vocabulary
- **Dialog scrim** (`background: Ink Slate at 30% opacity, full viewport`): Behind the modal only.
- **Dialog ring** (`ring-1`, Ink Slate at 15%): A 1px ring around the dialog panel, in place of a shadow.

### Named Rules
**The Flat-By-Default Rule.** Nothing casts a shadow. If a surface needs separation, change its tonal step or add a 1px border. The test: if a card looks like it floats, it is wrong.

**The Words-Not-Depth Rule.** Hierarchy and state are carried by text, icon and border, not by elevation or glow. The error focus ring (`ring-3` at 20% of Error Brick on invalid buttons) is the only glow.

## 5. Components

### Buttons
- **Shape:** Rounded (12px). 48px tall by default and in `lg`; `icon` is 48px square. `sm` is 44px on phone and 36px from 768px. `xs` (24px) exists in code and is not for primary journeys.
- **Primary:** Deep Teal Ink fill, Warm Paper text, 16px medium, 20px side padding, 8px icon gap. Hover drops to 80% opacity.
- **Outline / Secondary / Ghost:** Outline is Warm Paper with a Control Slate border; hover fills Sand Wash. Secondary is a Sand Wash fill. Ghost has no fill until hover.
- **Destructive:** Error Blush fill, Error Brick text, 30% Error Brick border.
- **Link:** Teal ink text, underlined with 4px offset, underline removed on hover.
- **Hover / Focus / Active:** 150 ms colour transition. Focus is the global 2px Focus Teal outline at 2px offset. Active nudges 1px down. Disabled is 50% opacity.

### Source Badge (signature)
The trust surface. Every fact line carries: a kind pill (Official filled teal with shield-check; Estimate dashed plum with calculator; Guidance grey outline with info), the verified date ("Verified on DD/MM/YYYY") in Quiet Slate, a "Source" external link, and, when aging or stale, a freshness mark in Check Amber. The compact variant is one wrapping row; the full variant adds the meaning sentence and, for estimates, a "how we estimated" disclosure. Pills are fully rounded, 14px medium, 10px side padding.

### Match Status Badge
The one place a match group becomes icon, colour and wording. Bordered, 9.6px radius, 16px text, wash fill, `-text` colour, 16px icon in the status base colour. Groups: appears met (circle-check, green), to check (triangle-alert, amber), foundation year (triangle-alert, amber, own wording), not met (circle-x, red).

### Cards / Containers
- **Match card:** Card Cream, 1px Hairline Sand border, 16.8px radius, 16px padding (24px from 768px), flat. Text-first: title link in Deep Teal Ink (19px semibold), institution and city in Quiet Slate, status badge, then a captioned fact list (14px Quiet Slate captions, a source badge under each fact), reasons, and an outline "See details" button. The title is the primary link; the card is not clickable.
- **Foundation box and notices:** 12px radius, 1px border. Foundation box uses the amber wash and edge with an info icon. Neutral notices use Sand Wash with a Hairline Sand border.
- **Profile strip:** Sand Wash, 16.8px radius, no border; chips are fully rounded, 1px Hairline Sand, Warm Paper fill, 14px.
- **Group sections:** Plain headings with counts; the not-met group and hidden-by-preferences are native disclosures with Deep Teal Ink underlined summaries (44px minimum, 32px from 768px).
- **Empty state:** Centred on phone, start-aligned from 768px; a 40px outline icon, a 23px heading, Quiet Slate description, one action.

### Inputs / Fields
- **Style:** 48px tall, 12px radius, 1px Control Slate border, Warm Paper fill, 16px text, 12px side padding. Native selects and inputs.
- **Structure:** 16px medium label with "(required)" or "(optional)" in Quiet Slate, hint above the control, error below. Tight inside a field (6px), generous between fields.
- **Choice rows:** The whole 48px row is the target. Selected state is a Deep Teal Ink border and Teal Mist fill.
- **Focus / Error:** Global Focus Teal outline. Invalid fields take a 2px Error Brick border and a message with an alert icon; an error summary (2px Error Brick border, Error Blush fill) lists links to each field.
- **Step header:** A text label ("Step 2 of 4") above four rounded segments, filled Deep Teal Ink, unfilled Hairline Sand; segments run from the start edge and mirror in Arabic. The action bar is sticky at the bottom on phone, with a 1px top border on Warm Paper.

### Navigation
- **Header:** Hairline Sand bottom border, wordmark "Jisr" plus Arabic "جسر" in Quiet Slate, 19px semibold, 48px high. Nav links are 16px medium, 48px tall, with a 2px bottom border: Deep Teal Ink and teal text when current, Quiet Slate when not, Ink Slate on hover.
- **Locale switcher:** Three small ghost buttons (Français, English, العربية), the current one a Sand Wash secondary fill with `aria-current`.
- **Footer:** Sand Wash, top hairline, privacy line at 16px and sources line at 14px, with the "Clear my data" outline button opening a modal alert dialog (Card Cream, 16.8px radius, 150 ms fade and zoom).
- **Skip link:** Hidden until focused, then a Deep Teal Ink button at the start corner.

## 6. Do's and Don'ts

### Do:
- **Do** give every important fact its kind badge, verified date (DD/MM/YYYY) and official source link: the Source-Always Rule. No fact without its source badge.
- **Do** write status as icon plus words in Match Status Badge only: the One Mapping Rule. Match status maps to icon, colour and text in that one component and nowhere else.
- **Do** keep estimate and guidance visibly different from official: dashed plum with calculator, grey outline with info, never the filled teal shield.
- **Do** show missing, stale or ambiguous information as something to check, with a question-mark or alert icon and a sentence. Honest uncertainty is never rounded up to a yes or a no.
- **Do** show costs as ranges with the 10-month assumption, and tuition as an official fee or "to be checked".
- **Do** write for a school-leaver: plain words, short steps, one clear next action, one primary button per screen.
- **Do** keep controls 12px rounded and at least 48px tall; read Arabic at root 106.25% with 1.75 leading.
- **Do** use logical utilities only (`ms-`, `pe-`, `text-start`, `border-s`) and `rtl:rotate-180` on directional icons.
- **Do** keep transitions to 150 ms colour and state changes and let `prefers-reduced-motion` cut them to near zero.
- **Do** keep pages light: phone and desktop equally first-class, on slow connections.

### Don't:
- **Don't** let estimates and guidance be styled as official. No teal fill, no shield, no official wording on anything that is not an official source.
- **Don't** present trust as persuasion. No hype, no guarantees, never "eligible" or "admitted" as a promise, no percentages, no testimonials or usage statistics.
- **Don't** round missing, stale or unofficial data up to a confirmed yes or no.
- **Don't** design for parents or counselors: the student decides alone.
- **Don't** make Jisr look like a university directory or catalogue: no logo grids, no identical icon-card grids, no hero-metric templates.
- **Don't** convey status by colour alone, or use green, amber and red for anything but match status.
- **Don't** add shadows, glassmorphism, gradient text or side-stripe borders thicker than 1px as a coloured accent.
- **Don't** use `#000`, `#fff` or any cold neutral; no dark mode until a deliberate token swap.
- **Don't** use `ml-`, `mr-`, `pl-`, `pr-`, `left-` or `right-`, and never let Latin names, URLs or numbers go un-isolated inside Arabic text.
- **Don't** use a modal as a first thought, choreographed page-load motion, or em dashes in copy.
- **Don't** add a new accent hue, a second typeface or a font size outside 14 / 16 / 19 / 23 / 28.
- **Don't** put any profile value in a URL, log or analytics event.
