# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/nl-capabel-hogeschool-30hc-utrecht-bedrijfskunde-1016o3182  _(batch b36-47d65e)_

**Bedrijfskunde**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl"]` (official; source page-1) (unchanged: already in data/)
- **tuition**: `{"amountMinor":681600,"currency":"EUR","period":"year"}` (official; source programme) (unchanged: already in data/)
- **intakes**: `[{"startDate":"2026-12-01","applicationOpens":null,"applicationDeadline":null},{"startDate":"2027-04-01","applicationOpens":null,"applicationDeadline":null}]` (official; source programme)
  - "Amsterdam 01 december 2026 wo & do 10.00 - 16.00" — https://www.capabel.nl/opleidingen/bedrijfskunde-leiderschap/hbo-bachelor-bedrijfskunde
  - "01 april 2027 wo & do 10:00-16:00" — https://www.capabel.nl/opleidingen/bedrijfskunde-leiderschap/hbo-bachelor-bedrijfskunde
- **documents**: `[{"slug":"diploma-and-grade-list","name":{"fr":{"text":"Copie du diplôme pertinent et du relevé de notes correspondant","status":"draft"},"en":{"text":"Copy of relevant diploma and accompanying grade list","status":"draft"},"ar":{"text":"نسخة من الشهادة المعنية ومن كشف النقاط المرافق له","status":"draft"}},"translationRequired":null}]` (official; source programme) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme HAVO, VWO ou MBO 4 est exigé (équivalence du Bac non précisée) ; fournir copie du diplôme, relevé de notes et pièce d'identité, la commission d'examen décide.","status":"draft"},"en":{"text":"A HAVO, VWO or MBO 4 diploma is required (equivalence of the Bac not specified); provide a copy of the diploma, transcript and ID, the examination board decides.","status":"draft"},"ar":{"text":"يُشترط دبلوم HAVO أو VWO أو MBO 4 (معادلة الباكالوريا غير محددة)؛ قدّموا نسخة من الشهادة وكشف النقط وبطاقة الهوية، ولجنة الامتحانات هي من تقرّر.","status":"draft"}}}`

> Preparer's caveats: documents: kept the existing official value; the reader found [{"slug":"diploma-and-grade-list","name":{"fr":{"text":"Copie du diplôme pertinent et du relevé de notes correspondant","status":"draft"},"en":{"text":"Copy of relevant diploma and corresponding grade list","status":"draft"}},"translationRequired":null},{"slug":"id-copy","name":{"fr":{"text":"Copie de la pièce d'identité","status":"draft"},"en":{"text":"Copy of ID","status":"draft"}},"translationRequired":null}] at https://www.capabel.nl/opleidingen/bedrijfskunde-leiderschap/hbo-bachelor-bedrijfskunde; Facts apply to both the voltijd and deeltijd variants of the programme. The tuition amount is the one-off payment option; the page also offers 12 instalments of € 568, plus € 90 inschrijfgeld and circa € 315 book costs per year (not included). The two intake dates (2026-12-01 and 2027-04-01) are start dates at Amsterdam, Rotterdam and Utrecht for both voltijd and deeltijd; no application deadline is stated. The pages do not mention Studielink or any other application platform, so applicationChannel was left out. The page states Dutch-taught requirements only (HAVO/VWO/MBO 4); no language proficiency rule could be quoted. Requirements shown are the generic ones on this programme page.

## programs/nl-de-haagse-hogeschool-27um-applied-data-science-art-1001o8742  _(batch b36-47d65e)_

**Applied Data Science & Artificial Intelligence**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":1052800,"currency":"EUR","period":"year"}` (official; source page-1)
  - "De bedragen worden ieder jaar vastgesteld." — https://www.dehaagsehogeschool.nl/studiekeuze/alles-over-aanmelden-en-inschrijven/collegegeld
  - "Instellingscollegegeld € 10.164,- € 10.528,-" — https://www.dehaagsehogeschool.nl/studiekeuze/alles-over-aanmelden-en-inschrijven/collegegeld
- **applicationChannel**: `nl-studielink` (official; source programme) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que vous avez réussi les mathématiques A ou B avec une note suffisante ; c'est une condition d'admission.","status":"draft"},"en":{"text":"Check that you have passed Mathematics A or B with a sufficient grade; this is an admission requirement.","status":"draft"},"ar":{"text":"تحقق من أنك نجحت في الرياضيات A أو B بعلامة كافية؛ وهذا شرط للقبول.","status":"draft"}}}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Si vous avez un diplôme étranger, vous devez prouver votre maîtrise du néerlandais ; consultez les Taaleisen Nederlands.","status":"draft"},"en":{"text":"If you have a foreign diploma, you must prove your proficiency in Dutch; see the Taaleisen Nederlands.","status":"draft"},"ar":{"text":"إذا كانت لديك شهادة أجنبية، فيجب أن تثبت إتقانك للهولندية؛ راجع Taaleisen Nederlands.","status":"draft"}}}`

> Preparer's caveats: Tuition: the fee of EUR 10,528 (2026-2027 institutional rate) comes from an institution-wide page; the programme page has no fee. The quote states the amounts for all bachelor/Ad/funded master programmes and the exceptions concern joint degrees and English-taught master programmes, not this bachelor. The Dutch page uses rekening/vertaaldocumenten wording; translation requirements not stated and therefore left out.

## programs/nl-fontys-hogeschool-30gb-tilburg-technische-bedrijfskunde-1001o3682  _(batch b36-47d65e)_

**Technische Bedrijfskunde**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl"]` (official; source programme) (unchanged: already in data/)
- **intakes**: `[{"startDate":"2027-09-06","applicationOpens":null,"applicationDeadline":null}]` (official; source programme)
  - "6 september 2027 Start eerste lesweek" — https://www.fontys.nl/Opleidingen/Technische-Bedrijfskunde-bachelor-voltijd.htm
- **applicationChannel**: `nl-studielink` (official; source programme) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez les exigences d'admission spécifiques pour les diplômés étrangers : consultez la page 'Toelating' (admission internationale) car la page du programme mentionne uniquement havo/vwo/mbo niveau 4.","status":"draft"},"en":{"text":"Check the specific admission requirements for foreign diploma holders: see the 'Toelating' (international admission) page, as the programme page only mentions havo/vwo/mbo level 4.","status":"draft"},"ar":{"text":"تحقق من شروط القبول الخاصة بحاملي الشهادات الأجنبية: راجع صفحة «Toelating» (القبول الدولي) لأن صفحة البرنامج لا تذكر سوى havo وvwo وmbo من المستوى 4.","status":"draft"}}}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Les frais de scolarité pour les étudiants hors EEE (instellingscollegegeld) sont fixés par le College van Bestuur et varient par programme : utilisez le collegegeldmeter pour le montant exact.","status":"draft"},"en":{"text":"Tuition for non-EEA students (instellingscollegegeld) is set by the Executive Board and varies per programme: use the collegegeldmeter for the exact amount.","status":"draft"},"ar":{"text":"يحدد College van Bestuur الرسوم الدراسية (instellingscollegegeld) للطلبة من خارج EEE (المنطقة الاقتصادية الأوروبية)، وتختلف من برنامج إلى آخر: استعمل collegegeldmeter لمعرفة المبلغ بدقة.","status":"draft"}}}`

> Preparer's caveats: Tuition left out: the only fee information is institution-wide and contains no amount (the collegegeld pages state fees depend on nationality and that the instellingscollegegeld amount is set by the College van Bestuur and varies per programme or student group; no non-EU amount for 2026-2027 or later is quoted). Intakes: the programme starts in September and February; only the 6 September 2027 first lesson week is dated. The '1 mei 2027' deadline is not tied to international/non-EU applicants, so it is not entered. The page's own admission requirement ('Met een havo-, vwo-, of mbo-diploma (niveau 4) ben je direct toelaatbaar.') is not applicable to a Moroccan Baccalauréat holder and references a separate international admission page not supplied.

## programs/nl-hogeschool-inholland-27pz-alkmaar-accountancy-1001o3549  _(batch b36-47d65e)_

**Accountancy**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":1036000,"currency":"EUR","period":"year"}` (official; source page-2) (unchanged: already in data/)
- **applicationChannel**: `nl-studielink` (official; source page-1) (unchanged: already in data/)
- **documents**: `[{"slug":"final-transcript","name":{"fr":{"text":"Relevé de notes final","status":"draft"},"en":{"text":"final transcript","status":"draft"}},"translationRequired":null},{"slug":"identity-document","name":{"fr":{"text":"Pièce d'identité","status":"draft"},"en":{"text":"identity document","status":"draft"}},"translationRequired":null}]` (official; source page-3)
  - "If you would like to apply, please send us copies of your diploma and your final transcript." — https://www.inholland.nl/inhollandcom/degree-programmes/information-technology-eng-full-time/entry-requirements/
  - "Als je persoonsgegevens nog niet zijn geverifieerd in Studielink dan moet je een kopie van je identiteitsbewijs uploaden via Selfservice." — https://www.inholland.nl/media/bksfqj3s/in-en-uitschrijfregels_202526052025.pdf

> Preparer's caveats: Tuition fee proposed is the institution-wide institutional fee (instellingscollegegeld) for full-time (voltijd) students in 2027-2028, for students who do not meet the conditions for the statutory fee (EU/EEA/Swiss/Surinamese nationality). The programme's own page does not state a tuition fee. The applying student is a non-EU Moroccan with a foreign diploma, so this institutional fee is the relevant one. The pages do not state a programme-specific application deadline for non-EU applicants; the general deadline 1 May 2025 in the In- en uitschrijfregels is for 2025-2026 and not clearly tied to this programme, so no intake fact is included. Documents: the identity document requirement is an enrolment condition; a school-leaving certificate and final transcript are requested for international diploma applicants. The Dutch language requirement B2 is stated on the Creative Business English entry requirements page and in the In- en uitschrijfregels (par. 2.12) applies to Dutch-taught programmes; for this Dutch-taught Accountancy programme it is relevant.
> Not accepted by the verifier: tuition: the amount 10665 does not appear in the quote

## programs/nl-hogeschool-inholland-27pz-haarlem-bouwkunde-1001o3064  _(batch b36-47d65e)_

**Bouwkunde**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":1036000,"currency":"EUR","period":"year"}` (official; source page-1) (unchanged: already in data/)
- **applicationChannel**: `nl-studielink` (official; source page-2) (unchanged: already in data/)
- **documents**: `[{"slug":"diploma","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"Diploma","status":"draft"}},"translationRequired":null},{"slug":"transcript","name":{"fr":{"text":"Relevé de notes","status":"draft"},"en":{"text":"Transcript","status":"draft"}},"translationRequired":null},{"slug":"identity-document","name":{"fr":{"text":"Pièce d'identité","status":"draft"},"en":{"text":"Identity document","status":"draft"}},"translationRequired":null}]` (official; source page-3)
  - "Stap 1: Schrijf je in via Studielink en deel de benodigde documenten met de Centrale Studentenadministratie" — https://www.inholland.nl/media/gk0dc3us/5-suriname-visa-sept-2026-leefgeld-nj.pdf
  - "De CSA beoordeelt alleen diploma’s nadat je een aanmelding via Studielink hebt gedaan en je diploma, cijferlijst, en, indien nodig, een vertaling van een beëdigd vertaler, hebt geüpload in Selfservice." — https://www.inholland.nl/media/bksfqj3s/in-en-uitschrijfregels_202526052025.pdf
  - "Als je persoonsgegevens nog niet zijn geverifieerd in Studielink dan moet je een kopie van je identiteitsbewijs uploaden via Selfservice." — https://www.inholland.nl/media/bksfqj3s/in-en-uitschrijfregels_202526052025.pdf
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez auprès de l'établissement si vous devez démontrer votre maîtrise du néerlandais et à quel niveau.","status":"draft"},"en":{"text":"Check with the institution whether you need to demonstrate Dutch proficiency and at what level.","status":"draft"},"ar":{"text":"تحقق لدى المؤسسة مما إذا كان عليك إثبات إتقانك الهولندية وبأي مستوى.","status":"draft"}}}`

> Preparer's caveats: Programme page states Dutch as the language of instruction and a 4-year duration. Tuition: the programme's own page gives no fee; the institution-wide collegegeld page gives one instellingscollegegeld amount for voltijd/duaal for study year 2027-2028 (€ 10.665) and states students who do not meet the statutory-fee conditions pay the institutional fee. Deadline: the Suriname visa page gives 1 May for Studielink registration but is aimed at Surinamese students; treated as a recurring deadline without a year.
> Not accepted by the verifier: tuition: the amount 10665 does not appear in the quote

## programs/nl-hogeschool-rotterdam-22oj-applied-data-science-art-1001o8776  _(batch b36-47d65e)_

**Applied Data Science & Artificial Intelligence**

- **durationYears**: `4` (official; source page-4)
  - "Duur en startmoment 4 jaar, september" — https://www.hogeschoolrotterdam.nl/opleidingen/bachelor/applied-data-science--artificial-intelligence/voltijd/
- **teachingLanguages**: `["nl"]` (official; source page-4)
  - "Opleidingstype Voltijd Bachelor Taal Nederlands (literatuur veelal in Engels)" — https://www.hogeschoolrotterdam.nl/opleidingen/bachelor/applied-data-science--artificial-intelligence/voltijd/
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":null,"recurringDeadline":{"month":4,"day":1}}]` (official; source page-1) (unchanged: already in data/)
- **applicationChannel**: `nl-studielink` (official; source page-3) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que votre diplôme étranger (Baccalauréat marocain) est comparable au diplôme néerlandais requis et que vous maîtrisez suffisamment le néerlandais ; contactez Team Admissions pour faire évaluer votre admissibilité.","status":"draft"},"en":{"text":"Check whether your foreign diploma (Moroccan Baccalauréat) is comparable to the required Dutch diploma and whether you have sufficient command of Dutch; contact Team Admissions to have your eligibility assessed.","status":"draft"},"ar":{"text":"تحقق من أن شهادتك الأجنبية (البكالوريا المغربية) قابلة للمقارنة بالشهادة الهولندية المطلوبة ومن أنك تتقن الهولندية بما يكفي؛ تواصل مع Team Admissions لتقييم إمكانية قبولك.","status":"draft"}}}`

> Preparer's caveats: Tuition: the programme's own page states no fee; the institution-wide page https://www.hogeschoolrotterdam.nl/voorlichting/inschrijving/collegegeld-en-betalen/ gives instellingscollegegeld for voltijd bachelor programmes of 10.684,- (2026-2027), but its quote for who pays it ('Studenten uit niet-EER landen betalen instellingscollegegeld') appears on the page of a different programme (Bedrijfskunde deeltijd), so no single page provides both the non-EU rule and the amount, and tuition was left out. Intake: 'meld je uiterlijk op 1 mei aan via Studielink' and the 1 May deadline are general, not stated for non-EU/international applicants, so no intake was recorded; the visa page's 'Non-EU Aanmelders: 1 april' is a visa-application document deadline, not the programme application deadline.

