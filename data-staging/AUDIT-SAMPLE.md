# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/de-hochschule-rhein-waal-university-of-appl-hrk400-agribusiness-ba-daad4229  _(batch b2-b4c902)_

**Agribusiness BA**

- **durationYears**: `3.5`
  - "Standard study duration 7 semesters" — https://www.hochschule-rhein-waal.de/en/faculties/life-sciences/degree-programmes/agribusiness-ba
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4229/
- **teachingLanguages**: `["en"]`
  - "Your entire degree programme is taught in English." — https://www.hochschule-rhein-waal.de/en/faculties/life-sciences/degree-programmes/agribusiness-ba
- **applicationChannel**: `de-uni-assist`
  - "If so, you’ll need to apply via uni-assist." — https://www.hochschule-rhein-waal.de/en/faculties/life-sciences/degree-programmes/agribusiness-ba
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":[]}`
  - "You need an English language certificate at B2 level of the Common European Framework of Reference for Languages." — https://www.hochschule-rhein-waal.de/en/study/before-starting-university/application-process/guide-for-international-applicants
  - "English language skills B2 required, please provide an official language certificate" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4229/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Titre obtenu hors d'Allemagne : candidature via uni-assist, qui vérifie si le diplôme donne accès aux études en Allemagne.","status":"draft"}}}`
  - "Rhine-Waal University of Applied Sciences works with uni-assist to ensure that international applications can be assessed." — https://www.hochschule-rhein-waal.de/en/study/before-starting-university/application-process/guide-for-international-applicants
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Les diplômes internationaux doivent d'abord être vérifiés avant l'admission, même si la filière est sans restriction d'accès (pas de numerus clausus).","status":"draft"}}}`
  - "Unrestricted: enrolment is possible for nearly every German Abitur; international qualifications require verification first." — https://www.hochschule-rhein-waal.de/en/faculties/life-sciences/degree-programmes/agribusiness-ba

> Preparer's caveats: Year of the deadline not stated; 2027 assumed. uni-assist applies if school-leaving qualifications were completed outside Germany. Tuition 'None' is page-wide (DAAD). OMITTED: intakes (no page states the year of the deadline, only day and month; verifier requires the year; expected next deadline is 15 July 2027 per DAAD 2026/2027 edition). OMITTED: tuition 0 (DAAD says Tuition fees per semester None, but no page quote with explicit wording like no tuition fees was found). RHEIN-WAAL REQUIREMENTS: official pages used: HSRW programme page, HSRW 'Guide for international applicants', DAAD 4229. The pages do not say whether the Moroccan Bac gives direct access or Studienkolleg is needed; uni-assist assesses this depending on country of the certificate and prior studies. The 'seven years of English at school' proof on the programme page applies to German school certificates; international applicants need an English certificate at B2 (accepted-test list is on a separate page and not encoded).

## programs/de-technische-hochschule-augsburg-hrk7-international-informatio-daad7126  _(batch b2-b4c902)_

**International Information Systems BSc**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7126/
  - "Standard Duration 7 Semesters" — https://www.tha.de/en/university/faculties/computer-science/study-program/international-international-information-systems-bsc/
- **teachingLanguages**: `["en"]`
  - "The language of the programme is English." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7126/
  - "In general, the program is taught in English." — https://www.tha.de/en/university/faculties/computer-science/study-program/international-international-information-systems-bsc/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":false,"acceptedTests":[]}`
  - "Please note that a good to very good command of English (at least level B2, as recommended by the CEFR) is required for this degree program." — https://www.tha.de/en/university/faculties/computer-science/study-program/international-international-information-systems-bsc/
  - "English language skills B2 required/recommended, no proof required" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7126/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Titre de fin d'études étranger : traduction certifiée et attestation préliminaire (VPD) délivrée par uni-assist ou l'office bavarois de reconnaissance des certificats.","status":"draft"}}}`
  - "If you have a foreign high school diploma, you must also submit an officially certified translation and the preliminary evaluation documentation (VPD) issued by www.uni-assist.de or the Bavarian Certificate Recognition Office." — https://www.tha.de/en/university/faculties/computer-science/study-program/international-international-information-systems-bsc/
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Procédure d'aptitude (test en ligne, CV en tableau, court essai de motivation) à passer lors de la candidature sur HISinOne.","status":"draft"}}}`
  - "We are looking for highly motivated and dedicated applicants. To this end, we use the aptitude assessment process." — https://www.tha.de/en/university/faculties/computer-science/study-program/international-international-information-systems-bsc/

> Preparer's caveats: Year of the deadline is not stated on the page (DAAD edition 2026/2027, applicants from all countries); 2027 chosen as the next occurrence after today. THA page lists languages 'German, English' but says the programme is generally taught in English. Tuition 'None' is page-wide, not explicitly 'for non-EU students'. uni-assist is mentioned only for certificate evaluation (VPD), not as the application channel (application via HISinOne), so applicationChannel omitted. OMITTED: intakes (no page states the year of the deadline, only day and month; verifier requires the year; expected next deadline is 15 July 2027 per DAAD 2026/2027 edition). OMITTED: tuition 0 (DAAD says Tuition fees per semester None, but no page quote with explicit wording like no tuition fees was found). THA REQUIREMENTS: official pages used: THA programme page (FAQ and 'Your Application') and DAAD 7126. The page does not say whether a Moroccan Bac alone gives direct access or Studienkolleg/Feststellungsprüfung is needed: only that foreign diplomas need a VPD (uni-assist or Bavarian recognition office), which decides this. English B2 is required per the THA FAQ, but DAAD says 'B2 required/recommended, no proof required' (certificates only give bonus points in the aptitude assessment), so certificateRequired=false. The FAQ lists an essay and bonus points under the heading 'International Business Informatics', which looks like a copy-paste from another programme; the aptitude test itself is stated for International Information Systems.

## programs/de-technische-universitat-munchen-hrk184-straubing-sustainable-engineering-daad11020  _(batch b2-b4c902)_

**Sustainable Engineering for Materials and Processes**

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11020/
  - "Standard Duration of Studies 6 semesters" — https://www.tum.de/en/studies/degree-programs/detail/sustainable-engineering-for-materials-and-processes-bachelor-of-science-bsc
- **teachingLanguages**: `["en"]`
  - "The language of instruction in this program is English." — https://www.tum.de/en/studies/degree-programs/detail/sustainable-engineering-for-materials-and-processes-bachelor-of-science-bsc
  - "The degree programme is taught in English." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11020/
- **tuition**: `{"amountMinor":200000,"currency":"EUR","period":"semester"}`
  - "The tuition fees for international students from third countries for this degree program are 2,000 euros per semester." — https://www.tum.de/en/studies/degree-programs/detail/sustainable-engineering-for-materials-and-processes-bachelor-of-science-bsc
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":false,"acceptedTests":[]}`
  - "You do not need to provide proof of language proficiency for this degree program. However, applicants should have a good command of English." — https://www.tum.de/en/studies/degree-programs/detail/sustainable-engineering-for-materials-and-processes-bachelor-of-science-bsc
  - "English language skills B2 required/recommended, no proof required" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11020/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Si le diplôme de fin d'études étranger n'est pas comparable à l'Abitur, l'admission directe n'est possible qu'après le Studienkolleg et l'examen d'évaluation (Feststellungsprüfung).","status":"draft"}}}`
  - "If a school-leaving degree from another country is not comparable to the German university entrance qualification, direct admission can only be granted after attending a Studienkollegs (preparatory studies) and after having taken the university qualification assessment examination." — https://www.tum.de/en/studies/application/application-info-portal/higher-education-entrance-qualification/international-higher-education-entrance-qualification
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Demander avant la candidature l'attestation préliminaire (VPD) à uni-assist, qui vérifie si le diplôme donne accès général ou limité à certaines matières.","status":"draft"}}}`
  - "All applicants who have not obtained their higher education entrance qualification in Germany or have not completed their German school-leaving examination (Abitur), must apply for a Preliminary Documentation (VPD) to uni-assist before submitting an application to TUM." — https://www.tum.de/en/studies/application/application-info-portal/higher-education-entrance-qualification/international-higher-education-entrance-qualification
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Participation obligatoire au test d'aptitude en ligne (Aptitude Recommendation, environ 20 minutes) ; le résultat n'influence pas l'admission.","status":"draft"}}}`
  - "However, participation in the test – and the corresponding proof – is mandatory for the application." — https://www.tum.de/en/studies/degree-programs/detail/sustainable-engineering-for-materials-and-processes-bachelor-of-science-bsc

> Preparer's caveats: Deadline year not stated on the page; 2027 chosen as the next occurrence. Application is via TUMonline (not uni-assist as far as the pages state), so applicationChannel omitted. OMITTED: intakes (no page states the year of the deadline, only day and month; verifier requires the year; expected next deadline is 15 July 2027 per DAAD 2026/2027 edition). TUM REQUIREMENTS: official pages used: TUM programme page, TUM 'International Higher Education Entrance Qualification' page, DAAD 11020. The TUM pages do not say whether the Moroccan Bac is comparable to the Abitur; uni-assist (VPD) decides whether the certificate gives direct access or Studienkolleg is needed. English: TUM says no proof of language proficiency is needed but a good command of English is expected; DAAD says 'B2 required/recommended, no proof required' (ambiguous required/recommended), so minCefr B2 with certificateRequired=false.

## programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236  _(batch b2-b4c902)_

**Licence - Sciences pour l'ingénieur - Portail Marie Curie**

- **durationYears**: `3`
  - "La faculté des Sciences propose un parcours de licence en 3 ans" — https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0
- **applicationChannel**: `fr-campus-france`
  - "Vous êtes titulaire ou futur titulaire du Bac marocain, Bac international marocain, Diplôme européen donnant accès à l'enseignement supérieur européen*, Diplôme étranger hors U.E : vous devrez formuler vos vœux sur la plateforme Études en France de votre pays de résidence." — https://www.maroc.campusfrance.org/candidature-en-1ere-annee-de-licence-a-l-universite-et-en-paces
- **requirement req-1**: `{"kind":"language_proficiency","language":"fr","minCefr":"B2","certificateRequired":true,"acceptedTests":["tcf","delf-dalf"]}`
  - "Niveau de français requis pour s'inscrire à la formation : B2" — https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0
  - "Sauf cas de dispense, la certification de français (TCF, DELF B2, DALF) est obligatoire dans le cadre de la procédure de candidature sur la plateforme Études en France." — https://www.maroc.campusfrance.org/les-certifications-en-francais-obligatoires-pour-campus-france

> Preparer's caveats: No tuition for non-EU, teaching language or intake dates stated. Channel omitted: Parcoursup fiche says non-EU bac-equivalent holders go through the DAP procedure, not Parcoursup. Language rule: Campus France Maroc requires a French certificate (TCF, DELF B2 or DALF) at submission on Etudes en France, except in dispensation cases; it recommends TCF 400 / DELF B2 but states each institution sets its own level, so minCefr is null where the programme page gives none. Parcoursup fiche states B2 French level required to enrol.

## programs/fr-campus-de-bourg-en-bresse-universite-lyo-0011329p-licence-gestion-39678  _(batch b2-b4c902)_

**Licence - Gestion - Parcours Gestion et management**

- **durationYears**: `3`
  - "Les trois années (six semestres) de ce parcours sont intégralement proposées sur le Campus de Bourg-en-Bresse." — https://bourgenbresse.univ-lyon3.fr/licence-de-gestion-management-bourg-en-bresse-3
- **applicationChannel**: `fr-campus-france`
  - "Vous êtes titulaire ou futur titulaire du Bac marocain, Bac international marocain, Diplôme européen donnant accès à l'enseignement supérieur européen*, Diplôme étranger hors U.E : vous devrez formuler vos vœux sur la plateforme Études en France de votre pays de résidence." — https://www.maroc.campusfrance.org/candidature-en-1ere-annee-de-licence-a-l-universite-et-en-paces
- **requirement req-1**: `{"kind":"language_proficiency","language":"fr","minCefr":null,"certificateRequired":true,"acceptedTests":["tcf","delf-dalf"]}`
  - "Sauf cas de dispense, la certification de français (TCF, DELF B2, DALF) est obligatoire dans le cadre de la procédure de candidature sur la plateforme Études en France." — https://www.maroc.campusfrance.org/les-certifications-en-francais-obligatoires-pour-campus-france

> Preparer's caveats: Parcoursup fiche shows 178 EUR/year (national rate, not stated for non-EU): omitted. Channel omitted: fiche says non-EU bac-equivalent holders do not use Parcoursup but the DAP procedure. Teaching language not stated. Language rule: Campus France Maroc requires a French certificate (TCF, DELF B2 or DALF) at submission on Etudes en France, except in dispensation cases; it recommends TCF 400 / DELF B2 but states each institution sets its own level, so minCefr is null where the programme page gives none. Lyon 3 page expects specialities mathematics/SES/history-geography (French bac) but says the licence is open to all bacheliers; not encoded. Its page says apply via Parcoursup and has an outdated 2011 DAP line for foreign diplomas; Campus France Maroc says Moroccan bac holders use Etudes en France.

## programs/fr-i-u-t-angouleme-0161125l-but-techniques-de-commercialisat-3016  _(batch b2-b4c902)_

**BUT - Techniques de commercialisation**

- **durationYears**: `3`
  - "1800 heures d'enseignements réparties sur 6 semestres" — https://iut-angouleme.univ-poitiers.fr/formations/b-u-t-tc-techniques-de-commercialisation/
- **applicationChannel**: `fr-campus-france`
  - "Bac marocain ou Bac international marocain ou diplôme européen de fin d'études secondaires*, quelque soit votre lieu de résidence et l'année du diplôme, vous devrez formuler vos vœux sur la plateforme Études en France." — https://www.maroc.campusfrance.org/candidature-en-1ere-annee-but-a-l-universite-iut
- **requirement req-1**: `{"kind":"language_proficiency","language":"fr","minCefr":null,"certificateRequired":true,"acceptedTests":["tcf","delf-dalf"]}`
  - "Sauf cas de dispense, la certification de français (TCF, DELF B2, DALF) est obligatoire dans le cadre de la procédure de candidature sur la plateforme Études en France." — https://www.maroc.campusfrance.org/les-certifications-en-francais-obligatoires-pour-campus-france
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Admission sur dossier scolaire examiné par un jury : résultats du lycée (matières liées à la spécialité), appréciations, motivation. À préparer avec vos bulletins.","status":"draft"}}}`
  - "L'admission est prononcée par un jury après examen du dossier scolaire, sur les critères suivants : évaluations obtenues au lycée avec une attention particulière pour les matières en rapport avec la spécialité" — https://iut-angouleme.univ-poitiers.fr/formations/b-u-t-tc-techniques-de-commercialisation/

> Preparer's caveats: No tuition for non-EU, teaching language or intake dates stated. Channel omitted: non-EU applicants abroad use Campus France per the Parcoursup fiche. Language rule: Campus France Maroc requires a French certificate (TCF, DELF B2 or DALF) at submission on Etudes en France, except in dispensation cases; it recommends TCF 400 / DELF B2 but states each institution sets its own level, so minCefr is null where the programme page gives none. The page's admission criteria are not stated per applicant type; assumed to apply to all.

## programs/fr-i-u-t-clermont-auvergne-site-daurillac-0150746e-but-science-des-donnees-24715  _(batch b2-b4c902)_

**BUT - Science des données**

- **durationYears**: `3`
  - "Les études se déroulent sur 3 ans à temps plein, découpés en 6 semestres" — https://iut.uca.fr/formations/but-science-des-donnees-aurillac
- **teachingLanguages**: `["fr"]`
  - "Langues d'enseignement Français" — https://iut.uca.fr/formations/but-science-des-donnees-aurillac
- **applicationChannel**: `fr-campus-france`
  - "Bac marocain ou Bac international marocain ou diplôme européen de fin d'études secondaires*, quelque soit votre lieu de résidence et l'année du diplôme, vous devrez formuler vos vœux sur la plateforme Études en France." — https://www.maroc.campusfrance.org/candidature-en-1ere-annee-but-a-l-universite-iut
- **requirement req-1**: `{"kind":"language_proficiency","language":"fr","minCefr":null,"certificateRequired":true,"acceptedTests":["tcf","delf-dalf"]}`
  - "Sauf cas de dispense, la certification de français (TCF, DELF B2, DALF) est obligatoire dans le cadre de la procédure de candidature sur la plateforme Études en France." — https://www.maroc.campusfrance.org/les-certifications-en-francais-obligatoires-pour-campus-france

> Preparer's caveats: Tuition: Parcoursup fiche shows 178 EUR per year, which is the national rate and not stated for non-EU students; omitted. No intake dates stated for non-EU applicants. Application channel: official pages say non-EU applicants residing abroad use Campus France (Etudes en France), not Parcoursup; channel omitted. Language rule: Campus France Maroc requires a French certificate (TCF, DELF B2 or DALF) at submission on Etudes en France, except in dispensation cases; it recommends TCF 400 / DELF B2 but states each institution sets its own level, so minCefr is null where the programme page gives none. The IUT page lists bac specialities (mathematics, numerique, SES) for the French bac and accepts 'Diplômes étrangers équivalents au baccalauréat'; not encoded as a subject rule.

## programs/nl-avans-hogeschool-07gr-bouwkunde-1001o3048  _(batch b2-b4c902)_

**Bouwkunde**

- **durationYears**: `4`
  - "Locatie Den Bosch, Tilburg Startmaand September Duur 4 jaar, voltijd bachelor Taal Nederlands" — https://www.avans.nl/studeren/opleidingen/bachelor/bouwkunde-voltijd
- **teachingLanguages**: `["nl"]`
  - "Locatie Den Bosch, Tilburg Startmaand September Duur 4 jaar, voltijd bachelor Taal Nederlands" — https://www.avans.nl/studeren/opleidingen/bachelor/bouwkunde-voltijd
- **tuition**: `{"amountMinor":1030800,"currency":"EUR","period":"year"}`
  - "Tarief 2026-2027 Voltijd Duaal Deeltijd Instellingscollegegeld € 10.308 € 10.308 € 10.308" — https://www.avans.nl/studeren/praktische-zaken/studiekosten
  - "Avans is verplicht het instellingscollegegeld te vragen als je niet aan bovengenoemde voorwaarden voor het wettelijk collegegeld voldoet." — https://www.avans.nl/studeren/praktische-zaken/studiekosten
- **applicationChannel**: `nl-studielink`
  - "Stap 2: Meld je aan in Studielink Doe in Studielink een verzoek tot inschrijving voor de opleiding van jouw keuze." — https://www.avans.nl/studeren/praktische-zaken/aanmelden
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme havo, vwo ou mbo niveau 4 est exigé (équivalence du Bac à faire vérifier auprès d'Avans) ; certaines filières demandent un profil avec matières complémentaires.","status":"draft"}}}`
  - "Dat kan alleen als je een havo-, vwo- of mbo niveau 4-diploma hebt." — https://www.avans.nl/studeren/praktische-zaken/aanmelden/toelating
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Pour les étudiants hors EEE, l'intake (studiekeuzecheck) est obligatoire, et un avis positif à l'intake conditionne la demande de visa.","status":"draft"}}}`
  - "Voor NON-EER studenten is de intake verplicht." — https://www.avans.nl/studeren/praktische-zaken/aanmelden/studiekeuzecheck
  - "Positief advies naar aanleiding van je intake (motivatiegesprek + studiekeuzecheck)." — https://www.avans.nl/studeren/praktische-zaken/aanmelden/toelating/visum-en-verblijfsvergunning

> Preparer's caveats: Programme is offered voltijd in both Den Bosch and Tilburg (page lists both). Tuition is the 2026-2027 institutional fee (page does not yet show 2027-2028); the page's non-EEA statement is indirect (institutional fee applies when statutory conditions, incl. EEA nationality, are not met). Deadline year 2027 inferred (next September intake from today 2026-10-01); page states no year. Requirements: the programme page's own 'Toelatingseisen' tabs (profile requirements per havo/vwo profile) are not readable as text, so no subject rule is encoded; no Dutch language requirement for foreign diplomas was found on Avans pages for this Dutch-taught programme (applicants should confirm with Avans). The non-EEA intake is mandatory per the general studiekeuzecheck page.
> Not accepted by the verifier: intakes: the date 2027-05-01 is not supported by the quotes

## programs/nl-breda-university-of-applied-sciences-21ui-applied-data-science-art-1001o8756  _(batch b2-b4c902)_

**Applied Data Science & Artificial Intelligence**

- **durationYears**: `4`
  - "Applied Data Science & Artificial Intelligence Bachelor 4 years Full-time English Start 30 August 2027" — https://www.buas.nl/en/programmes/applied-data-science-artificial-intelligence
- **teachingLanguages**: `["en"]`
  - "Applied Data Science & Artificial Intelligence Bachelor 4 years Full-time English Start 30 August 2027" — https://www.buas.nl/en/programmes/applied-data-science-artificial-intelligence
- **applicationChannel**: `nl-studielink`
  - "You are required to apply via Studielink, the platform for enrolment in higher education in the Netherlands." — https://www.buas.nl/en/programmes/artificial-intelligence-data-management/application-procedure
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme équivalent à un havo ou vwo néerlandais avec un profil approprié est exigé : faire vérifier l'équivalence du Bac et du profil auprès de BUas.","status":"draft"}}}`
  - "To be admitted to this degree programme, you need a higher general secundary education (havo) or pre-university education (vwo) diploma with an appropriate profile, or an equivalent of these Dutch diplomas." — https://www.buas.nl/en/programmes/applied-data-science-artificial-intelligence
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Admission sur sélection (125 places maximum) : devoir portfolio en ligne puis entretien en anglais ; fournir diplôme avec relevé de notes, CV et pièce d'identité.","status":"draft"}}}`
  - "This consists of a portfolio assignment and an interview." — https://www.buas.nl/en/programmes/applied-data-science-artificial-intelligence
  - "The Applied Data Science & Artificial Intelligence programme admits a maximum of 125 students each year through a selection procedure." — https://www.buas.nl/en/programmes/artificial-intelligence-data-management/application-procedure

> Preparer's caveats: Tuition omitted: study-costs page gives EUR 14,650 institutional fee only 'in general' for 2027-2028, and says this programme has the 'Small-Scale and Intensive Education' feature with a HIGHER fee whose amount is not stated on any readable page (tuition fee calculator is interactive). Deadline year 2027 inferred from 'Start 30 August 2027'; the page says 1 May without year. Requirements: the profile wording ('appropriate profile') is not specified for non-Dutch diplomas and the dedicated BUas admission-requirements page is behind a Cloudflare challenge (not fetchable), so no subject rule is encoded. English proficiency is asked in My Online Application but the pages reached state no CEFR level or accepted test, so no language rule is encoded. The programme FAQ mentions a basic mathematics test at HAVO level, not clearly part of the selection for all applicants, so not encoded.
> Not accepted by the verifier: intakes: the date 2027-05-01 is not supported by the quotes

## programs/nl-capabel-hogeschool-30hc-rotterdam-ict-1001o8912  _(batch b2-b4c902)_

**ICT**

- **durationYears**: `4`
  - "HBO Bachelor Deeltijd, Voltijd 4 jaar NVAO" — https://www.capabel.nl/opleidingen/ict-web/bachelor-hbo-ict
- **tuition**: `{"amountMinor":681600,"currency":"EUR","period":"year"}`
  - "Of bij betaling in één keer: € 6.816 € 6.134 10% korting" — https://www.capabel.nl/opleidingen/ict-web/bachelor-hbo-ict
  - "Genoemde bedragen lesgeld zijn per studiejaar." — https://www.capabel.nl/opleidingen/ict-web/bachelor-hbo-ict
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme HAVO, VWO ou MBO 4 est exigé (équivalence du Bac non précisée) ; fournir copie du diplôme et pièce d'identité, la commission d'examen décide.","status":"draft"}}}`
  - "Voor het volgen van deze opleiding is minimaal een HAVO, VWO of MBO 4-diploma vereist." — https://www.capabel.nl/opleidingen/ict-web/bachelor-hbo-ict
  - "De examencommissie beslist over toelating tot de opleiding en de toekenning van vrijstellingen." — https://www.capabel.nl/opleidingen/ict-web/bachelor-hbo-ict

> Preparer's caveats: Private institution: flat lesgeld EUR 6,816 per study year (12 x EUR 568), same figure shown for Voltijd and Deeltijd tabs; page does not distinguish EU/non-EU. Excluded: EUR 90 registration fee and books. Rotterdam is among the listed locations. No teaching language stated on page; no application deadline (rolling starts, e.g. 1 February 2027); no Studielink mention so applicationChannel omitted. Requirements: the page does not say how a foreign (Moroccan) diploma is assessed, nor any Dutch/English language requirement or visa matter for non-EU applicants; only the general HAVO/VWO/MBO 4 diploma requirement is encoded.

