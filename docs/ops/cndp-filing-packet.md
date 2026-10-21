# CNDP filing packet for the accounts launch

**Prepared:** 2026-10-18
**Status:** Draft for the owner. This is an operational packet, not legal advice.
**Scope:** The Jisrr account service under Moroccan Law 09-08, including the transfer of account data to providers outside Morocco.
**Owner action:** The owner files the declaration and the transfer request. No agent marks the CNDP file as filed.

## How to read this packet

Every factual statement is either taken from the repository or checked on cndp.ma on 2026-10-18. Legal conclusions that need a Moroccan data-protection lawyer or the CNDP itself are marked **To confirm**. **To confirm** is shorthand for "owner/lawyer to confirm"; where the open point is a provider fact rather than a legal question, it means "owner to confirm with the provider". Do not treat a **To confirm** item as settled.

| Section | What is verified | What remains to confirm |
|---|---|---|
| 1. What to file | Current CNDP form names, links, attachments, delays, receipt process | Whether Law 09-08 applies to a controller established in Italy; declaration route (F211 or F214); need for a representative in Morocco; cookie declaration; per-purpose filing |
| 2. Data inventory | Data categories, purposes, retention and access from ADR 0013, the database schema and the privacy notice | Law 09-08 basis for each line; whether any line is sensitive; final retention for host logs, email delivery records and backups |
| 3. Recipients and transfers | Providers, roles, EU hosting regions, the CNDP adequate-country list, what leaves Morocco | Transfer mechanism for US-linked processing (Google, possible corporate access); Brevo and GoatCounter locations; DPA status; how the notice wording supports the transfer basis |
| 4. Security measures | Authentication, minimisation, logging, rate limits, export, deletion, headers | Provider at-rest encryption; backup retention; incident-response and breach-notification duties |
| 5. Privacy notice reference | Paths, locales, consent version, consent flow, controller identity | Final legal and language review; Arabic review; international-transfer sentence |
| 6. Owner checklist | Forms and evidence to prepare, submission steps, expected receipts, what to send back | The CNDP submission channel current on the day of filing; any CNDP follow-up questions |

## 0. Context and urgency

Accounts are live in production since 2026-10-17. The repository records the CNDP declaration as **not filed** (`docs/ops/prelaunch-checklist.md`, rows A3 and D1). Law 09-08 requires notification before processing (Article 12, as the CNDP restates in its own guidance). On the repository's record, filing now is late, not early.

Two consequences follow. First, the owner should decide, with advice, whether to pause accounts by setting `ACCOUNTS_ENABLED` off and redeploying until the declaration is filed. Second, the owner should keep a short written note of the decision and the date, because the filing packet may need to explain the sequence.

**To confirm:** whether Law 09-08 applies at all to a controller established in Italy, with no establishment or processing means in Morocco, when the people concerned are in Morocco. ADR 0004 section 6 records secondary sources saying it can apply to foreign controllers. That is not a legal conclusion. If the lawyer concludes the law does not apply, record the reasoning and do not file a misleading declaration. If it applies, file.

**To confirm:** the consequences of processing before filing, and whether a voluntary late filing changes the exposure. This packet does not assess penalties.

## 1. What to file with the CNDP

### 1.1 Filing route

The CNDP distinguishes a prior declaration from a prior authorisation. A prior authorisation is required for sensitive data, use of data for another purpose, data on offences or security measures, use of the national identity number (CIN), and interconnection of files with different purposes. None of those is part of the Jisrr account design:

- No health, genetic, biometric, racial or ethnic, political, religious, philosophical or union data.
- No CIN or other national identity number.
- No interconnection with another controller's file.
- Nationality and grades are personal data, but the repository records them as not sensitive (`ADR 0004` section 6).
- No purpose diversion: the notice states the purposes and the product uses the data for those purposes.

On that basis, the expected route is a **prior declaration**, not an authorisation.

**To confirm:** whether the CNDP agrees that none of the authorisation triggers applies. In particular, ask whether it treats nationality, grades or the profile preferences as sensitive in this context.

**Declaration form.** Use the **Déclaration normale (F211)** unless the CNDP confirms that a published decision covers this processing and the simplified form applies. The simplified form (F214) is the declaration route for processing that matches a CNDP decision, such as a specific sector model. This packet found no decision that covers a free, non-commercial study-matching account service, so F211 is the conservative choice.

**Transfer form.** File the **Demande de transfert de données à l'étranger (F118)** at the same time as the declaration. The CNDP states that a transfer authorisation is granted only when the underlying processing has a declaration or authorisation approved by the CNDP, and the F211 notice says a transfer must be requested simultaneously. The F118 is therefore part of the same packet, not a later step.

**Representative in Morocco.** The F211 asks whether the controller is established in Morocco. If the answer is no, it asks for the identity of a representative in Morocco. The privacy notice names an individual established in Italy as controller. **To confirm:** whether Law 09-08 requires a representative in Morocco in this case, and if so, who accepts that role and what evidence is attached. Do not invent a representative.

**Cookies.** The CNDP has a simplified declaration model for cookies on a terminal (Délibération D-939-2025 of 28 November 2025; verify the current model on cndp.ma). Jisrr sets only a strictly necessary HttpOnly session cookie, plus short-lived sign-in security cookies, and no tracking or advertising cookies. **To confirm:** whether the session cookie is covered by the main F211 or needs a separate cookie declaration. The notice already states that no tracking or advertising cookies are used.

**Per-purpose filing.** The CNDP procedure page says online processing is notified by purpose. Jisrr has one account service with several related purposes: authentication, profile storage and matching, saved programmes, plan progress, and fact reports. **To confirm:** whether the CNDP expects one declaration for the account service or separate declarations per purpose. The recommended starting point is one F211 that lists every purpose clearly, with the owner ready to split it if the CNDP asks.

### 1.2 Current forms and links

Checked on cndp.ma on 2026-10-18. Re-check before submission: the CNDP updates form versions and the site still links older copies in some pages.

| Form | Name on cndp.ma | Current link | Use in this packet |
|---|---|---|---|
| F211 | Déclaration normale préalable de traitement | https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Declaration-Normale_F211_20250910_Fr.pdf | Main declaration |
| F214 | Déclaration simplifiée préalable du traitement | https://www.cndp.ma/wp-content/uploads/2025/07/CNDP-Declaration-Normale-Conformement-Decision_F214_20250724_Fr.pdf | Only if the CNDP confirms a decision covers the processing |
| F118 | Demande de transfert de données à l'étranger | https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Transfert-Etranger-F118.pdf | Transfer request |
| F112 | Demande d'autorisation préalable | https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Autorisation-Prealable-F112-20250910.pdf | Only if the CNDP treats the data as sensitive or another authorisation trigger applies |
| F113 | Demande d'autorisation préalable conformément à une décision | https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Autorisation-Prealable-Conformement-Decision-F113-20250910.pdf | Only if the CNDP points to a decision model |

The forms are in French. The F211 and F118 are multi-page PDFs. The F211 notice says the receipt is issued from the summary in Part A, and that an incomplete or inaccurate summary can lead to refusal or invalidation.

### 1.3 Attachments to prepare

The CNDP pages list the following. For a natural person, the "document authorising the signatory" point needs the owner's own proof of identity and signature; **confirm the exact form with the CNDP** rather than assuming a company-style authorisation letter.

- Proof of identity of the controller and proof of authority to sign (for a natural person, an identity document and a signed declaration).
- The privacy notice in French, English and Arabic, as published.
- The consent collection text, including the unticked consent box, the age confirmation, and the version and timestamp record.
- A description of the processing: purposes, data categories, data subjects, recipients, retention, security measures.
- The transfer details: recipients, countries, data categories, purpose, mode and frequency, first transfer date, consent method, security and contractual clauses.
- Contracts or contractual clauses with processors where they exist (Vercel, Neon, Brevo, Google; GoatCounter if applicable). The CNDP asks for clauses that guarantee technical and organisational security, and for transfer clauses where the country is not on the adequate list. If a provider's standard terms or DPA are all that exist, attach those and state that no bespoke contract was signed.
- Any CNDP receipt or authorisation already held, if this is a later filing.
- Any other document the CNDP asks for after reviewing the file.

Do not put identity documents, signatures, API keys, database credentials or user data in the repository. Keep the filing evidence in the owner's own storage.

### 1.4 Submission channel and delays

The CNDP publishes downloadable PDF forms and a "Notifier un traitement" service. A search result also shows an online forms portal at `cndp-forms.ma`, but it did not respond during this review. **To confirm on cndp.ma before filing:** whether the current channel is the online portal, email to `contact@cndp.ma`, post to the Rabat address, or a combination.

Contact details published by the CNDP:

- Address: Avenue Al Arz, Secteur 4, M1, Hay Riad, Rabat, Morocco.
- Telephone: +212 537 57 11 24 / +212 537 71 70 73.
- Fax: +212 537 57 21 41.
- Email: contact@cndp.ma.
- Short number: 3020.

Delays published by the CNDP:

- Declaration receipt: 24 hours.
- Decision to reclassify the processing as requiring prior authorisation: 8 days, if the CNDP sees a manifest danger to privacy and fundamental rights.
- Transfer opinion: 2 months, extendable once.
- If the file is incomplete, the clock starts when the missing information or documents arrive.

### 1.5 Expected receipts

Ask for and keep:

- The **récépissé de déclaration** for the F211 (or the authorisation, if the CNDP reclassifies).
- The **récépissé or authorisation de transfert** for the F118.
- Any letter or email that states conditions, requests changes, or confirms that a document is missing.

The F211 notice is explicit that the receipt is an acknowledgement of registration and the controller's commitment to comply. It is not an operational validation of every statement in Part B. The owner should still read it and check that the processing name, purposes and transfer details match the filed forms.

## 2. Data inventory

This inventory follows ADR 0013, the database schema in `src/db/schema/app.ts` and `src/db/schema/auth.ts`, and the published privacy notice. The "basis" column states what the repository relies on. **To confirm** means a lawyer should decide whether that basis is the right one under Law 09-08, and whether the notice wording supports it.

### 2.1 Account and authentication data

| Category | What is stored | Purpose | Basis in the repo | Retention | Who can access |
|---|---|---|---|---|---|
| Account identity | Email address; name and profile picture URL if Google sign-in is used; Google account identifier; email verification flag; role (`student`); creation and update timestamps | Create, authenticate and operate the account | Consent, collected with an unticked box at sign-up | Until account deletion | The signed-in user; the owner via the database; Neon as processor |
| Google sign-in tokens | Google access and refresh tokens, encrypted with the auth secret; Google ID token is nulled; password column unused | Complete Google sign-in only | Consent for the account; Google's own policy for the sign-in itself | Until account deletion or token expiry | The application; the owner via the database; Google as the identity provider |
| Consent record | `consent_version`, `consented_at` on the user row; the same fields on the pending sign-up row before the account exists | Prove which notice version was accepted and when | Legal evidence of consent | User row until deletion; pending row 15 minutes, then lazy purge | The owner via the database; the user in the data export |
| Age confirmation | A boolean on the pending sign-up row that the person confirmed being 16 or older; no date of birth is collected | Enforce the age floor | Consent and the age gate in ADR 0013 | Pending row 15 minutes, then lazy purge; the user row does not carry a separate age flag | The owner via the database |

### 2.2 Profile, saved programmes, plan and reports

| Category | What is stored | Purpose | Basis in the repo | Retention | Who can access |
|---|---|---|---|---|---|
| Profile | Nationality; diploma country, type, track, status, overall grade and subject grades; years of previous higher education; language levels and certificates; chosen fields, teaching languages and destination countries; budget; preferred institution type; a revision number | Compare the student's situation with published programme requirements and keep the profile across devices | Consent | Until account deletion | The signed-in user; the owner via the database; not sent to universities or analytics |
| Saved programmes | Programme slug, country, field, snapshot version, saved date | Keep the student's saved list | Consent | Until account deletion | The signed-in user; the owner via the database |
| Plan progress | Programme slug, step identifier, completion time | Keep the application checklist across devices | Consent | Until account deletion | The signed-in user; the owner via the database |
| Fact reports | The reported fact (record, path, source URL), the snapshot version viewed, an optional free-text note of up to 500 characters, and the time | Check and correct outdated reference data | Consent for the account; the notice presents reports as part of the account service | Until account deletion; capped at 20 reports per user per rolling 24 hours | The signed-in user; the owner via the database; no admin UI |
| Account state | Whether guest data was imported and when; the highest profile revision | Prevent silent overwrites and preserve revision monotonicity | Consent | Until account deletion | The owner via the database |

The profile is the most personal category. The notice tells students that grades and nationality are the most personal items, that the comparison runs in the browser, and that the profile is stored only to sync it across devices. The repository forbids logging grades or nationality and forbids sending them to third parties.

### 2.3 Sessions, verification and pre-account records

| Category | What is stored | Purpose | Basis in the repo | Retention | Who can access |
|---|---|---|---|---|---|
| Session | Random session token, creation and expiry times; IP address and user agent columns are nulled by a hook and are not read by any feature | Keep the user signed in | Strictly necessary for the account | 7 days by default; ends on sign-out | The application; the owner via the database; Neon as processor |
| Verification | Identifier (email address or user identifier), hashed token or code, expiry | Make a magic link, a Google sign-in state, or an account deletion work once | Strictly necessary for authentication and deletion | Magic link 15 minutes and single use; Google state a few minutes; deletion token 1 hour; removed when used | The application; the owner via the database |
| Pending sign-up | Email address, consent version, consent timestamp, age confirmation, creation and expiry times | Preserve consent and age evidence before the account exists, including when the email is opened on another device | Legal evidence of consent | 15 minutes; expired rows are deleted on the next auth email; deleted with the account or on request | The owner via the database |
| Email throttle | Email address, email kind (sign-in or deletion), last send time | Enforce one send per address and kind per minute | Abuse prevention and service security; **confirm the Law 09-08 basis** | Rows older than 24 hours are deleted on the next auth email; deleted with the account or on request | The owner via the database |
| Daily email counter | UTC day and count of auth emails sent | Keep total auth email volume under the provider quota | Service security; holds no personal data | Past UTC days are deleted on the next auth email | The owner via the database |

The notice says expired sign-up and throttle rows are deleted the next time Jisrr sends a sign-in or deletion email, that there is no scheduled clean-up, and that they are deleted on request. The repository records the same lazy-purge design in ADR 0013 decision 11.

### 2.4 Data outside the application database

| Category | What is stored or seen | Purpose | Basis in the repo | Retention | Who can access |
|---|---|---|---|---|---|
| Host logs | Standard Vercel request logs, for example IP address, URL, time and user agent, for every visitor | Run and protect the service | Host's own operation; **confirm the Law 09-08 basis and retention** | Vercel's standard retention; not verified | Vercel |
| Analytics | Page path, title and query string, referrer and screen size; no persistent identifier; not loaded when the browser sends Do Not Track or Global Privacy Control | Count visits and journey steps | Cookieless and anonymous per ADR 0004; **confirm whether Law 09-08 applies to this processing** | GoatCounter's retention; not verified | GoatCounter |
| Email delivery records | Email address and message text, including the sign-in or deletion link | Deliver the two account emails | Consent for the account; **confirm Brevo's retention and location** | Brevo's retention; not verified | Brevo |
| Browser local storage (guest) | `jisr.profile`, `jisr.profile-draft`, `jisr.saved`, `jisr.plan`, `jisr.matches-filters` | Run the guest journey without a server | Stored only on the user's device | Until the user clears it | The user's browser only |
| Browser local storage (signed in) | `jisr.auth` flag and `jisr.account.*` cache | Show account data quickly | Strictly necessary for the signed-in experience | Until sign-out, clear, or account deletion | The user's browser only |
| Session and security cookies | HttpOnly session cookie; short-lived sign-in security cookies | Keep the user signed in and protect sign-in | Strictly necessary | Session 7 days; security cookies minutes to 15 minutes | The user's browser and the application |

### 2.5 What is not collected

The repository and notice support these statements:

- No date of birth. Age is a confirmation, not a birthdate.
- No IP address or user agent in the application database, because better-auth IP tracking is off and a session hook nulls both fields.
- No password.
- No marketing preferences, no newsletter, no advertising identifier.
- No sale of data, no advertising, no sharing with universities.
- No grades, nationality, email address or session tokens in application logs.
- No profile data in analytics event names, paths or query strings.
- No Sentry or other error-reporting service in use today.

## 3. Recipients, processors and cross-border transfers

### 3.1 Recipients and processors

| Provider | Role | Data it receives or processes | Hosting or processing location recorded in the repo | Transfer note |
|---|---|---|---|---|
| Vercel | Hosting and CDN; server logs | The application, static pages and snapshots; standard request logs such as IP address, URL, time and user agent | Frankfurt region `fra1` for account functions; CDN delivery elsewhere | Vercel is a US company. The repo records EU hosting for the account functions. **To confirm:** whether corporate access from outside the EU counts as a transfer and must be declared |
| Neon | Managed Postgres for user data | Account, profile, saved programmes, plan progress, reports, sessions, verification and pre-account rows | Frankfurt, Germany | Germany is on the CNDP adequate-country list. **To confirm:** Neon's DPA, backup retention and any support access from outside the EU |
| Brevo | Email delivery for sign-in and deletion emails | Email address and message text, including the link | Not asserted in the repo. **To confirm** with Brevo | France is on the CNDP adequate-country list, but the repo does not assert that Brevo stores the data in France. **To confirm** location, DPA and retention |
| Google | Google sign-in, only if the student chooses it | Email address, name, profile picture URL, Google account identifier, OAuth tokens; Google sees that the student is signing in to Jisrr | Google's own infrastructure; the repo does not pin a region | The United States is not on the CNDP adequate-country list. **To confirm** the transfer basis, likely explicit consent or another Article 44 route, and update the notice wording if needed |
| GoatCounter | Cookieless analytics | Page path, title, query string, referrer and screen size; no persistent identifier | EU hosting per ADR 0004; the exact country is not asserted | **To confirm** the operator, hosting country, DPA and retention. If it is in the EU and the country is on the list, record that in the F118 |
| Sentry | Error reporting | None today | Not in use. ADR 0013 records Sentry as deferred | Do not list Sentry as a current recipient. If it is enabled later, update the notice and the filing before sending data |

The notice also states that Jisrr does not sell data, does not advertise, and does not send marketing email. The only emails are the sign-in link and the account-deletion confirmation.

### 3.2 What leaves Morocco

The account data is stored in Frankfurt, Germany. Germany is on the CNDP list of countries that provide a sufficient level of protection (Délibération 236-2015, Article 1). The same list includes France, Italy, the Netherlands, Spain, Hungary and the other EU countries named in the deliberation. The United States is not on the list. Check before filing whether the CNDP has published a later deliberation amending the 2015 list.

That does not remove the filing duty. Délibération 236-2015 is expressly "sous réserve de notifier à la CNDP, suivant le régime approprié, tout transfert de données à caractère personnel vers l'étranger". The CNDP's own guidance says a transfer request is required when data is hosted or stored on servers abroad, and the F118 is the form for it. So the expected packet is:

1. F211 declaration for the account processing.
2. F118 transfer request for the hosting and processing outside Morocco, filed with the F211.
3. If the CNDP or the lawyer concludes that Google sign-in sends data to the United States, either rely on an Article 44 basis (for example the person's express consent, if the notice and consent text properly cover it) or obtain express CNDP authorisation. Do not describe the US transfer as covered by the adequate-country list.

**To confirm:** whether the controller's own access from outside Morocco, or provider support access from outside the EU, is a transfer that must be declared. The safe approach is to describe every recipient and every country in the F118 and let the CNDP say if a line is unnecessary.

### 3.3 The notice's current transfer wording

The published notice says that the database and the account code are in Frankfurt, and that some companies are established outside the EU, so the GDPR transfer rules apply. It does not name a transfer mechanism. The prelaunch checklist already flags this as a point for the legal review (row D3). Before filing, the owner should decide whether the F118 relies on:

- the adequate-country list for Germany and any other EU country;
- the person's express consent for any transfer to a country not on the list, in which case the notice and the sign-up consent text should say so clearly;
- contractual clauses or another Article 44 route; or
- an express CNDP authorisation.

If the notice or consent text changes in a way that matters, bump the consent version in `src/lib/auth/consent.ts` and in the three privacy files in the same commit, as the repository requires. Existing users will be asked to consent again before using account features.

## 4. Security measures

The following measures are in the repository and are the ones to describe in the F211 and F118. This is a factual description, not a certification.

### 4.1 Minimisation and design

- Guest mode stores nothing on the server. The profile, saved list and plan stay in browser local storage.
- The account stores only what the journey needs. There is no date of birth, no password, no marketing profile and no advertising identifier.
- IP address and user agent are not stored in the application database. Better Auth IP tracking is disabled, and a session hook nulls both columns.
- Sentry is not wired. If it is enabled later, the plan is EU region, no request bodies, cookies or query strings, tracing off and no session recording.
- The privacy notice tells students not to put personal details in a fact report.

### 4.2 Access control and authentication

- Sign-in is by email magic link or Google. There is no password.
- Magic links last 15 minutes, are single use, and are stored hashed.
- The emailed link opens a confirm page, and sign-in happens only when the student presses the button. This avoids a mail scanner or a prefetched GET signing someone in.
- A soft browser-bound nonce warns when a sign-in comes from another browser and withholds the guest import in that case. Cross-device sign-in still works.
- The session cookie is HttpOnly, and server code is the only judge of the session. The `jisr.auth` value in local storage is only a hint.
- Server Actions and route handlers re-check the session and the account gate. Every account action runs `requireAccountReady()` before parsing input.
- The auth route and account surfaces fail closed while `ACCOUNTS_ENABLED` is off.
- Account deletion uses an emailed token, a confirm page and a POST with an origin check. The token rides the URL fragment and never reaches a request log or a `Referer` header. The deletion token lasts 1 hour.
- Database operations are parameterised through Drizzle. Account reads and writes are scoped to the signed-in user. Profile writes use a compare-and-set revision so one device cannot silently overwrite another.

### 4.3 Encryption and transport

- HTTPS with HSTS (`max-age=63072000`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a CSP limited to `frame-ancestors`, `base-uri`, `object-src` and `form-action`.
- Google OAuth access and refresh tokens are encrypted with the auth secret. The Google ID token is nulled.
- **To confirm:** the at-rest encryption terms of Vercel, Neon and Brevo, and the backup encryption terms. The repository does not state them, so do not claim them in the filing without the provider's documentation.

### 4.4 Logging and monitoring

- The application logs through the console only. Account actions log the action name and SQLSTATE, not the parameters.
- The mail sender logs the kind of email and a status code, never the address, link, token or response body.
- Better Auth's logger and better-call error handler are replaced so addresses, tokens and URLs are blanked.
- A privacy test suite drives the real flows and fails on an address, token, cookie, user agent, grade or nationality in any console output. It also fails if a Sentry or instrumentation file appears without joining the suite.
- **To confirm:** whether the owner has an incident-response runbook and what breach-notification duty applies under Law 09-08. No such runbook was found in the repository.

### 4.5 Rate limits and abuse controls

- One auth email per address and kind per minute.
- A global ceiling of 250 auth emails per UTC day, under Brevo's free quota of about 300 a day, with 20 sends reserved for deletion confirmations.
- Saved programmes capped at 12; ticked programmes capped at 50; fact reports capped at 20 per user per rolling 24 hours.
- Profile writes use a compare-and-set revision. Import of guest data is serialised under a user lock and has exactly one winner.
- Account actions are logged without personal data. The authority to act is the session, not a client-supplied user id.

### 4.6 Rights, export and deletion

- `GET /api/account/export` returns a JSON attachment with `Cache-Control: no-store`. It uses a named-column allow-list and excludes session tokens, IP address, user agent, verification rows, OAuth tokens and the password column. It needs a session but not current consent.
- Account deletion is a cascade from `user.id` plus a residue sweep for verification rows, `email_cooldowns` and `pending_signups`. The device removes every `jisr.*` key after confirmation.
- A consent version change pauses account features until the student accepts the new version. Export and deletion remain available.
- "Clear my data" clears profile, saved programmes and plan progress without deleting the account.
- The privacy notice explains access, rectification, erasure, objection, restriction, portability and withdrawal of consent, and names the Italian Garante and the CNDP as complaint authorities.

### 4.7 Organisational measures

- One developer runs the service. The code is closed source for now.
- The owner reads fact reports in the database because there is no admin UI.
- Access to the Neon project, Vercel project, Brevo account and Google credentials should be limited to the owner and protected with strong authentication. **To confirm:** the owner's actual account and key-management arrangements, because the repository does not document them.
- The repository records a security review of the accounts surface with no Critical or High finding, every Medium and Low item fixed or accepted in writing (`docs/ops/security-review-accounts.md`).

## 5. Privacy notice reference

### 5.1 Where the notice lives

| Item | Path or value |
|---|---|
| Route | `/[locale]/privacy` and `/[locale]/terms` |
| English body | `content/en/privacy.mdx`, `content/en/terms.mdx` |
| French body | `content/fr/privacy.mdx`, `content/fr/terms.mdx` |
| Arabic body | `content/ar/privacy.mdx`, `content/ar/terms.mdx` |
| Page components | `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx` |
| Consent constant | `CURRENT_CONSENT_VERSION` in `src/lib/auth/consent.ts` |
| Consent version value | `2026-10-21` |
| Version tie test | `tests/app/legal-pages.test.tsx` ties the constant to the frontmatter in all three privacy files |
| Controller in the notice | Hamza Dagdagui, established in Italy; contact dagdaguihamza@gmail.com |
| Languages | English, French, Modern Standard Arabic (RTL) |

### 5.2 How consent works

- The sign-up form has an unticked consent box and a separate age confirmation. The server stamps `consented_at` with its own clock.
- The pending sign-up row records the consent version and timestamp before the account exists, so the evidence survives opening the email on another device.
- The user row keeps `consent_version` and `consented_at`.
- A version mismatch makes every account action answer `consent_required` until the student accepts the current notice. The account menu and sync notices offer the re-consent flow.
- Export and deletion do not wait for re-consent.
- A notice change bumps `CURRENT_CONSENT_VERSION` and the frontmatter in all three privacy files in one commit.

### 5.3 What the notice already covers

The notice describes:

- guest data in local storage and the fact that it never reaches the server;
- the account data, table by table, including email, Google name and picture, profile, saved programmes, plan progress, reports, consent record, sessions, verification, pending sign-up and throttle;
- the session and security cookies, the `jisr.auth` hint and the `jisr.account.*` cache;
- the processors and the EU hosting in Frankfurt;
- host logs and the fact that the sign-in code sits after the `#` and does not reach them;
- GoatCounter, its cookieless design, the Do Not Track and Global Privacy Control signals, and the fact that it never receives profile data or email;
- the data files the browser downloads and the fact that they name no grade or nationality;
- retention, including the lazy purge of pre-account rows and the backup caveat;
- rights, export, deletion, rectification, withdrawal of consent and the two complaint authorities;
- what Jisrr never does: no IP or device details in the database, no date of birth, no sharing of profile, grades or nationality with analytics or universities, no sale, no advertising, no marketing email.

### 5.4 What is still open before filing

- **Legal and language review** of the notice and terms in English, French and Arabic (prelaunch checklist row D3).
- **Arabic review** of the machine-drafted Arabic copy (row C1).
- **International-transfer wording.** The notice names the processors and the EU hosting but not the transfer mechanism. Decide the mechanism before filing the F118, and update the notice and consent text if needed.
- **Backups.** The notice says copies may remain for a short time in technical backups and that the provider sets the period. This was not checked against Neon's real retention.
- **Brevo.** The notice makes no region or DPA claim for Brevo. Check where Brevo stores data and accept the DPA if offered.
- **Google.** The notice discloses that Google's name and picture are stored but unused. Decide whether to keep storing them or drop them with `mapProfileToUser`.

## 6. Owner checklist

This is the one-page action list. Keep the evidence outside the repository.

| Step | Action | Evidence to keep | Send back to the repo |
|---|---|---|---|
| 1 | Ask a Moroccan data-protection lawyer to confirm: does Law 09-08 apply; is F211 the right route; is a representative in Morocco required; is a separate cookie declaration needed; what is the transfer basis for Google and for any US support access | Written advice or a dated note of the advice | A short status note only, no personal documents |
| 2 | Decide whether to pause accounts until the declaration is filed. If yes, set `ACCOUNTS_ENABLED` off in Vercel Production and redeploy | The date and the decision | Update the prelaunch checklist status only if the owner confirms |
| 3 | Download the current forms from cndp.ma: F211 and F118; F112 only if advised. Check the version date on each PDF | The downloaded PDFs and their version dates | The form names and version dates |
| 4 | Prepare the attachments: identity and signature proof; privacy notice in fr/en/ar; consent and age text; processing description; security note; processor list and DPA or terms; transfer details | A single filing folder, access-controlled | Nothing containing identity documents, signatures or user data |
| 5 | Fill the F211: controller identity; representative in Morocco if required; processing name; purposes; data categories; data subjects; recipients; retention; security; rights contact; transfer yes | A completed draft and a copy of the final signed form | The processing name, purposes and data categories used, for this packet |
| 6 | Fill the F118: recipients, countries, data categories, purpose, mode and frequency, first transfer date, consent method, security, contractual clauses, reference to the declaration | A completed draft and a copy of the final signed form | The recipient and country list used |
| 7 | Submit through the channel confirmed on cndp.ma. Keep the submission receipt, courier proof or email | Proof of submission with date | The date and channel |
| 8 | Track the declaration receipt (24 hours), the possible 8-day reclassification, and the transfer opinion (2 months, extendable once). Answer any request for missing documents | The récépissé, the transfer receipt or authorisation, and any CNDP letter | The receipt or authorisation number, the date received, and any conditions |
| 9 | If the CNDP asks for changes, update the notice and consent text, bump the consent version in all three locales, and notify the CNDP of the change | The revised filing and the revised notice | The change summary and the new consent version |
| 10 | After the receipt, record the filing in `docs/ops/prelaunch-checklist.md` (rows A3 and D1) and in this packet's status table. Only the owner marks it filed | The owner's confirmation | The status update, with the receipt number and date |

### What "done" looks like

- The owner has a **récépissé de déclaration** for the F211, or a written CNDP decision that no declaration is required, or a written legal opinion, confirmed with the CNDP where possible, that Law 09-08 does not apply.
- The owner has a **récépissé or authorisation de transfert** for the F118, or a written CNDP decision that no transfer filing is required.
- The receipt number, date and any conditions are recorded in the repository, without identity documents or personal data.
- The privacy notice, consent text and actual processing match the filed forms.
- The prelaunch checklist rows A3 and D1 are updated by the owner, not by an agent.

### Filing status

Fill this table after the owner files. Keep the evidence outside the repository. Do not paste receipt scans, identity documents or signatures here.

| Field | Value |
|---|---|
| Declaration form and version date | |
| Date the declaration was filed | |
| Submission channel and proof reference | |
| Declaration receipt number | |
| Declaration receipt date | |
| Transfer form and version date | |
| Date the transfer request was filed | |
| Transfer receipt or authorisation number | |
| Transfer receipt or authorisation date | |
| Conditions or follow-up requested by the CNDP | |
| Owner confirmation date | |
| Repository status updated by (owner) | |

## Sources

Repository:

- `.claude/docs/decisions/0004-operations-privacy-data-freshness.md`, section 6 (privacy and legal).
- `.claude/docs/decisions/0013-accounts.md`, decisions 2, 3, 6, 8, 9, 11 and 14.
- `docs/ops/prelaunch-checklist.md`, rows A3, A4, D1, D2, D3, D9 and D11.
- `docs/ops/security-review-accounts.md`.
- `content/{en,fr,ar}/privacy.mdx` and `content/{en,fr,ar}/terms.mdx`.
- `src/lib/auth/consent.ts`, `src/db/schema/app.ts`, `src/db/schema/auth.ts`, `src/lib/security-headers.ts`.

CNDP pages and documents, checked 2026-10-18:

- Notifier un traitement: https://www.cndp.ma/notifier-un-traitement/
- Notifier une déclaration (type de déclaration, formulaires): https://www.cndp.ma/notifier-une-declaration-type-de-declaration-formulaires/
- Notifier une demande de transfert à l'étranger: https://www.cndp.ma/notifier-une-demande-de-transfert-a-letranger/
- Transfert de données à l'étranger: https://www.cndp.ma/transfert-de-donnees-a-letranger/
- Procédures de notification: https://www.cndp.ma/procedures-de-notification-process/
- Délibération 236-2015 (adequate-country list): https://www.cndp.ma/wp-content/uploads/2023/12/deliberation-n-236-2015-18-12-2015.pdf
- Déclaration normale F211 (2025-09-10): https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Declaration-Normale_F211_20250910_Fr.pdf
- Demande de transfert F118 (2025-09-10): https://www.cndp.ma/wp-content/uploads/2025/09/CNDP-Transfert-Etranger-F118.pdf
- Conditions: https://www.cndp.ma/conditions/
- Contact: https://www.cndp.ma/contact/

The CNDP site also links older form versions on some pages. Use the links on the current "Notifier un traitement" page and re-check the version date before submission.
