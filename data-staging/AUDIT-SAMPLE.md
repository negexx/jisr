# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## institutions/hu-budapest-university-of-technology-and-ec  _(batch b22-3d788c)_

**Budapest University of Technology and Economics**

- **website**: `https://www.bme.hu/en`
- evidence: "available at the Budapest University of Technology and Economics, in partnership with" — https://www.bme.hu/en

## institutions/hu-szechenyi-istvan-university  _(batch b22-3d788c)_

**Széchenyi István University**

- **website**: `https://admissions.sze.hu/`
- evidence: "Institute at Széchenyi István University. A recent Mid-Autumn Festival celebration" — https://admissions.sze.hu/

## institutions/hu-university-of-nyiregyhaza  _(batch b22-3d788c)_

**University of Nyíregyháza**

- **website**: `https://english.nye.hu/`
- evidence: "| University of Nyíregyháza Skip to main content Accessible theme User account menu" — https://english.nye.hu/

## institutions/hu-university-of-public-service  _(batch b22-3d788c)_

**University of Public Service**

- **website**: `https://en.uni-nke.hu/`
- evidence: "UNIVERSITY OF PUBLIC SERVICE webmail neptun Digitális oktatás Intranet HUN" — https://en.uni-nke.hu/

## programs/hu-budapest-metropolitan-university-business-administration-sf472  _(batch b22-3d788c)_

**Business Administration and Managemenet**, Budapest Metropolitan University

- **teachingLanguages**: `["en"]` (official; source programme)
  - "Course language English" — https://www.metubudapest.hu/programs/business-administration-and-management-bsc
- **tuition**: `{"amountMinor":350000,"currency":"EUR","period":"semester"}` (official; source programme)
  - "3500 EUR/semester for non-EU students" — https://www.metubudapest.hu/programs/business-administration-and-management-bsc
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un entretien d'admission en ligne et un test de mathématiques en ligne font partie de la procédure de sélection.","status":"draft"},"en":{"text":"An online admission interview and an online mathematics test are part of the selection process.","status":"draft"}}}`
  - "Entrance examination: All applicants have to participate in an online admission interview." — https://tempus.tpf.hu/studyfinder/index/show/472
  - "Applicants are required to write an online mathematics test as part of the online admission interview." — https://tempus.tpf.hu/studyfinder/index/show/472
- **page**: https://tempus.tpf.hu/studyfinder/index/show/472

## programs/hu-budapest-university-of-economics-and-bus-tourism-and-catering-sf17  _(batch b22-3d788c)_

**Tourism and Catering**, Budapest University of Economics and Business

- **durationYears**: `4` (official; source page-2)
  - "Language of instruction: English Duration of the course / programme: 8 semesters" — https://tempus.tpf.hu/studyfinder/index/show/17
- **teachingLanguages**: `["en"]` (official; source page-2)
  - "Language of instruction: English Duration of the course / programme: 8 semesters" — https://tempus.tpf.hu/studyfinder/index/show/17
  - "The programme is taught at our city centre campus and is also offered full-time in English." — https://uni-bge.hu/en/tourism-and-catering-bsc
- **tuition**: `{"amountMinor":300000,"currency":"EUR","period":"semester"}` (official; source page-3)
  - "Tourism and Catering 8 semesters 690,000 HUF 3,000 EUR" — https://uni-bge.hu/en/tuition-fee
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"Secondary school leaving certificate","status":"draft"}},"translationRequired":null},{"slug":"transcript-of-secondary-school-studies","name":{"fr":{"text":"Relevé de notes des études secondaires","status":"draft"},"en":{"text":"Transcript of secondary school studies","status":"draft"}},"translationRequired":null},{"slug":"motivation-letter","name":{"fr":{"text":"Lettre de motivation","status":"draft"},"en":{"text":"Motivation letter","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "Entry requirements: 1. Secondary school leaving certificate 2. B2 English language knowledge, proved by internationally accepted language examination system (e.g.: IELTS, TOEFL, WAEC, etc.) 3. Transcript of secondary school studies" — https://tempus.tpf.hu/studyfinder/index/show/17
  - "The entry qualification documents are accepted in English. A motivation letter must be added to your application." — https://tempus.tpf.hu/studyfinder/index/show/17
  - "If this is not the case, you will need official translations along with verified copies of the original." — https://tempus.tpf.hu/studyfinder/index/show/17
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":true,"acceptedTests":["ielts","toefl"]}`
  - "B2 English language knowledge, proved by internationally accepted language examination system (e.g.: IELTS, TOEFL, WAEC, etc.)" — https://tempus.tpf.hu/studyfinder/index/show/17
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un entretien oral en ligne fait partie de la sélection : préparez-le avec votre lettre de motivation et vos résultats scolaires.","status":"draft"},"en":{"text":"An online oral interview is part of the selection: prepare for it with your motivation letter and academic results.","status":"draft"}}}`
  - "The entrance examination consists of two components: an assessment of previous academic achievements, language proficiency, and motivation letter, followed by an online interview evaluating professional knowledge, language skills, and intercultural competence." — https://tempus.tpf.hu/studyfinder/index/show/17
- **page**: https://tempus.tpf.hu/studyfinder/index/show/17

> Preparer's caveats: Tuition: the Studyfinder page and the programme page state the semester fee only as '3000 EUR' for non-EU students per semester (no explicit year for that line on the programme page); the '690,000 HUF' figure is the EU-student fee per semester and was therefore not used. Application channel: no supplied page states the application platform or an application form; 'How to apply?' page contains only a heading, so the channel field is a best guess (hu-university-direct) and must be verified by a human. No application deadlines, opening dates or intake months are stated on any supplied page for international applicants. The Studyfinder page lists Morocco among accepted territories, but that is a list of citizenships, not evidence for a document requirement. Entrance examination is Oral and takes place Online.

## programs/hu-budapest-university-of-technology-and-ec-electrical-engineering-sf45  _(batch b22-3d788c)_

**Electrical Engineering**, Budapest University of Technology and Economics

- **durationYears**: `3.5` (official; source programme)
  - "Duration of the course / programme: 7 semesters" — https://tempus.tpf.hu/studyfinder/index/show/45
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/45
- **documents**: `[{"slug":"application-form","name":{"fr":{"text":"Formulaire de candidature","status":"draft"},"en":{"text":"Application form","status":"draft"}},"translationRequired":null},{"slug":"school-reports","name":{"fr":{"text":"Bulletins scolaires du secondaire","status":"draft"},"en":{"text":"Secondary high school reports","status":"draft"}},"translationRequired":null},{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"Secondary high school diploma","status":"draft"}},"translationRequired":null},{"slug":"transcripts-diplomas","name":{"fr":{"text":"Relevés de notes et diplômes","status":"draft"},"en":{"text":"Transcripts and degrees/diplomas","status":"draft"}},"translationRequired":null},{"slug":"english-language-certificate","name":{"fr":{"text":"Attestation de compétence en anglais","status":"draft"},"en":{"text":"Proof of English language proficiency","status":"draft"}},"translationRequired":null},{"slug":"curriculum-vitae","name":{"fr":{"text":"Curriculum vitae","status":"draft"},"en":{"text":"Curriculum vitae","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "application form" — https://www.vik.bme.hu/en/education/admission/
  - "secondary high school reports relevant to your application, with special reference to mathematics, physics and English language" — https://www.vik.bme.hu/en/education/admission/
  - "general certificate of education - G.C.E. or any equivalent secondary high school diploma" — https://www.vik.bme.hu/en/education/admission/
  - "official transcripts, degrees/diplomas of any higher education already completed" — https://www.vik.bme.hu/en/education/admission/
  - "Proof of English language proficiency: TOEFL iBT score of 4.0" — https://www.vik.bme.hu/en/education/admission/
  - "curriculum vitae (autobiography/résumé)" — https://www.vik.bme.hu/en/education/admission/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Le test de positionnement en mathématiques, physique et anglais est obligatoire pour entrer en licence (BSc) à BME VIK.","status":"draft"},"en":{"text":"The placement test in mathematics, physics and English is mandatory to enter a BSc degree program at BME VIK.","status":"draft"}}}`
  - "The placement test is mandatory for all applicants who wish to enter into a BSc degree program at BME VIK." — https://www.vik.bme.hu/en/education/admission/
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Le diplôme d'études secondaires doit être obtenu avec un résultat global d'au moins 70 %.","status":"draft"},"en":{"text":"The secondary school diploma must be completed with an overall result of at least 70%.","status":"draft"}}}`
  - "Completed SECONDARY-school studies with an overall result of min. 70%." — https://tempus.tpf.hu/studyfinder/index/show/45
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Dates limites de candidature : semestre d'automne du 1er avril au 15 mai ; semestre de printemps du 15 octobre au 15 novembre (année non précisée).","status":"draft"},"en":{"text":"Application deadlines: fall semester 1 April – 15 May; spring semester 15 October – 15 November (year not stated).","status":"draft"}}}`
  - "Application period in the fall semester: 1st April – 15th May" — https://www.vik.bme.hu/en/education/admission/
- **page**: https://tempus.tpf.hu/studyfinder/index/show/45

> Preparer's caveats: Page texts give no tuition fee for this programme, so no tuition fact is included. The applicationChannel quote from the VIK admission page is general ("All applications must be submitted on-line") and does not name a platform; treated as direct university application (hu-university-direct), but the Stipendium Hungaricum route is also mentioned for scholarship applicants ("For Stipendium Hungaricum Applicants"). Language proficiency appears as B2/IELTS 5.0/TOEFL iBT 72 on the Studyfinder page; the VIK page adds older TOEFL thresholds (iBT 4.0, PBT 550) and states IELTS 5.0 is recommended for BSc but required for MSc/PhD, so certificate requirements should be verified manually. Duration: 7 semesters (210 credits) = 3.5 years.

## programs/hu-budapest-university-of-technology-and-ec-professional-pilot-sf77  _(batch b22-3d788c)_

**Professional Pilot**, Budapest University of Technology and Economics

- **durationYears**: `3.5` (official; source programme)
  - "Duration of the course / programme: 7 semesters" — https://tempus.tpf.hu/studyfinder/index/show/77
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/77
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme d'études secondaires (baccalauréat) valide est exigé pour le BSc.","status":"draft"},"en":{"text":"An eligible high school degree is required for the BSc.","status":"draft"}}}`
  - "general minimum requirements are an eligible high school degree" — https://tempus.tpf.hu/studyfinder/index/show/77
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"L'admission comprend un examen d'entrée: oui, type oral, en ligne.","status":"draft"},"en":{"text":"Admission includes an entrance examination: yes, oral type, online.","status":"draft"}}}`
  - "Entrance examination: Yes Entrance type: Oral" — https://tempus.tpf.hu/studyfinder/index/show/77
  - "Place of examination: Online" — https://tempus.tpf.hu/studyfinder/index/show/77
- **page**: https://tempus.tpf.hu/studyfinder/index/show/77

> Preparer's caveats: La page ne donne pas de date limite de candidature précise pour les candidats non-UE. Elle renvoie à la page E-admission pour les délais et exigences. Aucun frais de scolarité pour les étudiants auto-financés non-UE n'est indiqué sur la page; les frais peuvent dépendre de l'université ou de la bourse. Le canal de candidature est basé sur la mention de la page E-admission de l'université; il n'y a pas de mention explicite d'une plateforme externe comme Uni-assist.

## programs/hu-corvinus-university-of-budapest-applied-economics-sf83  _(batch b22-3d788c)_

**Applied Economics**, Corvinus University of Budapest

- **durationYears**: `3` (official; source programme)
  - "Duration of the course / programme: 6 semesters" — https://tempus.tpf.hu/studyfinder/index/show/83
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/83
- **tuition**: `{"amountMinor":700000,"currency":"EUR","period":"year"}` (official; source page-2)
  - "Applied Economics 1 980 000 Ft 7 000 €" — https://www.uni-corvinus.hu/post/landing-page/application/fees-and-costs/?lang=en
  - "Corvinus offers affordable tuition fees for self-funded degree seeking international students" — https://www.uni-corvinus.hu/post/landing-page/application/fees-and-costs/?lang=en
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":null,"acceptedTests":["ielts","toefl"]}`
  - "Corvinus accepts the following proof of English language proficiency (minimum equivalent B2 level)" — https://www.uni-corvinus.hu/post/landing-page/application/admissions-requirements/?lang=en
  - "IELTS language certificate, minimum score: 6.0" — https://www.uni-corvinus.hu/post/landing-page/application/admissions-requirements/?lang=en
  - "TOEFL language certificate, minimum score: 65" — https://www.uni-corvinus.hu/post/landing-page/application/admissions-requirements/?lang=en
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un examen d'entrée écrit de mathématiques en ligne est obligatoire ; vous pouvez aussi présenter une qualification acceptée (AP, SAT, ACT, IB, A-level, etc.).","status":"draft"},"en":{"text":"An online written mathematics entrance exam is required; you can also present an accepted qualification (AP, SAT, ACT, IB, A-level, etc.).","status":"draft"}}}`
  - "If you do not or will not have any of these qualifications by the time of enrolment, you can take the Corvinus mathematics entrance exam instead." — https://www.uni-corvinus.hu/post/landing-page/application/admissions-requirements/?lang=en
- **page**: https://tempus.tpf.hu/studyfinder/index/show/83

> Preparer's caveats: The tuition figure (EUR 7,000/year) is quoted from the Corvinus Fees and Costs page, which lists 'non-EEA applicants (EUR/year)'; the Studyfinder page does not state a fee. No application deadline for non-EU applicants is given with a day, month and year on the supplied pages, so the 'intakes' fact is omitted; the application-information page gives general 2027/28 opening (October 2026) and a 1 August document submission date, but these are not stated as the non-EU application deadline. The mathematics requirement is a manual check because the pages give many accepted qualifications and a points threshold set by the Dean.

## programs/hu-eszterhazy-karoly-catholic-university-business-informatics-sf229  _(batch b22-3d788c)_

**Business Informatics**, Eszterházy Károly Catholic University

- **durationYears**: `3.5` (official; source programme)
  - "Duration of the course / programme: 7 semesters" — https://tempus.tpf.hu/studyfinder/index/show/229
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/229
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un entretien en ligne de 20 à 30 minutes et l'évaluation des documents de candidature font partie de la procédure d'admission.","status":"draft"},"en":{"text":"A 20-30 minute online interview and evaluation of the application documents are part of the admission procedure.","status":"draft"}}}`
  - "The admission procedure consists of the following parts: 20-30 minutes long online interview, evaluation of application documents" — https://tempus.tpf.hu/studyfinder/index/show/229
- **page**: https://tempus.tpf.hu/studyfinder/index/show/229

> Preparer's caveats: The page lists an entrance examination but does not give the date, place or documents for an international applicant; no tuition fee for a self-financed non-EU student is stated on the page. The page mentions the Stipendium Hungaricum Scholarship Programme but does not say the self-financed applicant applies through it, so no hu-stipendium-hungaricum channel is given.

## programs/hu-international-business-school-bachelor-of-science-in-c-sf365  _(batch b22-3d788c)_

**Bachelor of Science in Corporate Finance**, International Business School

- **durationYears**: `3` (official; source programme)
  - "Duration of programme 6 semesters 6 semesters" — https://www.ibs-b.hu/en/programmes/bachelors-programmes/bsc-in-corporate-finance/
  - "Duration of the course / programme: 6 semesters" — https://tempus.tpf.hu/studyfinder/index/show/365
- **teachingLanguages**: `["en"]` (official; source page-2)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/365
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"Secondary school leaving certificate","status":"draft"}},"translationRequired":null}]` (official; source programme)
  - "Secondary school leaving certificate AND" — https://www.ibs-b.hu/en/programmes/bachelors-programmes/bsc-in-corporate-finance/
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Justificatif de niveau d'anglais exigé : IELTS 6.0 ou équivalent (par ex. TOEFL 72, GCSE English, Duolingo 105). Vérifiez les documents acceptés.","status":"draft"},"en":{"text":"English proof required: IELTS 6.0 or equivalent (e.g. TOEFL 72, GCSE English, Duolingo 105). Check which documents are accepted.","status":"draft"}}}`
  - "IELTS 6.0 or equivalent*" — https://www.ibs-b.hu/en/programmes/bachelors-programmes/bsc-in-corporate-finance/
- **page**: https://tempus.tpf.hu/studyfinder/index/show/365

> Preparer's caveats: La page des frais donne 4 000 par semestre pour « Bachelor's degree programmes - The University of Buckingham », la structure à laquelle appartient ce BSc. Le lien « Fees and Deadlines » de la page du programme renvoie à une page de frais qui distingue les frais par semestre pour l'Université de Buckingham et mentionne des frais supplémentaires (frais d'inscription uniques pour les non-UE, frais de candidature, etc.). Les dates de début ne sont données que comme « February and September » sans jour ni année dans l'URL du programme ; les deadlines de candidature sur la page des frais concernent des programmes ou des citoyens hongrois et ne précisent pas qu'elles s'appliquent aux candidats non-UE, donc elles ne sont pas incluses. L'inscription se fait via le formulaire en ligne d'IBS / DreamApply (canal « hu-university-direct »).

## programs/hu-obuda-university-industrial-design-engine-sf568  _(batch b22-3d788c)_

**Industrial Design Engineering**, Obuda University

- **durationYears**: `3.5` (official; source programme)
  - "Duration of the course / programme: 7 semesters" — https://tempus.tpf.hu/studyfinder/index/show/568
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/568
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":null,"certificateRequired":true,"acceptedTests":["ielts"]}`
  - "diploma and English language certificate of level IELTS 5.0 at least" — https://tempus.tpf.hu/studyfinder/index/show/568
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un examen d'entrée est requis : épreuve écrite de mathématiques et une matière au choix (biologie, chimie ou informatique), ainsi qu'un entretien oral en anglais.","status":"draft"},"en":{"text":"An entrance examination is required: a written mathematics exam and one chosen subject (biology, chemistry or informatics), plus an online oral English interview.","status":"draft"}}}`
  - "Entrance examination: Yes" — https://tempus.tpf.hu/studyfinder/index/show/568
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Un portfolio de travaux (dessins, peintures) doit être téléversé en un seul fichier (.zip, .pdf, .jpg) ; les envois séparés ne sont pas acceptés.","status":"draft"},"en":{"text":"A portfolio of works (drawings, paintings) must be uploaded as a single file (.zip, .pdf, .jpg); single file uploads are not accepted.","status":"draft"}}}`
  - "The portfolio of works needs to be uploaded in one file (.zip, .pdf, .jpg)" — https://tempus.tpf.hu/studyfinder/index/show/568
- **page**: https://tempus.tpf.hu/studyfinder/index/show/568

> Preparer's caveats: Tuition: the only fee found for this BSc is 2,900 EUR per semester for non-EEA students (university-wide fee table); EU/EEA fee is 2,000 EUR. Intakes left out: the pages give a deadline of '31th May, 2026' on the university how-to-apply page but no quote assigns it to non-EU/foreign-qualification applicants; the 1st August matriculation certificate upload is not a programme application deadline for this applicant. The application channel (university's own online application system) is indicated by 'uploaded into the University’s online application system' and 'online application system of Obuda University', but no single sentence names the route clearly for a self-financed applicant, so applicationChannel was omitted.

## programs/hu-university-of-debrecen-computer-science-enginee-sf128  _(batch b22-3d788c)_

**Computer Science Engineering**, University of Debrecen

- **teachingLanguages**: `["en"]` (official; source programme)
  - "All courses are taught in English; therefore, a B2 level English proficiency is required." — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
- **tuition**: `{"amountMinor":700000,"currency":"USD","period":"year"}` (official; source programme)
  - "The tuition fee for this program is 7,000 USD/Year" — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
- **applicationChannel**: `hu-university-direct` (official; source page-2)
  - "The following documents need to be submitted during the application procedure by all applicants through our online application platform" — https://www.edu.unideb.hu/p/application-and-admission
- **documents**: `[{"slug":"application-form","name":{"fr":{"text":"Formulaire de candidature","status":"draft"},"en":{"text":"Application form","status":"draft"}},"translationRequired":null},{"slug":"high-school-certificate","name":{"fr":{"text":"Certificat de fin d'études secondaires","status":"draft"},"en":{"text":"High school certificate","status":"draft"}},"translationRequired":null}]` (official; source page-2)
  - "Valid, filled-in application form (to be filled online here);" — https://www.edu.unideb.hu/p/application-and-admission
  - "Admission requires a high school certificate;" — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":null,"acceptedTests":["toefl","ielts"]}`
  - "Applicants must have an English proficiency of at least B2 level as the program is fully taught in English." — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
  - "a TOEFL test with a minimum score of 513 (Paper-Based)." — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
  - "an IELTS test with a minimum score of 5.5." — https://www.edu.unideb.hu/p/computer-science-engineering-bsc
- **page**: https://tempus.tpf.hu/studyfinder/index/show/128

> Preparer's caveats: Tuition is stated in USD on the programme page; no EUR or HUF amount for this programme appears. The B2 English requirement: the programme page says 'Please note, that you are not strictly required to have a language exam certificate', but a separate application page requires 'a standardized, at least upper-intermediate (B2) level language certificate, obtained at a proctored exam', so certificateRequired is left null. The 15th June deadline is a general self-financed deadline without a year and is not explicitly labelled for non-EU/international applicants on that page.

## programs/hu-university-of-miskolc-mechanical-engineering-sf462  _(batch b22-3d788c)_

**Mechanical Engineering**, University of Miskolc

- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/462
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Diplôme d'études secondaires exigé, avec connaissances au niveau secondaire en mathématiques et en physique. Vérifier ces prérequis dans votre dossier.","status":"draft"},"en":{"text":"Secondary school leaving certificate required, with secondary school level knowledge of mathematics and physics. Check these prerequisites in your dossier.","status":"draft"}}}`
  - "Secondary school leaving certificate, secondary school level knowledge of mathematics and physics" — https://tempus.tpf.hu/studyfinder/index/show/462
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un examen d'entrée est requis : lettre de motivation et entretien Skype de 15 minutes. Préparez ces éléments.","status":"draft"},"en":{"text":"An entrance examination is required: motivation letter and a 15-minute Skype interview. Prepare these elements.","status":"draft"}}}`
  - "Entrance examination: Yes" — https://tempus.tpf.hu/studyfinder/index/show/462
  - "After checking out the documentation handed in, we are asking for complementary information about the professional and motivational background in letter. In the second part of the entrance examination a 15-minute-long skype-interview takes place with two opponens who decide together on the final score and the admission of the applicants." — https://tempus.tpf.hu/studyfinder/index/show/462
- **page**: https://tempus.tpf.hu/studyfinder/index/show/462

> Preparer's caveats: Les pages ne donnent ni frais de scolarité pour un étudiant auto-financé hors UE/EEE, ni dates de candidature, ni liste de documents, ni plateforme de candidature. Le programme est disponible dans le cadre de la bourse Stipendium Hungaricum, mais cela ne constitue pas un canal de candidature auto-financée et ne signifie pas des frais de 0 pour le programme. Durée : le programme indique 7 semestres = 3.5 ans, mais aucune formulation ne l'exprime directement en années ; la durée n'a donc pas été extraite.

## programs/hu-university-of-nyiregyhaza-mechanical-engineering-sf529  _(batch b22-3d788c)_

**Mechanical Engineering**, University of Nyíregyháza

- **durationYears**: `3.5` (official; source programme)
  - "Duration of the course / programme: 7 semesters" — https://tempus.tpf.hu/studyfinder/index/show/529
- **teachingLanguages**: `["en"]` (official; source programme)
  - "Language of instruction: English" — https://tempus.tpf.hu/studyfinder/index/show/529
- **tuition**: `{"amountMinor":245000,"currency":"EUR","period":"semester"}` (official; source page-2)
  - "Mechanical Engineering BSc 7 2450 EUR *** 1800 EUR ***" — https://english.nye.hu/en/node/319
  - "Tuition fee / semester * for non-EU applicants **" — https://english.nye.hu/en/node/319
- **applicationChannel**: `hu-university-direct` (official; source page-3)
  - "Welcome to the online application portal of the University of Nyíregyháza." — https://applicationform.nye.hu/
  - "We will accept the application only if the received amount is 100 EUR." — https://english.nye.hu/en/node/30
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":null,"acceptedTests":["ielts"]}`
  - "English language skills at upper intermediate level or higher (at level CEFR B2 or IELTS 5.5) – Having a language certificate is not a compulsory requirement." — https://tempus.tpf.hu/studyfinder/index/show/529
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"L'admission se fait sur entretien oral en ligne (Microsoft Teams) avec évaluation sur 100 points ; il faut au moins 60 points pour réussir l'examen d'entrée.","status":"draft"},"en":{"text":"Admission is based on an online oral interview (Microsoft Teams) evaluated out of 100 points; at least 60 points are required to pass the entrance exam.","status":"draft"}}}`
  - "The application procedure is based on an evaluation system of 100 points: 50 points are given for motivation, professional knowledge and educational background, and the other 50 points for language proficiency according to the online interview." — https://tempus.tpf.hu/studyfinder/index/show/529
  - "The entrance exam is successful, if the applicant have at least 60 points." — https://tempus.tpf.hu/studyfinder/index/show/529
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Des frais de candidature de 100 EUR non remboursables doivent être payés et reçus pour que l'examen d'entrée soit possible.","status":"draft"},"en":{"text":"A non-refundable application fee of 100 EUR must be paid and received for the entrance exam to be possible.","status":"draft"}}}`
  - "Without the arrival of the 100 EUR application fee no entrance exam is possible." — https://english.nye.hu/en/node/30
- **page**: https://tempus.tpf.hu/studyfinder/index/show/529

> Preparer's caveats: Tuition extraite de la page des frais de scolarité 2027/2028 de l'université (EUR 2450 par semestre pour les candidats non-UE), qui liste explicitement « Mechanical Engineering BSc 7 ». Aucun document d'identité ou de diplôme spécifique au programme au-delà de la liste générale des candidats auto-financés. La date limite d'admission 2027 (30 juin 2026 / décembre 2026) n'a pas été retenue car elle concerne la session 2026/2027 et non une date 2027 explicite pour le programme.

