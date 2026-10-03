# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/de-ebs-universitat-fur-wirtschaft-und-recht-hrk206-bachelors-in-business-st-daad4080  _(batch b8-3574bc)_

**Bachelor's in Business Studies (BSc)**

- **durationYears**: `3` (official; source daad)
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4080/
- **teachingLanguages**: `["en"]` (official; source daad)
  - "The programme follows international standards and is therefore 100% in English." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4080/
- **tuition**: `{"amountMinor":908000,"currency":"EUR","period":"semester"}` (official; source daad)
  - "The following tuition fees apply for applicants from: all countries 9,080 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4080/
- **documents**: `[{"slug":"curriculum-vitae","name":{"fr":{"text":"Curriculum vitae sous forme tabulaire","status":"draft"},"en":{"text":"Curriculum vitae in tabular form","status":"draft"}},"translationRequired":null},{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"School-leaving certificate","status":"draft"}},"translationRequired":null}]` (official; source daad)
  - "Begin your application by submitting the following documents: Curriculum vitae in tabular form Proof of a general higher education entrance qualification or a foreign school-leaving certificate recognised as equivalent." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4080/

> Preparer's caveats: Tuition: the DAAD page states 9,080 EUR per semester for applicants from 'all countries'; this is the figure used for a non-EU applicant (a different, Master-specific fee schedule PDF was ignored). Application channel: no page states that foreign applicants use uni-assist or a VPD; the EBS pages describe a fully digital application via EBS's own Bewerbungsportal, so de-university-direct was chosen. Deadlines: EBS states there are no application deadlines (DAAD page: 'There are no application deadlines at EBS.'), so no intake dates were output; the visa-related dates are recommendations only and are recorded as a manual_check. Documents: the list covers the two items named by the DAAD page ('Curriculum vitae in tabular form' and 'foreign school-leaving certificate'); no quote about translation requirements was found, so translationRequired is null.

## programs/de-fachhochschule-aachen-hrk2-julich-bachelor-of-science-in-i-daad11243  _(batch b8-3574bc)_

**Bachelor of Science in Industrial Engineering — Sustainable Energy Systems**

- **teachingLanguages**: `["de"]` (official; source daad)
  - "Teaching language German" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11243/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}` (official; source daad)
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11243/
- **applicationChannel**: `de-uni-assist` (official; source daad)
  - "Deadlines: 15 July for international applicants (only through uni-assist)" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/11243/

## programs/de-hochschule-aalen-technik-wirtschaft-und-hrk3-bachelor-of-engineering-daad10638  _(batch b8-3574bc)_

**Bachelor of Engineering in Sales Engineering**

- **durationYears**: `3.5` (official; source page-2) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}` (official; source page-2) (unchanged: already in data/)
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":"2026-12-03"}]` (official; source programme) (unchanged: already in data/)
- **applicationChannel**: `de-uni-assist-vpd` (official; source page-3) (unchanged: already in data/)
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"School-leaving certificate","status":"draft"}},"translationRequired":null},{"slug":"language-certificate","name":{"fr":{"text":"Certificat de langue","status":"draft"},"en":{"text":"Language certificate","status":"draft"}},"translationRequired":null},{"slug":"vpd-certificate","name":{"fr":{"text":"Certificat VPD de uni-assist","status":"draft"},"en":{"text":"VPD certificate from uni-assist","status":"draft"}},"translationRequired":null},{"slug":"passport-photo","name":{"fr":{"text":"Photo d'identité","status":"draft"},"en":{"text":"Passport picture","status":"draft"}},"translationRequired":null},{"slug":"passport-copy","name":{"fr":{"text":"Copie du passeport","status":"draft"},"en":{"text":"Passport copy","status":"draft"}},"translationRequired":null}]` (official; source page-3)
  - "These include your entrance qualification, language certificate(s), the VPD-Certificate from uni-assist, passport picture and a passport copy." — https://www.hs-aalen.de/en/application-studying/application-process/english-taught-programs/
  - "Send us the officially certified documents of your school-leaving certificate or your Bachelor's Degree certificate respectively via postal mail to the address mentioned in the portal." — https://www.hs-aalen.de/en/application-studying/application-process/english-taught-programs/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un test d'aptitude (TestAS ou SAT/ACT) est normalement requis pour les programmes de Bachelor. Vérifiez les exigences exactes pour les candidats internationaux.","status":"draft"},"en":{"text":"An aptitude test (TestAS or SAT/ACT) is normally required for Bachelor's programmes. Please check the exact requirements for international applicants.","status":"draft"}}}`

> Preparer's caveats: Les frais de scolarité de 1500 EUR par semestre s'appliquent aux étudiants internationaux hors UE/EEE dans le Bade-Wurtemberg, ce qui correspond au profil de l'étudiant marocain. Un test d'aptitude (TestAS ou SAT) peut être exigé pour l'admission en Bachelor, mais l'exigence est suspendue pour la période de candidature du semestre d'été 2027 (information figurant sur la page des programmes en anglais). Les dates d'ouverture des candidatures ne sont pas précisées pour ce programme. Aucune date d'ouverture n'est fournie.

## programs/de-hochschule-albstadt-sigmaringen-hrk4-albstadt-industrial-engineering-daad9996  _(batch b8-3574bc)_

**Industrial Engineering**

- **durationYears**: `3.5` (official; source daad)
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9996/
  - "This degree programme will teach you the basic skills that will enable you to do this in seven semesters." — https://www.hs-albsig-international.de//field-of-studies/industrial-engineering
- **teachingLanguages**: `["de","en"]` (official; source daad)
  - "Teaching language: First until fourth semester: German Fifth until seventh semester: English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9996/
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}` (official; source daad)
  - "The following tuition fees apply for applicants from: non-EU countries 1,500 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9996/

> Preparer's caveats: The documents for international applicants are listed on the application page, but the quotes do not name individual documents in a way that meets the evidence requirement (e.g., 'certificate from Institute for International Students' is not a standard document name), so the documents fact is omitted. The application channel is listed as university-direct on the university's international application page; the DAAD page's link (https://www.hs-albsig-international.de//application) confirms this. The deadline of 15 July is for the winter semester; the quote from the application page ('from 1st of May until 15 July for the winter term') lacks a year, so the intake is left out as per the rules.

## programs/de-hochschule-bremerhaven-hrk41-sustainable-process-engi-daad10400  _(batch b8-3574bc)_

**Sustainable Process Engineering**

- **durationYears**: `3.5` (official; source daad)
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10400/
- **teachingLanguages**: `["de","en"]` (official; source daad)
  - "Teaching language German English Languages First to third semester: German Fourth to sixth semester: English Seventh semester: English or German (industrial internship and final thesis project)" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10400/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"semester"}` (official; source daad)
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10400/
- **applicationChannel**: `de-uni-assist` (official; source page-1)
  - "International applicants who have obtained their higher education entrance qualification outside the EU must apply on the uni-assist application portal." — https://www.hs-bremerhaven.de/en/study/application-for-bachelor-courses
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Certificat de fin d'études secondaires","status":"draft"},"en":{"text":"School leaving certificate","status":"draft"}},"translationRequired":null},{"slug":"curriculum-vitae","name":{"fr":{"text":"Curriculum vitae signé personnellement","status":"draft"},"en":{"text":"Personally signed curriculum vitae","status":"draft"}},"translationRequired":null},{"slug":"passport","name":{"fr":{"text":"Passeport","status":"draft"},"en":{"text":"Passport","status":"draft"}},"translationRequired":null}]` (official; source page-1)
  - "University entrance qualification or school leaving certificate (regular copy is sufficient)" — https://www.hs-bremerhaven.de/en/study/application-for-bachelor-courses
  - "Personally signed curriculum vitae, photograph" — https://www.hs-bremerhaven.de/en/study/application-for-bachelor-courses
  - "Copy of birth certificate or identity card/passport" — https://www.hs-bremerhaven.de/en/study/application-for-bachelor-courses

> Preparer's caveats: Application deadline dates are for the 2026/27 winter semester (15 July 2026 for non-EU applicants) and summer semester 2026 (15 January 2026 for non-EU applicants). The tuition fact states no tuition fees per semester (0 EUR); the programme page says 'Tuition fees per semester None'. Semester contribution 420 EUR is separate. Language requirements: German C1 is stated by DAAD; English B1 is stated by DAAD. The university page states that applicants who did not acquire their university entrance qualification at a German-speaking institution need proof of German language skills at level C1 of the CEFR, except for International Tourism Management (ITM). Documents listed are from the university application page for bachelor courses and apply to all bachelor applicants; they may not be exhaustive for this specific programme. The documents 'copy of birth certificate' and 'proof of health insurance' are not included because they are not clearly required for this programme or are part of enrolment, not application.

## programs/de-hochschule-fur-angewandte-wissenschaften-hrk287-environmental-engineerin-daad9933  _(batch b8-3574bc)_

**Environmental Engineering (BEng)**

- **durationYears**: `3.5` (guidance; source daad) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "The language of instruction is English, ensuring accessibility for international students." — https://www.hof-university.com/studying-at-hof-university/our-degree-programs/environmental-engineering-beng.html
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}` (official; source daad)
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9933/
  - "At Hof University, no tuition fees are charged for our Bachelor's and Master's programs." — https://www.hof-university.com/studying-at-hof-university/preparing-your-stay/how-to-finance-your-studies.html

> Preparer's caveats: Année d'études: 7 semesters = 3.5 years. Les frais de scolarité de 0 EUR reposent sur la page DAAD ("Tuition fees per semester None") et sur la page de financement de l'université ("no tuition fees are charged for our Bachelor's and Master's programs"); il existe un Semesterbeitrag d'environ 130-150 EUR par semestre, non compté comme frais de scolarité. Les dates d'intake (15 avril - 15 juillet) sont annoncées sans année sur les pages; l'année 2026 est reprise de l'en-tête "International Programmes 2026/2027" de la page DAAD et doit être vérifiée. La candidature pour les titulaires d'un diplôme étranger passe d'abord par uni-assist (VPD), puis par le portail Primuss de l'université; le canal retenu est de-uni-assist-vpd car la page dit que le certificat doit être évalué par uni-assist avant l'envoi à l'université. La liste des documents provient de la page "Application and admission" (tous programmes); la page du programme elle-même n'énumère pas de documents. La traduction des documents n'est mentionnée nulle part: translationRequired reste null.

## programs/de-hochschule-heilbronn-technik-wirtschaft-hrk125-environmental-and-proces-daad10371  _(batch b8-3574bc)_

**Environmental and Process Engineering**

- **durationYears**: `3.5` (official; source page-1)
  - "7 Semester : 3.5 years standard period of study" — https://www.hs-heilbronn.de/en/environmental-and-process-engineering?mtm_campaign=daad-international-programmes&mtm_kwd=UP
- **teachingLanguages**: `["en","de"]` (official; source page-1)
  - "Language : Basic Study in English, Main Study in German" — https://www.hs-heilbronn.de/en/environmental-and-process-engineering?mtm_campaign=daad-international-programmes&mtm_kwd=UP
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":"2026-09-28"}]` (official; source daad)
  - "For the winter semester: until 28 September 2026" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10371/
- **documents**: `[{"slug":"university-entrance-qualification","name":{"fr":{"text":"Diplôme d'accès à l'université","status":"draft"},"en":{"text":"University entrance qualification","status":"draft"}},"translationRequired":null},{"slug":"recognition-of-certificates","name":{"fr":{"text":"Reconnaissance des certificats","status":"draft"},"en":{"text":"Recognition of certificates","status":"draft"}},"translationRequired":null},{"slug":"language-skills-proof","name":{"fr":{"text":"Preuve de compétences linguistiques","status":"draft"},"en":{"text":"Proof of language skills","status":"draft"}},"translationRequired":null},{"slug":"cv","name":{"fr":{"text":"CV complet chronologique","status":"draft"},"en":{"text":"Complete CV, chronological","status":"draft"}},"translationRequired":null},{"slug":"study-orientation-test","name":{"fr":{"text":"Preuve de test d'orientation aux études","status":"draft"},"en":{"text":"Proof of study orientation test","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "University entrance qualification (copy)" — https://www.hs-heilbronn.de/en/checklist-for-bachelor-applicants-2f2f62a1ac1a86e6
  - "Recognition of certificates from the Center for International Students, Konstanz or VPD by uni-assist" — https://www.hs-heilbronn.de/en/checklist-for-bachelor-applicants-2f2f62a1ac1a86e6
  - "Proof of language skills (except native speakers)" — https://www.hs-heilbronn.de/en/checklist-for-bachelor-applicants-2f2f62a1ac1a86e6
  - "Complete CV, chronological" — https://www.hs-heilbronn.de/en/checklist-for-bachelor-applicants-2f2f62a1ac1a86e6
  - "Proof of study orientation test online, takes about 10 minutes" — https://www.hs-heilbronn.de/en/checklist-for-bachelor-applicants-2f2f62a1ac1a86e6

> Preparer's caveats: Le programme n'a pas de restrictions d'admission; l'inscription se fait directement via le portail eCampus. La page du programme (hs-heilbronn.de) ne précise pas la voie d'admission pour les candidats internationaux.

## programs/de-hochschule-pforzheim-gestaltung-technik-hrk219-business-administration-daad4659  _(batch b8-3574bc)_

**Business Administration / Digital Business Management (BSc)**

- **durationYears**: `3.5` (official; source daad)
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4659/
- **teachingLanguages**: `["en"]` (official; source daad)
  - "The programme is designed for international and German applicants alike and is taught entirely in English, with selected courses available in German as an option." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4659/
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}` (official; source page-1)
  - "Non-EU/EEA Citizens EUR 1,500 EUR 211 EUR 1,711 Tuition fee based on passport nationality" — https://www.hs-pforzheim.de/bdbm
- **applicationChannel**: `de-university-direct` (official; source page-2)
  - "Foreign and stateless prospective students with a higher education entrance qualification obtained abroad (except EU citizens) can apply directly to the desired degree program via the applicant portal." — https://www.hs-pforzheim.de/en/international/studying_in_pforzheim/regular_degree_students/application_procedure
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"School-leaving certificate","status":"draft"}},"translationRequired":null}]` (official; source page-1)
  - "You must first submit your school leaving certificate for recognition (via International Programs Office or Studienkolleg Konstanz)." — https://www.hs-pforzheim.de/bdbm

> Preparer's caveats: Duplicated tuition evidence on the hs-pforzheim.de/bdbm page says non-EU/EEA citizens pay EUR 1,500 tuition per semester plus EUR 211 administrative fee (total EUR 1,711 per semester). The DAAD page states "Tuition fees per semester ... non-EU countries 1,500 EUR". The programme duration quote says 7 semesters, which equals 3.5 years. The application deadline is for the winter semester (starting end of September or early October); the year is inferred from the target winter semester 2026/27, giving 31 May 2027 — the quote itself does not state the year. For applicationChannel, the university's international admission page says foreign applicants apply directly via the applicant portal; documents may also be sent to the Center for International Students in Konstanz for recognition, but this is not uni-assist, so de-university-direct is used. The documents fact is limited to the one document (school-leaving certificate) explicitly named for non-EU applicants in the quoted sentence; the pages do not state a translation requirement for this programme, so translationRequired is null.

## programs/de-technische-hochschule-mannheim-hrk177-international-engineerin-daad10335  _(batch b8-3574bc)_

**International Engineering (BSc)**

- **durationYears**: `3.5` (official; source page-2) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-2) (unchanged: already in data/)
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}` (official; source page-2) (unchanged: already in data/)
- **documents**: `[{"slug":"cv","name":{"fr":{"text":"CV","status":"draft"},"en":{"text":"CV","status":"draft"}},"translationRequired":null},{"slug":"english-language-certificate","name":{"fr":{"text":"Preuve de compétences suffisantes en anglais","status":"draft"},"en":{"text":"Proof of sufficient English language skills","status":"draft"}},"translationRequired":null},{"slug":"school-leaving-certificate","name":{"fr":{"text":"Certificats / relevés de notes scolaires ou universitaires","status":"draft"},"en":{"text":"School/university certificates / transcripts","status":"draft"}},"translationRequired":null},{"slug":"motivational-letter","name":{"fr":{"text":"Lettre de motivation (une page A4 maximum)","status":"draft"},"en":{"text":"Motivational letter (maximum one A4 page)","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "Required application documents: CV proof of sufficient English language skills (details below) authenticated copies of school/university certificates / transcripts / "Studienkolleg" type T if available motivational letter (maximum one A4 page)" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10335/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si votre diplôme (baccalauréat marocain) donne un accès direct à ce programme ou si des examens/tests supplémentaires sont nécessaires.","status":"draft"},"en":{"text":"Check whether your school qualification (Moroccan Baccalauréat) allows direct access to this programme or whether additional academic experience or tests are required.","status":"draft"}}}`
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Le nombre de places étant limité, les candidats doivent avoir un très bon diplôme de fin d'études secondaires ; aucun seuil de notes précis n'est indiqué.","status":"draft"},"en":{"text":"As the number of places is limited, applicants should have a very good school-leaving certificate; no precise grade threshold is stated.","status":"draft"}}}`

> Preparer's caveats: La page DAAD indique un délai pour tous les pays (15 octobre - 15 novembre), mais la page propre du programme précise que le portail ouvre le 15 octobre et que la date limite est le 15 novembre ; faute d'année explicite pour cette date, l'échéance 2025-11-15 n'a pas été retenue comme fait. Les documents listés proviennent de la page DAAD (page du programme) ; la page propre du programme mentionne aussi des scans PDF sans nommer de document supplémentaire.

## programs/de-technische-hochschule-ulm-hrk260-electrical-engineering-a-daad9157  _(batch b8-3574bc)_

**Electrical Engineering and Information Technology**

- **durationYears**: `3.5` (official; source daad)
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9157/
  - "The Electrical Engineering and Information Technology course lasts seven semesters" — https://www.thu.de/en/Pages/Studiengang_EET.aspx
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "Since the program is taught in English, you must demonstrate sufficient English proficiency." — https://www.thu.de/en/Pages/Studiengang_EET.aspx
  - "Will the program be held completely in English? Yes, except for the classes to learn German." — https://www.thu.de/en/Pages/Studiengang_EET.aspx
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}` (official; source page-2)
  - "Tuition fee for international students €1,500.00 per semester" — https://www.thu.de/en/studies/before-studies/fees-scholarships/contributions-tuition-fees
  - "International students are students who are not citizens of a member state of the European Union or another signatory state to the Agreement on the European Economic Area." — https://www.thu.de/en/studies/before-studies/fees-scholarships/contributions-tuition-fees
- **applicationChannel**: `de-university-direct` (official; source page-3)
  - "Step 1 Register on the THU application portal and submit your application." — https://www.thu.de/en/studies/application-admission/bachelors-programme-application
  - "To the THU application portal" — https://www.thu.de/en/Pages/Studiengang_EET.aspx
- **documents**: `[{"slug":"statement-of-purpose","name":{"fr":{"text":"lettre de motivation","status":"draft"},"en":{"text":"Statement of purpose","status":"draft"}},"translationRequired":null},{"slug":"resume","name":{"fr":{"text":"CV","status":"draft"},"en":{"text":"Resume","status":"draft"}},"translationRequired":null},{"slug":"passport-copy","name":{"fr":{"text":"copie du passeport","status":"draft"},"en":{"text":"Copy of passport","status":"draft"}},"translationRequired":null}]` (official; source page-1)
  - "In addition, you must submit a completed form regarding your German language proficiency, a statement of purpose (explaining your motivation to study Electrical Engineering and Information Technology at THU), your resume, and a copy of your passport." — https://www.thu.de/en/Pages/Studiengang_EET.aspx
  - "If you are unable to upload your school certificate by July 15th, you should submit all other documents in time and submit the certificate as part of the coordinated succession procedure." — https://www.thu.de/en/Pages/Studiengang_EET.aspx

> Preparer's caveats: Teaching language: English; German is a compulsory subject and language modules, but the programme is taught in English (FAQ says completely in English except German classes). Duration: 7 semesters = 3.5 years. Tuition: EUR 1,500 per semester is stated for international students at THU (non-EU/EEA); the DAAD page entry 'non-EU countries 650 EUR' appears under 'second degree' fees and is not used here. Intakes: the programme's own page gives 'Application period 28. April - 15. Juli' (winter semester) — no year stated, so the deadline is emitted without a year; 'Winter semester approx. mid-April - July 15' is the university's restriction for this programme (EET is listed as admission-restricted). Application channel: pages point to the THU application portal (university direct), not uni-assist; recognition of foreign diplomas is via Studienkolleg Konstanz, so de-uni-assist-vpd does not apply. English scores differ between pages (DAAD: TOEFL 79/IELTS 6; THU FAQ: TOEFL 72/IELTS 5.5) — listed as manual check.

## programs/de-technische-hochschule-wildau-hrk272-european-business-manage-daad7665  _(batch b8-3574bc)_

**European Business Management**

- **durationYears**: `3.5` (guidance; source daad) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "Language of Instruction English" — https://en.th-wildau.de/index.php?id=30638
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"semester"}` (official; source page-1)
  - "Fees No tuition fees (the university only charges semester fees each semester)" — https://en.th-wildau.de/index.php?id=30638
- **applicationChannel**: `de-uni-assist` (official; source page-1)
  - "Applicants with foreign education certificates must apply via uni-assist e.V." — https://en.th-wildau.de/index.php?id=30638
- **documents**: `[{"slug":"officially-translated-certificates","name":{"fr":{"text":"Certificats officiellement traduits","status":"draft"},"en":{"text":"Officially translated certificates","status":"draft"}},"translationRequired":true},{"slug":"passport-id-card-copy","name":{"fr":{"text":"Copie du passeport / de la carte d'identité","status":"draft"},"en":{"text":"Copy of passport/ID card","status":"draft"}},"translationRequired":null},{"slug":"cv","name":{"fr":{"text":"CV actuel","status":"draft"},"en":{"text":"Current CV","status":"draft"}},"translationRequired":null},{"slug":"english-language-skills-proof","name":{"fr":{"text":"Preuve de compétences en anglais","status":"draft"},"en":{"text":"Proof of English language skills","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "Required application documents: officially translated certificates copy of passport/ID card with recognisable photo current CV (with complete details up to the date of application) proof of your German language skills at the required level proof of your English language skills at the required level (see current study and examination regulations on the relevant programme pages)" — https://en.th-wildau.de/study/application/degree-programmes/online-application

> Preparer's caveats: Tuition: the programme states there are no tuition fees; the 376.80 EUR semester contribution is a general institution-wide fee, not tuition for this programme. Intake: the pages give the uni-assist deadline range 1 May–15 June; no day-month-year deadline for a specific year is quoted on the programme's own pages, so the year in the deadlines comes from the page's stated application period for winter semester 2026/2027 (deadline table). Application channel: pages say foreign-diploma applicants apply via uni-assist e.V., not via a VPD route and not directly in the TH portal.

## programs/de-technische-universitat-munchen-hrk184-heilbronn-bachelors-in-management-daad5704  _(batch b8-3574bc)_

**Bachelor's in Management & Data Science (BSc)**

- **durationYears**: `3` (official; source page-2) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source programme) (unchanged: already in data/)
- **applicationChannel**: `de-uni-assist-vpd` (official; source page-4)
  - "All international applicants with international university entrance qualifications (e.g. secondary level education qualifications) must also apply via uni-assist (you can have your documents reviewed by uni-assist at any time throughout the year)." — https://www.mgt.tum.de/programs/bachelor-management-data-science/how-to-apply
  - "Please note that the uni-assist application needs to be completed before the end of the application period, however, the document that the uni-assist will provide you with (VPD), can be handed in later, even after the application period has ended." — https://www.mgt.tum.de/programs/bachelor-management-data-science/how-to-apply
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si vous avez besoin d'un certificat APS : cela concerne uniquement les diplômes chinois, vietnamiens ou indiens ; un Baccalauréat marocain n'est pas concerné, mais confirmez-le.","status":"draft"},"en":{"text":"Check whether you need an APS certificate: it applies only to Chinese, Vietnamese or Indian school or university degrees; a Moroccan Baccalauréat is not covered, but confirm this.","status":"draft"}}}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un programme d'admission en deux étapes (notes + éventuel entretien) s'applique : les dates d'entretien et les seuils de notes ne sont pas donnés ici, renseignez-vous auprès de l'université.","status":"draft"},"en":{"text":"A two-stage aptitude assessment (grades plus possible interview) applies: interview dates and grade thresholds are not given here, check with the university.","status":"draft"}}}`
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"L'anglais est la langue d'enseignement mais aucun niveau minimum n'est exigé ; une évaluation se fait par test ou entretien.","status":"draft"},"en":{"text":"English is the language of instruction but no minimum level is required; proficiency is assessed via test or interview.","status":"draft"}}}`
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Des frais de scolarité sont dus par les étudiants de pays hors EEE (sauf dispenses) ; vérifiez le montant et les possibilités de dispense sur la page des frais de TUM.","status":"draft"},"en":{"text":"Tuition fees apply to students from non-EEA countries (subject to waivers); check the amount and waiver options on TUM's fee page.","status":"draft"}}}`

> Preparer's caveats: Evidence pages other than the two programme pages (DAAD and TUM study fees) were used where they directly describe this programme or international applicants. No tuition fee for non-EU students is stated on this programme's pages (both say 'No tuition fees'); the general TUM non-EU fee page (2,000 or 3,000 euros per semester) may not apply, so tuition is left out. The deadline 'July 15' is stated without a year, so no ISO date is given; it applies to the winter semester intake each year. The admission requirement 'Letter of motivation – maximum two A4 pages' is not included as a document because the page's document list is only described by a link.

## programs/nl-fontys-hogeschool-30gb-venlo-industrieel-product-ontw-1001o3309  _(batch b8-3574bc)_

**Industrieel Product Ontwerpen**

- **durationYears**: `4` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["nl","en"]` (official; source programme) (unchanged: already in data/)
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":"2027-05-01"}]` (official; source programme)
  - "1 mei 2027 Meld je uiterlijk 1 mei aan via Studielink." — https://www.fontys.nl/Opleidingen/Industrieel-Product-Ontwerpen-bachelor-voltijd.htm
  - "Startdatum September" — https://www.fontys.nl/Opleidingen/Industrieel-Product-Ontwerpen-bachelor-voltijd.htm
- **applicationChannel**: `nl-studielink` (official; source programme) (unchanged: already in data/)

> Preparer's caveats: tuition: no amount stated for non-EU students for this specific programme; the collegegeld page only says institutional fee applies for non-EEA students and varies per programme; the exact amount must be looked up via the collegegeldmeter, so no tuition fact is given. The 'Taal Nederlands' in the 'In het kort' block conflicts with the body text saying the programme is taught in both Dutch and English; both are listed as teaching languages.

## programs/nl-hogeschool-inholland-27pz-haarlem-informatica-1001o3897  _(batch b8-3574bc)_

**Informatica**

- **durationYears**: `4` (official; source programme)
  - "niveau Bachelor duur 4 jaar locatie Haarlem taal Nederlands" — https://www.inholland.nl/opleidingen/informatica-voltijd/
- **teachingLanguages**: `["nl"]` (official; source programme) (unchanged: already in data/)
- **applicationChannel**: `nl-studielink` (official; source page-1)
  - "Meld je dan via Studielink aan met je DigiD." — https://www.inholland.nl/inschrijven/inschrijven/

> Preparer's caveats: Tuition: the collegegeld pages give an instellingscollegegeld (institutional fee) for voltijd of EUR 10,360 (2026-2027) / EUR 5,833 (Feb 2026) / EUR 9,999 (2025-2026), but this is a general institution-wide figure not stated for this programme and the pages do not state which rate a non-EU student pays for Informatica; left out. Intakes: pages give September 2026 (apply by 1 August 2026, or 1 May 2026 for toelatingsrecht) and February 2027 (apply by 15 January 2027) for Inholland generally, not necessarily for this programme, and no full day-month-year start date is quoted for this programme; left out. Documents: no document list is stated for this programme on the supplied pages.

