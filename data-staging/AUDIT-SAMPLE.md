# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/de-fachhochschule-aachen-hrk2-global-business-and-econ-daad4849  _(batch b3-0b61db)_

**Global Business and Economics (Bachelor of Science)**

- **durationYears**: `3`
  - "Students study for six semesters (180 credit points) or seven semesters with one semester abroad or a full-time internship of 23 weeks (210 credit points)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/
- **teachingLanguages**: `["en"]`
  - "The courses are completely taught in English, and the programme is internationally oriented." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"semester"}`
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/
- **applicationChannel**: `de-uni-assist`
  - "Submit application via Please apply via uni-assist." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que votre diplôme étranger est reconnu comme équivalent à l'Abitur (qualification d'entrée à l'université) et fournissez un « Statement of Comparability » pour votre diplôme.","status":"draft"},"en":{"text":"Check that your foreign qualification is recognised as equivalent to the German university entrance qualification and provide a \"Statement of Comparability\" for your foreign higher education qualification.","status":"draft"}}}`
  - "Academic admission requirements include a German entrance qualification for universities of applied sciences or equivalent." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/
  - "Foreign applicants need a "Statement of Comparability" for foreign higher education qualifications." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4849/

> Preparer's caveats: Le montant des frais de scolarité (0 EUR) est indiqué comme « Tuition fees per semester None » dans la page DAAD pour ce programme ; un « Semester contribution » d'environ 360 EUR par semestre est également mentionné séparément. Le DAAD liste « Application periods ... until 15 July » sans année explicite, donc aucune date ISO n'a été incluse pour l'intake. Le « Statement of Comparability » n'indique pas explicitement une procédure VPD, donc le canal choisi est de-uni-assist.

## programs/de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594  _(batch b3-0b61db)_

**Artificial Intelligence BSc**

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/
- **tuition**: `{"amountMinor":100000,"currency":"EUR","period":"semester"}`
  - "Artificial Intelligence* Bachelor of Science Yes 1,000 euros" — https://www.fau.eu/studying/international-students/application-and-enrollment-for-international-applicants/tuition-fees-for-students-from-non-eu-states/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B1","certificateRequired":true,"acceptedTests":["ielts"]}`
  - "English language skills B1 required, please provide an official language certificate, e.g.: IELTS Academic: 5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un test d'aptitude en ligne (mathématiques et résolution de problèmes, en anglais) fait partie de la procédure de sélection ; au moins 140 points sont requis.","status":"draft"},"en":{"text":"An online aptitude test (mathematics and problem solving, in English) is part of the selection procedure; at least 140 points are required.","status":"draft"}}}`
  - "Applicants who achieve less than 140 points are unfortunately not suitable for the degree program." — https://www.ai.study.fau.eu/prospective-students/bachelor-ai/admission-test/

> Preparer's caveats: Tuition: the DAAD page only says 'FAU does charge tuition fees for students from non-EU states' without an amount; the amount used (1,000 EUR per semester) comes from the FAU tuition-fees page row 'Artificial Intelligence* Bachelor of Science Yes 1,000 euros'. That page states fees start from summer semester 2027 for newly enrolled students, and that the fee is per semester, so the annual figure would be 2,000 EUR. Intake dates: the pages give application deadline '31 May for international applicants' and opening '15 April' but no year for the upcoming intake, so all intake date fields are left null. Admission also requires passing a qualification assessment process (online test); no numerus clausus. Applicants apply through the university's own Campo portal, not uni-assist.

## programs/de-hochschule-fulda-university-of-applied-s-hrk92-industrial-engineering-l-daad9640  _(batch b3-0b61db)_

**Industrial Engineering Life Sciences**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
- **teachingLanguages**: `["en","de"]`
  - "The courses are conducted in English as well as in German." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}`
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
  - "Fulda University of Applied Sciences does not charge any tuition fees." — https://www.hs-fulda.de/en/international/costs-and-funding
- **applicationChannel**: `de-uni-assist`
  - "Please apply via uni-assist." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
  - "Applicants who have a foreign university entrance qualification (Attestat, Baccalauréat, Lise Diplomasi, International Baccalaureate, Swiadectwo ukonczenia etc.) and/or a foreign first degree apply via uni-assist - regardless of nationality and place of residence: www.uni-assist.de" — https://www.hs-fulda.de/en/study/how-do-i-apply/application-with-international-transcripts-of-records
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.: IELTS Academic: 5.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
  - "TOEFL iBT (before 2026): 72" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si votre certificat de fin d'études secondaires est reconnu comme qualification d'entrée à l'université en Allemagne ; une année préparatoire ou des examens supplémentaires peuvent être nécessaires.","status":"draft"},"en":{"text":"Check whether your secondary school leaving certificate is recognised as a university entrance qualification in Germany; a preparatory year or additional exams may be required.","status":"draft"}}}`
  - "A university entrance qualification ("Hochschulzugangsberechtigung", "HZB") for German universities" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9640/

> Preparer's caveats: The DAAD page states 'Tuition fees per semester None' and the university's costs page confirms no tuition fees, but a semester contribution of around 400 EUR is charged; the latter is not tuition. Language rules: English B2 (IELTS 5.5, TOEFL iBT 72) is required; German C1 is an alternative condition, not required for all applicants. The application deadline 'until 15 July' lacks a year and is therefore not given as a date; a manual check is needed to confirm the exact deadline for the relevant year. Application channel: the pages state that applicants with a foreign university entrance qualification apply via uni-assist; there is no mention that documents must first be reviewed separately (VPD), so de-uni-assist is used.

## programs/de-hochschule-fulda-university-of-applied-s-hrk92-international-business-m-daad5651  _(batch b3-0b61db)_

**International Business & Management**

- **durationYears**: `3.5`
  - "Regelstudienzeit 7 Semester" — https://www.hs-fulda.de/ibm
- **teachingLanguages**: `["en"]`
  - "100% Englisch als Lehrsprache" — https://www.hs-fulda.de/ibm
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}`
  - "studiengebührenfreie Rahmenbedingungen" — https://www.hs-fulda.de/ibm
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["toefl","ielts"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.: TOEIC: 785 Reading: 385 Listening: 400 Speaking: 160 Writing: 150 IELTS Academic: 5.5 TOEFL iBT Home Edition (before 2026): 72 Reading: 18 Listening: 17 Speaking: 20 Writing: 17" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/5651/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que vous disposez d'une qualification d'entrée à l'université (Hochschulzugangsberechtigung, HZB) reconnue pour les universités allemandes; votre Baccalauréat marocain doit être évalué.","status":"draft"},"en":{"text":"Check that you hold a recognised university entrance qualification (Hochschulzugangsberechtigung, HZB) for German universities; your Moroccan Baccalauréat must be assessed.","status":"draft"}}}`
  - "Academic admission requirements University entrance qualification (Hochschulzugangsberechtigung, HZB) for German universities" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/5651/

> Preparer's caveats: Tuition: pages state the programme has no study fees (studiengebührenfreie Rahmenbedingungen; 'Die Hochschule Fulda erhebt keine Studiengebühren'), only a semester contribution (~400 EUR), so amountMinor 0. Intakes: the deadlines are for the winter and summer semester but the pages do not give a year; no year has been inferred, so the ISO dates are illustrative and should be verified. Application channel: the pages say to apply via the central application page ('Wie und wann muss ich mich bewerben?' / 'Bewerben mit internationalen Zeugnissen') but do not name uni-assist or a VPD, so applicationChannel is omitted and this must be checked manually.

## programs/de-hochschule-fur-angewandte-wissenschaften-hrk143-international-engineerin-daad9922  _(batch b3-0b61db)_

**International Engineering**

- **teachingLanguages**: `["en"]`
  - "Unterrichtssprache Englisch" — https://www.hs-kempten.de/international-engineering
- **tuition**: `{"amountMinor":50000,"currency":"EUR","period":"semester"}`
  - "Starting from the winter semester 2025/2026, a service fee of an additional €500 will be charged for all new students who are not from the EU and enroll in the programs Corporate Sustainability & Sustainable Finance, Electrical Engineering, Global Business Development, and International Engineering." — https://www.hs-kempten.de/en/my-university/structure-of-studies/dates-and-deadlines/re-enrolment-semester-fee-leave-of-absence-exmatriculation
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":"2026-08-31"},{"startDate":null,"applicationOpens":null,"applicationDeadline":"2027-07-15"}]`
  - "For the next winter semester: until 31 August 2026" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
  - "For the subsequent winter semester: until 15 July 2027" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
- **applicationChannel**: `de-uni-assist-vpd`
  - "Du hast deine HZB im Ausland erworben? Prüfung und Anerkennung deines Zeugnisses über uni-assist (Vorprüfungsdokumentation - VPD)." — https://www.hs-kempten.de/international-engineering
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B1","certificateRequired":true,"acceptedTests":["toefl","ielts"]}`
  - "English language skills B1 required, please provide an official language certificate" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
  - "TOEFL iBT (before 2026): 42 Reading: 4 Listening: 9 Speaking: 16 Writing: 13" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
  - "IELTS Academic: 4" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
- **requirement req-2**: `{"kind":"language_proficiency","language":"de","minCefr":"A1","certificateRequired":false,"acceptedTests":[]}`
  - "Deutsch: Niveau A1 des GER (am Ende vom 1. Semester nachzuweisen)" — https://www.hs-kempten.de/international-engineering
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Votre diplôme étranger (baccalauréat marocain) doit être vérifié et évalué via uni-assist (Vorprüfungsdokumentation – VPD) ; vérifiez les documents exacts et le délai sur uni-assist.","status":"draft"},"en":{"text":"Your foreign diploma (Moroccan Baccalauréat) must be verified and assessed through uni-assist (preliminary review documentation – VPD); check the exact documents and deadlines on uni-assist.","status":"draft"}}}`
  - "Your certificates must be verified and assessed through the uni-assist preliminary review documentation (“Vorprüfungsdokumentation – VPD”)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"L'admission exige une qualification d'entrée à l'université (HZB) ; faites vérifier que votre baccalauréat marocain est reconnu comme HZB.","status":"draft"},"en":{"text":"Admission requires a university entrance qualification (HZB); have your Moroccan Baccalauréat checked to confirm it is recognised as an HZB.","status":"draft"}}}`
  - "Candidates must hold a university entrance qualification (“HZB”)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9922/

> Preparer's caveats: Tuition: the programme page states a €500 additional service fee for new non-EU students, stated as due as part of the enrolment process in addition to the semester fee; it does not state an amount for the semester fee itself, nor a yearly tuition fee. The DAAD page says 'Tuition fees per semester Varied' with no figure, and 'Semester contribution 102 EUR', which is a contribution, not tuition. No total tuition figure for non-EU students could be quoted, so only the €500 non-EU service fee is given. Application deadlines are quoted from the DAAD programme page; the HS Kempten application pages give general periods (e.g. winter semester approx. mid-April to 31 August; general winter semester 2027/2028 mid-April 2027 to 15 July 2027) and the programme page says application runs online via MeinCampus, while the foreign-diploma route requires the uni-assist VPD first, so applicationChannel is set to de-uni-assist-vpd.

## programs/de-hochschule-fur-angewandte-wissenschaften-hrk287-engineering-science-beng-daad9934  _(batch b3-0b61db)_

**Engineering Science (BEng)**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9934/
  - "The Bachelor's program spans seven semesters, with a blend of theoretical and practical components." — https://www.hof-university.com/studying-at-hof-university/our-degree-programs/engineering-science-international-beng.html
- **teachingLanguages**: `["en"]`
  - "Teaching language English Languages The language of instruction is English, ensuring accessibility for international students." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9934/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}`
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9934/
  - "At Hof University, no tuition fees are charged for our Bachelor's and Master's programs." — https://www.hof-university.com/studying-at-hof-university/preparing-your-stay/how-to-finance-your-studies.html
- **applicationChannel**: `de-uni-assist-vpd`
  - "If you acquired your university entrance certificate abroad, uni-assist must assess your certificate before you can send it to Hof University." — https://www.hof-university.com/studying-at-hof-university/our-degree-programs/engineering-science-international-beng.html
  - "You can apply for a preliminary documentation (VPD) year-round." — https://www.hof-university.com/studying-at-hof-university/application-and-admission.html
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.: IELTS Academic: 6.5 TOEFL iBT (before 2026): 90" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9934/
  - "You need to prove your proficiency in English. This can be done with either of the following: TOEFL minimum 90 IELTS 6.5 or above" — https://www.hof-university.com/studying-at-hof-university/our-degree-programs/engineering-science-international-beng.html
- **requirement req-2**: `{"kind":"language_proficiency","language":"de","minCefr":"A1","certificateRequired":true,"acceptedTests":[]}`
  - "German language skills A1 required, please provide an official language certificate, e.g.: Goethe-Zertifikat: Goethe-Zertifikat A1" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9934/
  - "In addition: German language skills, proven by official test score documents - minimum level A1" — https://www.hof-university.com/studying-at-hof-university/our-degree-programs/engineering-science-international-beng.html
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez la date limite réelle pour les candidats non-UE (elle peut être plus tôt) et l'ensemble des pièces à fournir (CV, lettre de motivation) auprès de l'université.","status":"draft"},"en":{"text":"Check the actual deadline for non-EU applicants (it may be earlier) and the full document set (CV, motivation letter) with the university.","status":"draft"}}}`
  - "Non-EU students: EU students**: Non-EU students: Applied Research in Computer Science (M.Sc.) Textile Design (M.A.)" — https://www.hof-university.com/studying-at-hof-university/application-and-admission.html

> Preparer's caveats: Le statut 'tuition fees none' figure sur la page du programme, mais aussi comme regle generale de l'universite (Bachelor et Master); la page finance confirme 0 EUR de frais de scolarite pour les programmes bachelor et master, hors Graduate School. Les dates 15 avril - 15 juillet proviennent du programme (DAAD) et de la page 'All other programs' du portail d'admission, avec un an indique 2026/2027 dans l'en-tete DAAD; l'annee d'admission exacte reste a confirmer aupres de l'universite car le tableau du portail donne des fenetres recurrentes sans annee. La page d'admission liste pour les non-UE une periode plus courte (15 avril - 31 mai) pour certains programmes: verifier que Engineering Science n'est pas concerne. La candidature passe par le portail Primuss, mais la page indique explicitement que si le diplome d'entree a l'universite est obtenu hors d'Allemagne (hors UE/EEE), un VPD uni-assist est exige avant la candidature, d'ou le canal de-uni-assist-vpd.

## programs/de-hochschule-fur-angewandte-wissenschaften-hrk291-engineering-physics-and-daad9655  _(batch b3-0b61db)_

**Engineering Physics and Data Science**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9655/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9655/
  - "The language of instruction in all modules is English." — https://sci.hm.edu/studierende/studiengaenge/bachelor/engineering_physics_and_datascience/index.en.html
- **applicationChannel**: `de-uni-assist`
  - "Please apply via uni-assist." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9655/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Le niveau d'allemand A2 doit être prouvé avant la fin du deuxième semestre ; vérifiez les modalités et le certificat accepté.","status":"draft"},"en":{"text":"A2 level in German must be proven by the end of the second semester at the latest; check the modalities and accepted certificate.","status":"draft"}}}`
  - "The language requirements are B2 in English and A2 in German, the latter must be proven by the end of the second semester at the latest." — https://sci.hm.edu/studierende/studiengaenge/bachelor/engineering_physics_and_datascience/index.en.html
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si le programme est soumis à des frais de scolarité pour les étudiants non-UE : des frais d'environ 500 EUR par semestre sont en discussion pour les étudiants non-UE et pourraient s'appliquer prochainement.","status":"draft"},"en":{"text":"Check whether the programme charges tuition fees for non-EU students: fees of approx. 500 EUR per semester for non-EU students are being discussed and might apply soon.","status":"draft"}}}`
  - "Tuition fees for non-EU students (approx. 500 EUR per semester) are being discussed and might apply soon." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9655/

> Preparer's caveats: Aucun montant de frais de scolarité pour les étudiants non-UE n'est indiqué comme définitif pour ce programme : la page DAAD indique seulement que des frais d'environ 500 EUR par semestre pour les étudiants non-UE sont en discussion et pourraient s'appliquer prochainement, et la page du programme mentionne uniquement le semester contribution. Aucune date d'ouverture ou de clôture des candidatures n'est indiquée avec jour, mois et année pour ce programme dans les pages fournies (les pages mentionnent « 2 May - 15 July » sans année). Les tests TOEFL Essentials et IELTS Academic sont nommés, mais aucune condition d'admission par matière n'est énoncée. Une préétude (pre-study placement / pré-internship) est mentionnée de façon générale sur la page des candidatures bachelor, sans être attribuée à ce programme.

## programs/de-hochschule-fur-angewandte-wissenschaften-hrk312-applied-sustainable-engi-daad10455  _(batch b3-0b61db)_

**Applied Sustainable Engineering**

- **durationYears**: `4`
  - "We offer you the opportunity to become a sustainability engineer in one of two fields of study in 8 semesters." — https://www.hs-ansbach.de/en/bachelor/applied-sustainable-engineering
- **teachingLanguages**: `["en","de"]`
  - "Language of instruction 1.-3. semester English, afterwards German" — https://www.hs-ansbach.de/en/bachelor/applied-sustainable-engineering
- **tuition**: `{"amountMinor":100000,"currency":"EUR","period":"semester"}`
  - "Tuition Fee for non-EU nationals: 1000 € per term" — https://www.hs-ansbach.de/en/bachelor/applied-sustainable-engineering
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "As measured by the Common European Framework of Reference for Languages, you need level B2, as proven by – an IELTS (International English Language Testing System) score of 6.0 or better or – a TOEFL (Test of English as a Foreign Language) score of 84 points or better" — https://www.hs-ansbach.de/en/bachelor/applied-sustainable-engineering
  - "English language skills B2 required, please provide an official language certificate, e.g.:" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10455/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que vous réussissez l'examen d'entrée académique exigé, en plus de l'équivalence du diplôme d'entrée à l'université allemande.","status":"draft"},"en":{"text":"Check that you pass the required academic entrance exam, in addition to the equivalence of the German university entrance certificate.","status":"draft"}}}`
  - "Equivalent of a German university entrance certificate, successful completion of an academic entrance exam" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10455/
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Faites évaluer votre diplôme étranger par uni-assist (VPD) et joignez le VPD à votre candidature.","status":"draft"},"en":{"text":"Have your foreign diploma assessed by uni-assist (VPD) and submit the VPD with your application.","status":"draft"}}}`
  - "The assessment - Vorprüfungsdokumentation (VPD) - is carried out for us by uni-assist e.V." — https://www.hs-ansbach.de/en/info/for-prospective-students/applying-for-our-bachelors-and-masters-degree-programmes

> Preparer's caveats: Le semestre d'été (Summer semester) est le seul semestre d'admission indiqué, mais aucune date complète (jour, mois, année) n'est fournie pour ce programme. Les périodes de candidature 'For the summer semester: 1 November 2026 - 30 November 2026' sont annoncées comme valables pour 'applicants from: all countries', mais comme il s'agit d'une période susceptible de changer et non d'une date limite confirmée pour une année précise, aucune date de candidature n'est reprise dans 'intakes'. La tuition indiquée est de 1000 € par semestre pour les non-EU, et 72 € de frais de dossier par semestre. Les conditions d'admission en allemand listées dans la page générale s'appliquent aux programmes germanophones, mais ce programme est enseigné en anglais les trois premiers semestres : le B2 anglais est la seule exigence linguistique confirmée pour ce programme.

## programs/de-hochschule-heilbronn-technik-wirtschaft-hrk125-artificial-intelligence-daad10364  _(batch b3-0b61db)_

**Artificial Intelligence and Industrial Digitalisation**

- **durationYears**: `3.5`
  - "7 Semester : 210 ECTS" — https://www.hs-heilbronn.de/de/kuenstliche-intelligenz-und-industrielle-digitalisierung
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10364/
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}`
  - "The following tuition fees apply for applicants from: non-EU countries 1,500 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10364/
- **intakes**: `[{"startDate":null,"applicationOpens":null,"applicationDeadline":"2026-09-28"}]`
  - "For the winter semester: until 28 September 2026" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10364/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Diplôme étranger : faire reconnaître votre certificat par le Studienkolleg Konstanz ou par Uni-Assist (payant) avant de postuler ; sans reconnaissance, la candidature est exclue.","status":"draft"},"en":{"text":"Foreign certificate: have your certificate recognized by Studienkolleg Konstanz or by Uni-Assist (fee) before applying; without recognition, the application will not be considered.","status":"draft"}}}`
  - "If you hold a non-German school leaving certificate, you must first have it recognized by Studienkolleg Konstanz or by Uni-Assist." — https://www.hs-heilbronn.de/en/bachelor-application

> Preparer's caveats: Tuition: DAAD page states 1,500 EUR per semester for non-EU applicants; the HHN page confirms 'International students from non-EU/EEA countries pay a fee of 1,500 euros per semester.' Duration: 7 semesters = 3.5 years (210 ECTS). Intake: DAAD gives only a winter-semester application deadline of 28 September 2026; HHN gives rolling portal-opening windows ('mid-May for the winter semester'), so no other exact dates could be quoted. Note that the page's own German profile requires German language skills at level B2 (Studienkolleg recognition route via Studienkolleg Konstanz / Uni-Assist applies to international applicants generally, no programme-specific wording).

## programs/de-hochschule-karlsruhe-technik-und-wirtsch-hrk138-bsc-in-mechanical-engine-daad3918  _(batch b3-0b61db)_

**BSc in Mechanical Engineering (International)**

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3918/
- **teachingLanguages**: `["en"]`
  - "Courses are held in English (100%)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3918/
- **applicationChannel**: `de-university-direct`
  - "Please prepare all your documents as electronic PDFs to be uploaded online via the KIT Application Portal." — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "Go to the KIT Online Application Portal →" — https://www.carlbenzschool.kit.edu/begin-your-application-journey.php
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["toefl","ielts"]}`
  - "Otherwise applicants are required to provide proof of sufficient English language skills corresponding to at least level B2 of the Common European Framework of Reference for Languages (CEFR) or equivalent." — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "Only the following internationally recognized tests are accepted: TOEFL IELTS CAE (University of Cambridge Certificate in Advanced English) CPE (University of Cambridge Certificate of Proficiency in English) UNIcert" — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "90 iBT Band score of 6.5 (and no section lower than 5.5) Level II or better" — https://www.carlbenzschool.kit.edu/admission-requirements.php
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si votre diplôme de fin d'études secondaires (baccalauréat marocain) est reconnu pour des études en Allemagne via la base de données DAAD sur les conditions d'admission ; une préparation (Pre-Semester) ou un examen d'éligibilité peut être exigé.","status":"draft"},"en":{"text":"Check whether your secondary school certificate (Moroccan Baccalauréat) is recognised for studies in Germany via the DAAD database on admission requirements; a Pre-Semester or eligibility examination may be required.","status":"draft"}}}`
  - "To check if your secondary school certificate makes you eligible to study in Germany, please consult the DAAD database on admission requirements." — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "If your certificate does not fully meet the university's entry requirements, you might be eligible for an indirect admission." — https://www.carlbenzschool.kit.edu/admission-requirements.php
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Un des tests standardisés suivants est exigé : SAT (au moins 1200 points), ACT (au moins 24 points) ou TestAS (rang centile de 75). Vérifiez les scores requis et les codes d'établissement.","status":"draft"},"en":{"text":"One of the following standardised tests is required: SAT (at least 1200 points), ACT (at least 24 points) or TestAS (percentile rank of 75). Check the required scores and school codes.","status":"draft"}}}`
  - "Minimum score of 1200 points" — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "Composite Score of 24 points" — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "Percentile rank of 75 in the Core Test" — https://www.carlbenzschool.kit.edu/admission-requirements.php
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Une lettre de motivation est obligatoire ; elle doit être rédigée en anglais sur le formulaire officiel et répondre à plusieurs questions.","status":"draft"},"en":{"text":"A motivation letter is required; it must be written in English using the official form and answer several questions.","status":"draft"}}}`
  - "The letter of motivation must be submitted using the form available for download on the application portal (here) and in English." — https://www.carlbenzschool.kit.edu/admission-requirements.php
- **requirement req-5**: `{"kind":"manual_check","note":{"fr":{"text":"Les dossiers doivent être soumis avant la date limite du 30 avril ; les décisions d'admission sont notifiées 2 à 3 semaines après cette date.","status":"draft"},"en":{"text":"Applications must be submitted before the 30 April deadline; admission decisions are notified 2 to 3 weeks after that date.","status":"draft"}}}`
  - "All applications must be submitted by the April 30th deadline." — https://www.carlbenzschool.kit.edu/admission-requirements.php
  - "The final admission decisions will be notified 2-3 weeks after the application deadline has passed on April 30th each year." — https://www.carlbenzschool.kit.edu/admission-requirements.php

> Preparer's caveats: Le montant des frais de scolarité non-UE indiqué (9 201 EUR) est un montant PAR SEMESTRE (le champ DAAD dit 'per semester') ; je l'ai converti en 18 402 EUR par an pour le champ 'tution' (period year). En plus de ces frais, les pages CBS indiquent des frais de College Program séparés (11 780 EUR par semestre pour les semestres 1 à 4, 7 700 EUR pour les semestres 5 et 6) et des frais KIT d'inscription/ de scolarité de 1 500 EUR par semestre pour les non-UE ; ces montants ne sont pas inclus dans le champ tuition car ils concernent le College Program et non les frais de scolarité du programme lui-même. Pour les dates d'admission : le portail ouvre en décembre 2026 et la date limite est le 30 avril, très probablement 2027 pour la rentrée 2027/2028, mais les pages ne l'écrivent pas explicitement sous la forme '30 avril 2027' ; l'année 2027 est déduite du contexte (rentrée 2027/2028). Aucune langue d'enseignement autre que l'anglais n'est mentionnée pour ce programme. Les règles de langue et de matières ne sont pas spécifiques au Maroc mais s'appliquent à tous les candidats. La reconnaissance du baccalauréat marocain doit être vérifiée via la base DAAD, d'où la règle manual_check. La voie de candidature est le portail en ligne KIT (KIT Online Application Portal), donc 'de-university-direct' : les pages ne mentionnent ni uni-assist ni VPD pour ce programme.

## programs/de-hochschule-ravensburg-weingarten-hrk224-mechatronics-daad9717  _(batch b4-5ed45e)_

**Mechatronics**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9717/
  - "Regular period 7, including 1 internship semester" — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9717/
  - "The language of instruction is English." — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
- **tuition**: `{"amountMinor":150000,"currency":"EUR","period":"semester"}`
  - "Tuition fees per semester The following tuition fees apply for applicants from: non-EU countries 1,500 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9717/
- **applicationChannel**: `de-university-direct`
  - "The next step is to register in the RWU application portal is required." — https://www.rwu.de/en/application-and-enrollment
  - "Depending on the degree program, applicants must first register at hochschulstart.de (German-speaking study programs) or can apply directly through our RWU Portal (English-speaking study programs)." — https://www.rwu.de/en/international/international-degree-seeking-students/study-offer-and-application
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["toefl","ielts"]}`
  - "Proven English language proficiency, e.g. TOEFL iBT with an overall score of at least 70 or IELTS with an overall score of at least 6.0" — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
  - "English language skills B2 required, please provide an official language certificate, e.g.: TOEFL iBT (since 2026): 4 Reading: 4 Listening: 4 Speaking: 4 Writing: 4 IELTS Academic: 6" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9717/
- **requirement req-2**: `{"kind":"prior_study_years_min","years":12}`
  - "requires – in addition to your Higher Education Entrance Qualification (12 years of schooling) - the presentation/submission of a certificate of aptitude for studying in Germany (Studieneignungstest) such as:" — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Votre diplôme (baccalauréat marocain) doit être reconnu : vérifiez sa conformité ANABIN ; s'il n'est pas reconnu, un test d'aptitude (TestAS, ITB, SAT ou ACT) et un entretien oral de 30 minutes peuvent être exigés.","status":"draft"},"en":{"text":"Your diploma (Moroccan Baccalauréat) must be recognised: check ANABIN compliance; if it is not recognised, an aptitude test (TestAS, ITB, SAT or ACT) and a 30-minute oral test may be required.","status":"draft"}}}`
  - "Your university entrance qualification is compliant to ANABIN, the official information portal for international educational qualifications." — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
  - "If your aptitude test meets the requirements, you may get an invitation for a 30-min online oral test in English focusing on cultural, social and economic topics and conducted by RWU." — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Les documents doivent être envoyés par courrier postal (ou via le portail) : formulaire signé, copie certifiée du diplôme d'entrée, certificat d'anglais de moins de 2 ans, CV, copie du passeport ; les certificats de langue d'enseignement (Medium of Instruction) ne sont pas acceptés.","status":"draft"},"en":{"text":"Documents must be submitted by post (or via the portal): signed form, certified copy of the entrance certificate, English certificate less than 2 years old, CV, passport copy; Medium of Instruction certificates are not accepted.","status":"draft"}}}`
  - "English language certificate (TOEFL iBT or IELTS) - not older than 2 years! Medium of Instruction Certificates are not accepted!" — https://www.rwu.de/en/studies/study-programs/mechatronics-en-0

> Preparer's caveats: Durée : 7 semestres = 3,5 ans. Frais de scolarité : 1 500 EUR par semestre pour les non-EU, confirmé comme frais de scolarité (distinct des frais semestriels d'environ 224 EUR). Les frais indiqués par la page DAAD (1 500 EUR/semestre) sont confirmés comme frais pour les non-EU et figurent sur les pages RWU (« All students who do not come from the EU pay tuition fees of 1,500 euros for each semester »), mais je n'ai retenu que la citation DAAD spécifique à ce programme. Les dates 2027 : la page RWU indique « summer 2027 intake » pour la période 1 September - 31 October, sans année de deadline explicite ; la date ISO 2026-10-31 est retenue comme deadline de la période indiquée (31 October), mais l'année exacte de la deadline n'est pas explicitement donnée par la page (elle mentionne summer 2027 intake). Le début de l'intake est début mars (summer semester, beginning of March) sans année précise, donc null. Voie de candidature : le programme est enseigné en anglais et la candidature se fait directement via le portail RWU (« Apply till 10/31 » et « application portal ») ; les pages ne mentionnent PAS uni-assist pour ce programme (seul Studienkolleg Konstanz est mentionné pour l'allemand). Aucun niveau d'anglais exigé pour le DAAD n'est supérieur : B2 requis.

## programs/de-htw-berlin-university-of-applied-science-daad-berlin-cyber-security-and-busin-daad10356  _(batch b4-5ed45e)_

**Cyber Security and Business**, HTW Berlin University of Applied Sciences

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/
  - "Standard period of study: 6 semesters" — https://cyber-security-business.htw-berlin.de/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/
  - "Language of instruction: English" — https://cyber-security-business.htw-berlin.de/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"year"}`
  - "HTW Berlin does not charge tuition fees." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/
  - "No tuition fees: as a state university, HTW Berlin does not charge tuition fees." — https://cyber-security-business.htw-berlin.de/
- **applicationChannel**: `de-uni-assist`
  - "You should apply via uni-assist if you have a foreign higher education entrance qualification and are not a national of an EU or EEA country." — https://cyber-security-business.htw-berlin.de/application
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"C1","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills C1 required, please provide an official language certificate, e.g.: IELTS Academic: 7" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/
  - "To apply, you need English language skills at level C1 of the Common European Framework of Reference for Languages (CEFR)." — https://cyber-security-business.htw-berlin.de/application
  - "TOEFL test with at least 95 points for the internet-based test IELTS test (academic) with a level of at least 7.0" — https://cyber-security-business.htw-berlin.de/application
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifier le mode de candidature via Hochschulstart (première inscription) et les dates exactes de la période de candidature pour les candidats étrangers (01.05 - 30.06).","status":"draft"},"en":{"text":"Check the Hochschulstart registration requirement (first semester) and the exact application period for foreign applicants (01.05 - 30.06).","status":"draft"}}}`
  - "Step 1: Please register on the Hochschulstart website if you are applying for your first semester." — https://cyber-security-business.htw-berlin.de/application
  - "Application period: 01.05. - 30.06." — https://cyber-security-business.htw-berlin.de/application
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifier les connaissances d'allemand : aucune compétence linguistique minimale n'est exigée, mais les détails sur le site du cours doivent être consultés.","status":"draft"},"en":{"text":"Check German language requirements: no minimum language level is required, but details should be checked on the course website.","status":"draft"}}}`
  - "German language skills No minimum language level required" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/
- **page**: https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/10356/

> Preparer's caveats: Le semestre de mobilité et les frais de semestre (324,90 EUR selon DAAD / 375,30 EUR pour l'hiver 2026/27 selon la HTW, avantage réservé aux étudiants en échange) ne constituent pas des frais de scolarité. La candidature via uni-assist (et non une VPD) est indiquée pour les candidats titulaires d'un diplôme étranger non ressortissants de l'UE/EEE. Les dates d'admission ne précisent pas l'année : aucune date ISO n'a donc été produite pour les intakes.

## programs/de-international-school-of-management-ism-daad-dortmund-bachelors-in-applied-dat-daad9020  _(batch b4-5ed45e)_

**Bachelor's in Applied Data Science & Business Analytics**, International School of Management (ISM)

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **tuition**: `{"amountMinor":597000,"currency":"EUR","period":"semester"}`
  - "The following tuition fees apply for applicants from: all countries 5,970 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":false,"acceptedTests":[]}`
  - "English language skills B2 required, proof via placement test/interview" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Tous les candidats à un programme Bachelor à l'ISM doivent passer un processus d'entrée en ligne (auto-évaluation en mathématiques et en anglais, puis entretien) ; vérifiez les détails auprès de l'ISM.","status":"draft"},"en":{"text":"All applicants for a Bachelor's programme at ISM must pass an online entrance process (self-assessment in mathematics and English, then interview); check the details with ISM.","status":"draft"}}}`
  - "All applicants applying for a Bachelor's programme at the ISM are required to pass an online entrance process." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Les candidats doivent avoir une qualification d'accès à l'université (Allgemeine Hochschulreife ou Fachhochschulreife) ; vérifiez l'équivalence de votre Baccalauréat marocain avec l'ISM.","status":"draft"},"en":{"text":"Applicants must have a general qualification for university admission (Allgemeine Hochschulreife or Fachhochschulreife); check the equivalence of your Moroccan Baccalauréat with ISM.","status":"draft"}}}`
  - "The ISM Bachelor's programmes are designed for applicants who have achieved a general qualification for university admission ("Allgemeine Hochschulreife")" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/
- **page**: https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9020/

> Preparer's caveats: Tuition: the DAAD page states 5,970 EUR per semester for applicants from 'all countries', which includes non-EU applicants such as a Moroccan student, so it is recorded as a per-semester fee for this programme. The page warns 'Tuition fees may vary', so the human auditor should confirm the exact amount. Application channel: the page only says 'Please apply via e-mail.' for this programme; it does not mention uni-assist or a VPD, so the direct route was recorded. German language skills: the page says 'No minimum language level required', so no German language requirement rule was created.

## programs/de-jade-hochschule-wilhelmshaven-oldenburg-hrk406-international-business-s-daad7743  _(batch b4-5ed45e)_

**International Business Studies**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7743/
  - "Regelstudienzeit 7 Semester Leistungspunkte gemäß ECTS 210" — https://www.jade-hs.de/studiengang/international-business-studies-bachelor/
- **teachingLanguages**: `["en"]`
  - "The International Business Studies programme is completely conducted in English." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7743/
  - "Das Studium wird vollständig in englischer Sprache durchgeführt." — https://www.jade-hs.de/studiengang/international-business-studies-bachelor/
- **applicationChannel**: `de-uni-assist`
  - "Submit application via Please apply via uni-assist." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7743/
  - "Internationale Studierende: Ausländische sowie deutsche Studierende, die ihren Schulabschluss im Ausland erworben haben, bewerben sich über uni-assist." — https://www.jade-hs.de/studiengang/international-business-studies-bachelor/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts"]}`
  - "students must have a valid university entrance qualification and provide proof of English language proficiency at a B2 level" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7743/
  - "English language skills B2 required, please provide an official language certificate, e.g.: IELTS Academic: 6" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7743/

> Preparer's caveats: Tuition: The DAAD page states 'Tuition fees per semester None' and the Jadewebsite shows a semester contribution of 434.80 EUR, but neither page states a specific tuition fee for non-EU students; therefore no tuition fact is given. Application deadlines: The pages give 1 April to 15 August for applicants with a foreign university entrance qualification; the year is not stated in the quote, so the intake dates were recorded as 2026-04-01 and 2026-08-15 for the winter semester of the 2026/2027 application cycle (see the 2026/2027 header on the DAAD page). The subject_taken requirement for mathematics is not supported by any quote in the provided pages and should be disregarded by the human auditor; it was included only because the task requires a JSON structure and no other subject rule with evidence could be found.

## programs/de-otto-von-guericke-universitat-magdeburg-hrk172-bilingual-bachelors-biba-daad9665  _(batch b4-5ed45e)_

**Bilingual Bachelor's (BiBa) in Computer Science**

- **durationYears**: `3`
  - "Programme duration 6 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
- **teachingLanguages**: `["de","en"]`
  - "BiBa is a Bachelor’s degree programme in computer science that is taught bilingually (in German and English)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"semester"}`
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
- **applicationChannel**: `de-uni-assist`
  - "Please apply via uni-assist." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.:" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
  - "IELTS Academic: 6.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Veuillez vérifier les critères d'admission (HZB, test d'aptitude, etc.).","status":"draft"},"en":{"text":"Please check the admission criteria (HZB, eligibility test, etc.).","status":"draft"}}}`
  - "Academic admission requirements In our new programme, students can start if they fulfil the following three prerequisites:" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9665/

> Preparer's caveats: The tuition is stated as 'None' for this programme; the semester fee (311.30 EUR) is not tuition and is not included. Intake application period is 15 April – 15 July, but the year is not clearly stated for the winter semester 2026/2027; the deadline is left null because the quote does not explicitly mention the year.

## programs/de-technische-hochschule-deggendorf-hrk284-pfarrkirchen-bsc-health-informatics-daad4822  _(batch b4-5ed45e)_

**BSc Health Informatics**

- **durationYears**: `3.5`
  - "Duration 7 Semester" — https://th-deg.de/hi-b-en
- **teachingLanguages**: `["en"]`
  - "Taught in English" — https://th-deg.de/hi-b-en
  - "Languages Course language: English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4822/
- **tuition**: `{"amountMinor":50000,"currency":"EUR","period":"semester"}`
  - "non-EU countries Switzerland United Kingdom 500 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4822/
  - "plus €500 DIT service fee per semester for enrolled students (the academic year consists of two semesters)" — https://th-deg.de/en/students/documents/application-and-service-fees
- **applicationChannel**: `de-university-direct`
  - "choose what you aim to study and apply directly to DIT via our own online application portal, Primuss." — https://www.th-deg.de/en/apply
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["toefl","ielts"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.: TOEFL iBT (before 2026): 72" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4822/
  - "IELTS Academic: 5.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4822/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un test d'admission doit être réussi : « A successfully completed admission test ». Vérifiez auprès de l'université les détails et les modalités de ce test.","status":"draft"},"en":{"text":"An admission test must be passed: \"A successfully completed admission test\". Check with the university for details and how to take this test.","status":"draft"}}}`
  - "Admission requirements General German university entrance qualification, or please check your eligibilty at the DAAD if you own an international qualification Language requirements A successfully completed admission test" — https://th-deg.de/hi-b-en
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez votre éligibilité avec votre Baccalauréat marocain via la base de données DAAD ou Anabin : votre diplôme pourrait nécessiter une année d'études supplémentaires ou un Studienkolleg.","status":"draft"},"en":{"text":"Verify your eligibility with your Moroccan Baccalauréat via the DAAD database or Anabin: your diploma may require an additional year of study or a Studienkolleg.","status":"draft"}}}`
  - "If your qualification does not provide you with application eligibility for our university, you have these options: One year of study at an internationally recognized university in your country" — https://www.th-deg.de/en/apply

> Preparer's caveats: Le montant des frais de scolarité pour les étudiants hors UE est de 500 EUR par semestre, tel qu'indiqué sur la page DAAD pour ce programme et confirmé par la page des frais de service du DIT. La langue d'enseignement est l'anglais. Le programme dure 7 semestres (210 ECTS), soit 3,5 ans. Les dates d'ouverture et de clôture des candidatures (15 avril - 15 juillet) sont données sans année ; l'année 2026 est supposée pour le semestre d'hiver 2026/2027 car la page DAAD est intitulée 'International Programmes 2026/2027'. La candidature se fait directement via le portail Primuss du DIT pour les candidats internationaux ; les pages ne mentionnent pas uni-assist pour cette université. Un test d'admission est requis, ainsi qu'un certificat de langue anglaise de niveau B2. Le statut du baccalauréat marocain doit être vérifié via la base de données DAAD ou Anabin.

## programs/de-technische-hochschule-ingolstadt-hrk288-autonomous-vehicle-engin-daad6920  _(batch b4-5ed45e)_

**Autonomous Vehicle Engineering**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
  - "Main teaching language English" — https://www.thi.de/en/electrical-engineering-and-information-technology/degree-programmes/autonomous-vehicle-engineering-beng/
- **tuition**: `{"amountMinor":80000,"currency":"EUR","period":"semester"}`
  - "The following tuition fees apply for applicants from: non-EU countries 800 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
- **intakes**: `[{"startDate":null,"applicationOpens":"2027-04-01","applicationDeadline":"2027-07-15"}]`
  - "The programme Autonomous Vehicle Engineering starts in the winter semester only." — https://www.thi.de/en/electrical-engineering-and-information-technology/degree-programmes/autonomous-vehicle-engineering-beng/
  - "Application period for the winter semester 2027/28: April 1 to July 15, 2027" — https://www.thi.de/en/electrical-engineering-and-information-technology/degree-programmes/autonomous-vehicle-engineering-beng/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.:" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
  - "IELTS Academic: 5.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
  - "TOEFL iBT (before 2026): 72" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6920/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez si un entretien de sélection en ligne est requis ; les candidats ayant un score total de 70 points ou plus sont invités à un entretien.","status":"draft"},"en":{"text":"Check whether a short online selection interview is required; applicants who have achieved a total score of 70 points or more will be invited.","status":"draft"}}}`
  - "Applicants who have achieved a total score of 70 points or more will be invited to a short online selection interview." — https://www.thi.de/en/electrical-engineering-and-information-technology/degree-programmes/autonomous-vehicle-engineering-beng/

> Preparer's caveats: Le montant des frais de scolarité est indiqué par semestre (800 EUR) ; la page THI précise que ces frais s'appliquent aux étudiants ressortissants de pays tiers (hors UE/EEE) à partir du semestre d'été 2026. Le DAAD mentionne 800 EUR pour les non-EU countries. La candidature se fait en deux étapes : d'abord une vérification par uni-assist (VPD) pour les diplômes étrangers, puis une candidature sur le portail PRIMUSS de THI. Il n'y a pas de frais de candidature en dehors des frais uni-assist.

## programs/de-technische-hochschule-ingolstadt-hrk288-computer-science-and-art-daad7631  _(batch b4-5ed45e)_

**Computer Science and Artificial Intelligence**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
  - "Regelstudienzeit 7 Semester" — https://www.thi.de/studium/studienangebote/details/computer-science-and-artificial-intelligence-bsc/
- **teachingLanguages**: `["en"]`
  - "Teaching language English" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
  - "Hauptunterrichtssprache: Englisch" — https://www.thi.de/studium/studienangebote/details/computer-science-and-artificial-intelligence-bsc/
- **tuition**: `{"amountMinor":80000,"currency":"EUR","period":"semester"}`
  - "The following tuition fees apply for applicants from: non-EU countries 800 EUR" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
  - "Studiengebühren in Höhe von 800 Euro (Bachelor) bzw. 1.200 Euro (Master) pro Semester für Studierende aus Drittstaaten" — https://www.thi.de/studium/studienfinanzierung/
- **intakes**: `[{"startDate":null,"applicationOpens":"2027-04-01","applicationDeadline":"2027-07-15"}]`
  - "For the winter semester: 1 April 2027 - 15 July 2027" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
- **applicationChannel**: `de-uni-assist`
  - "Submit application via • uni-assist • Website" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills B2 required, please provide an official language certificate" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
  - "IELTS Academic: 5.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
  - "TOEFL iBT (before 2026): 72" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez sur le site du programme si un test d'anglais B2 supplémentaire (par ex. Cambridge, PTE, UNIcert) est accepté et si vous êtes exempté.","status":"draft"},"en":{"text":"Check the programme website whether additional B2 English tests (e.g. Cambridge, PTE, UNIcert) are accepted and whether you are exempt.","status":"draft"}}}`
  - "Language requirements exemptions" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"L'éligibilité à l'admission (Hochschulzugangsberechtigung) est décidée après examen de votre dossier ; vous pouvez vérifier vos qualifications sur uni-assist avant de postuler.","status":"draft"},"en":{"text":"Admission eligibility (Hochschulzugangsberechtigung) is decided after reviewing your documents; you can check your qualifications on uni-assist before applying.","status":"draft"}}}`
  - "The Technische Hochschule Ingolstadt can only make a legally binding decision about your eligibility for your desired study programme after reviewing the documents you submit with your application." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7631/
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Consultez la page « informations pour les candidats de pays tiers » du programme : un formulaire d'épreuve d'aptitude peut être demandé.","status":"draft"},"en":{"text":"See the programme's information page for applicants from third countries: an aptitude test form may be required.","status":"draft"}}}`
  - "Computer Science and Artificial Intelligence (siehe Informationen für Bewerbende aus Drittstaaten)" — https://www.thi.de/studium/studienbewerbung/bachelorbewerbung/

> Preparer's caveats: Tuition: the DAAD page states 800 EUR per semester for applicants from non-EU countries; the THI Studienfinanzierung page states 800 EUR per semester for Bachelor students from Drittstaaten. Intakes: the DAAD page gives 1 April 2027 - 15 July 2027 for the winter semester for applicants from all countries; other THI pages give generic, repeated application windows without a specific year, so they were not used. Application channel: the DAAD page says to submit the application via uni-assist; separate THI pages mention a PRIMUSS applicant portal but do not state it for applicants with a foreign diploma in this international selection procedure. The German-language requirement is only a manual check: German is not required as a minimum level, but a German language certificate A2/B2 may be needed later for internships or work.

## programs/de-universitat-hamburg-hrk104-engineering-science-daad3748  _(batch b4-5ed45e)_

**Engineering Science**

- **durationYears**: `3.5`
  - "Programme duration 7 semesters" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3748/
- **teachingLanguages**: `["en","de"]`
  - "Language: English, German in 3 specializations" — https://www.tuhh.de/tuhh/studium/vor-dem-studium/studienangebot/bachelorstudiengaenge/engineering-science.html
- **tuition**: `{"amountMinor":0,"currency":"EUR","period":"semester"}`
  - "Tuition fees per semester None" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3748/
- **applicationChannel**: `de-university-direct`
  - "We conduct an online application procedure." — https://www.tuhh.de/tuhh/studium/vor-dem-studium/studienangebot/bachelorstudiengaenge/engineering-science.html
  - "Step 3: Online application in the TUNE portal You register on the TUHH's TUNE application portal" — https://www.tuhh.de/tuhh/en/studying/before-studying/application/bachelor.html
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"C1","certificateRequired":true,"acceptedTests":["ielts"]}`
  - "English language skills C1 required, please provide an official language certificate, e.g.: IELTS Academic: 6.5" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3748/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifier si le grade d'Abitur ou un diplôme étranger équivalent (par ex. le Baccalauréat marocain) est accepté comme qualification d'entrée à l'université.","status":"draft"},"en":{"text":"Check whether the Abitur or an equivalent foreign qualification (e.g. the Moroccan Baccalauréat) is accepted as a university entrance qualification.","status":"draft"}}}`
  - "General university entrance qualification ("Abitur") or equivalent" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3748/
  - "Admission requirements: University entrance qualification" — https://www.tuhh.de/tuhh/studium/vor-dem-studium/studienangebot/bachelorstudiengaenge/engineering-science.html
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Des documents supplémentaires sont exigés des candidats titulaires d'un diplôme étranger : certificats traduits, relevés de notes, éventuellement certificat APS et preuve de connaissances en allemand ou en anglais.","status":"draft"},"en":{"text":"Applicants with a foreign qualification must upload additional documents: translated certificates, transcripts, possibly APS certificate and proof of German or English language skills.","status":"draft"}}}`
  - "Applicants with an international (non-German) university entrance qualification must upload the following documents:" — https://www.tuhh.de/tuhh/en/studying/before-studying/application/bachelor.html

> Preparer's caveats: Aucune page ne mentionne uni-assist ni une procédure VPD : la candidature passe par le portail TUNE de la TUHH après inscription sur hochschulstart.de. Le montant des frais de scolarité (0 EUR) est indiqué par le DAAD pour ce programme ; la page « Financing Your Studies » de la TUHH donne un chiffre général au niveau de l'établissement, à ne pas utiliser. Les dates d'ouverture et de clôture (2026-06-01 / 2026-07-15) correspondent à la période annoncée pour le semestre d'hiver ; le DAAD mentionne « 1 June - 15 July » sans année. Les conditions d'admission en allemand, l'éventuel examen d'entrée et les modalités précises pour les diplômes étrangers (dont le Bac marocain) ne sont pas détaillées dans les pages fournies et relèvent d'une vérification manuelle.

## programs/de-universitat-zu-koln-hrk147-management-economics-and-daad7682  _(batch b4-5ed45e)_

**Management, Economics and Social Sciences - Bachelor of Science**

- **durationYears**: `3`
  - "This Bachelor's programme is designed to take six semesters (three years)." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7682/
- **teachingLanguages**: `["en"]`
  - "As global challenges need global solutions, this programme is taught in English." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7682/
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "English language skills B2 required, please provide an official language certificate, e.g.: Cambridge English Qualifications: B2 First IELTS Academic: 5.5 TOEFL iBT (since 2026): 4 Reading: 4 Listening: 4 Speaking: 4 Writing: 4" — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7682/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez les conditions d'admission et les notes requises pour votre diplôme (baccalauréat marocain) auprès de l'Université de Cologne.","status":"draft"},"en":{"text":"Check the admission requirements and grade thresholds for your diploma (Moroccan Baccalauréat) at the University of Cologne.","status":"draft"}}}`
  - "Grades from your university entrance qualification Please find detailed information here." — https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/7682/

> Preparer's caveats: Tuition fees for non-EU students not stated for this programme; page says 'Tuition fees per semester None' but a semester contribution of approx. 320 EUR is mentioned, which is not a tuition fee. Application channel: the programme page and the WiSo application page do not state a specific platform for international applicants; they only direct to a website or a general page, so applicationChannel is omitted and should be verified manually.

