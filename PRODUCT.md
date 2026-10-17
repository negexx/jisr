# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Moroccan high-school graduates (Bac holders, about 17 to 19) looking for a Bachelor's degree in Europe. The student decides alone: copy is written for a school-leaver, plain and short, not for parents or counselors (they may look over a shoulder, but they are not a designed audience). The student often does not know where to start, which country or university is realistic for their profile, what it costs, or what to do next.

Job to be done: go from "I want to study in Europe but I don't know where to start" to "I have several realistic options, I know roughly what they cost, which scholarships I may qualify for, and what to do next."

Usage conditions (confirmed): general. Students arrive on laptops and MacBooks, iPhones, Samsung and Xiaomi phones, on connections that range from fibre to slow mobile data. Phone and desktop are both first-class; slow connections mean pages and data must stay light.

## Product Purpose

Jisrr is a free, non-commercial web app that runs one journey: student profile, realistic options, costs, scholarships, application steps. It answers four questions: where can I study, can I apply, how much will it cost, what do I need to do. It is not a university directory. Release 1 covers France, Germany, the Netherlands, Hungary and Italy, in Computer Science, Engineering and Business/Economics. Success is that the student ends with realistic options, approximate costs, scholarships they may qualify for, and a clear next step, and trusts the information enough to use Jisrr as their starting point.

## Positioning

Trust is the product. Every important fact carries an official source and a last-verified date, and the interface always distinguishes an official requirement from an estimated cost and from general guidance. Options are organised around the student's own profile instead of a catalogue to research. Statuses are honest: missing, stale or unofficial data is never presented as a confirmed yes or no.

## Operating Context

- A guest journey with no account: the profile is stored only on the student's own device (browser storage); nothing personal is sent to a server. Accounts (saved lists, checklist progress) come later.
- Data comes from curated files with official source URLs and verification dates, published as static snapshots; the matching logic runs in the browser.
- Three languages: French (default), English and Modern Standard Arabic (right-to-left). No Darija. Students may switch between Arabic and French mid-task.
- Facts age: deadlines and fees go stale sooner than requirements; the interface must show how fresh a fact is.
- Official names (universities, programs, exams, portals) are never translated; a short gloss may be added.

## Capabilities and Constraints

- Pages in Release 1: Home, Create Profile, My Matches, University/Program, Scholarships, Compare, My Application Plan. All seven are built for the guest release.
- Match statuses: requirements appear satisfied, something needs checking, published requirements not satisfied. Foundation-year routes show as "needs checking" with a prominent reason. Costs are always ranges, never one promised number, and state the assumption of a 10-month academic year. Tuition is an official published fee or shown as "to be checked".
- Dates are shown DD/MM/YYYY; money in EUR primary with MAD secondary display later (no MAD conversion until a sourced rate exists).
- Free hosting with hard limits and privacy rules (GDPR and Moroccan Law 09-08): no cookies, no profile data in URLs, logs or analytics.
- Not decided yet: the accessibility standard to certify against, and any logo.

## Brand Commitments

- The name is Jisrr (جسر, "bridge"). It is fixed.
- Voice rule: plain, calm and honest. No hype, no guarantees, never "eligible" or "admitted" as a promise; say what appears met, what to check and where.
- No other brand assets, colours or visual identity are committed; those are open for design.

## Evidence on Hand

- Product spec: `docs/product/jisr_mvp.md`. Decisions: `.claude/docs/decisions/` (ADRs 0002 to 0011). Runbooks: `docs/ops/` (deploy, limits, prelaunch checklist).
- A complete guest release (profile, matches, programme pages, compare, plan, scholarships) in three languages, with curated reference data: 1,126 programmes across five destinations (France, Germany, the Netherlands, Hungary, Italy).
- Absent, and must not be fabricated: testimonials; usage statistics; any logo.

## Product Principles

1. Trust over persuasion: every fact shows its source and verified date; estimates and guidance are never styled as official.
2. Honest uncertainty: missing, stale or ambiguous information is shown as something to check, never rounded up to a yes or a no.
3. Written for a school-leaver: plain words, short steps, one clear next action.
4. Private by default: the student's profile stays on their device; nothing personal is logged or sent.
5. First-class in every language and on every device: Arabic and French equally, phone and desktop equally, light on slow connections.

## Accessibility & Inclusion

Right-to-left layout for Arabic and correct rendering of Latin names, numbers and URLs inside Arabic text are required. Status must never rely on colour alone. No formal accessibility standard has been chosen yet; the project rules require labelled inputs, keyboard operation and sufficient contrast, and a target standard is an open decision.
