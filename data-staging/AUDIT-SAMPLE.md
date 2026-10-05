# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/it-bologna-bologna-economics-politics-and-social-sciences-l33  _(batch b29-025e5b)_

**Economics, Politics and Social Sciences**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Bologna;Economica, Giuridica e Sociale;Economico;Laurea;L-33;Scienze economiche;Economics, Politics and Social Sciences;Bologna;BOLOGNA;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **requirement req-1**: `{"kind":"prior_study_years_min","years":12}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez que votre baccalauréat marocain (12 ans de scolarité) est reconnu idoine et permet l'accès à un cursus analogue en Italie; contactez l'International Desk en cas de doute.","status":"draft"},"en":{"text":"Check that your Moroccan Baccalauréat (12 years of schooling) is recognised as suitable and grants access to an analogous programme in Italy; contact the International Desk if in doubt.","status":"draft"}}}`
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Préparez le diplôme original traduit avec confirmation d'authenticité et la documentation sur la valeur du titre; faites la préinscription et demandez un visa d'études.","status":"draft"},"en":{"text":"Prepare the original diploma translated with confirmation of authenticity and the documentation on the value of the qualification; submit the pre-enrolment application and apply for a study visa.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-bologna-rimini-economics-of-tourism-and-cities-l33  _(batch b29-025e5b)_

**Economics of Tourism and Cities**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Bologna;Economica, Giuridica e Sociale;Economico;Laurea;L-33;Scienze economiche;Economics of Tourism and Cities;Rimini;RIMINI;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-brescia-brescia-business-and-economics-l18  _(batch b29-025e5b)_

**Business and Economics**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Brescia;Economica, Giuridica e Sociale;Economico;Laurea;L-18;Scienze dell'economia e della gestione aziendale;Business and Economics;Brescia;BRESCIA;accesso libero;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **documents**: `[{"slug":"declaration-of-value","name":{"fr":{"text":"Déclaration de valeur","status":"draft"},"en":{"text":"Declaration of value","status":"draft"}},"translationRequired":null},{"slug":"foreign-qualification","name":{"fr":{"text":"Diplôme étranger","status":"draft"},"en":{"text":"Foreign qualification","status":"draft"}},"translationRequired":null},{"slug":"certificate-of-comparability","name":{"fr":{"text":"Certificat de comparabilité","status":"draft"},"en":{"text":"Certificate of comparability","status":"draft"}},"translationRequired":null}]` (official; source programme) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":null,"acceptedTests":[]}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifiez les conditions d'admission et les éventuelles exigences supplémentaires (OFA) pour les étudiants titulaires d'un diplôme étranger.","status":"draft"},"en":{"text":"Check the admission conditions and any additional educational requirements (OFAs) for students with a foreign diploma.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-cassino-cassino-economics-with-data-science-l33  _(batch b29-025e5b)_

**Economics with data science**

- **durationYears**: `3` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Cassino;Economica, Giuridica e Sociale;Economico;Laurea;L-33;Scienze economiche;Economics with data science;Frosinone;CASSINO;accesso libero;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **documents**: `[{"slug":"high-school-transcript","name":{"fr":{"text":"Relevé de notes du lycée","status":"draft"},"en":{"text":"High school transcript","status":"draft"}},"translationRequired":null},{"slug":"curriculum-vitae","name":{"fr":{"text":"Curriculum vitae","status":"draft"},"en":{"text":"Curriculum vitae","status":"draft"}},"translationRequired":null},{"slug":"motivation-letter","name":{"fr":{"text":"Lettre de motivation","status":"draft"},"en":{"text":"Motivation letter","status":"draft"}},"translationRequired":null},{"slug":"certificate-of-proficiency-in-english","name":{"fr":{"text":"Certificat de compétence en anglais","status":"draft"},"en":{"text":"Certificate of proficiency in English","status":"draft"}},"translationRequired":null},{"slug":"passport-or-identity-card","name":{"fr":{"text":"Passeport ou carte d'identité en cours de validité","status":"draft"},"en":{"text":"Current (valid) passport or identity card","status":"draft"}},"translationRequired":null}]` (official; source page-2) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Note minimale de 70% au lycée, avec une note de mathématiques d'au moins 70%. Un diplôme de fin d'études secondaires obtenu depuis plus de 5 ans n'est pas accepté.","status":"draft"},"en":{"text":"Overall high school grade point average minimum 70%, with a math grade of at least 70%. A high school diploma older than 5 years is not accepted.","status":"draft"}}}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"L'inscription à l'année universitaire 2026/2027 est limitée aux étudiants nés entre 2001 et 2008; il faut avoir 18 ans au plus tard le 31 août 2026.","status":"draft"},"en":{"text":"Enrollment in the 2026/2027 academic program is limited to students born between 2001 and 2008; applicants must be at least 18 years old by August 31st, 2026.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-marche-ancona-digital-economics-and-business-l18  _(batch b29-025e5b)_

**Digital Economics and Business**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Marche;Economica, Giuridica e Sociale;Economico;Laurea;L-18;Scienze dell'economia e della gestione aziendale;DIGITAL ECONOMICS AND BUSINESS;Ancona;ANCONA;accesso libero;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **documents**: `[{"slug":"school-leaving-certificate","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"School-leaving certificate","status":"draft"}},"translationRequired":null}]` (official; source page-3) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"prior_study_years_min","years":12}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifier la mendicité du diplôme étranger et la procédure de pré-inscription sur Universitaly, ainsi que les tests de vérification des connaissances de la Faculté d'Économie.","status":"draft"},"en":{"text":"Check the eligibility of the foreign diploma and the pre-enrolment procedure on Universitaly, as well as the Faculty of Economics knowledge verification tests.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-milano-bocconi-milano-international-economics-and-finance-l33  _(batch b29-025e5b)_

**International Economics and Finance**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Milano Bocconi;Economica, Giuridica e Sociale;Economico;Laurea;L-33;Scienze economiche;International Economics and Finance;Milano;MILANO;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-milano-bocconi-milano-international-economics-and-management-l18  _(batch b29-025e5b)_

**International Economics and Management**

- **durationYears**: `3` (official; source page-2) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Milano Bocconi;Economica, Giuridica e Sociale;Economico;Laurea;L-18;Scienze dell'economia e della gestione aziendale;International Economics and Management;Milano;MILANO;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Vérifier sur la page d'admission du programme les conditions exactes pour les candidats internationaux (diplôme étranger, sélection, tests).","status":"draft"},"en":{"text":"Check the programme's admission page for the exact conditions for international applicants (foreign diploma, selection, tests).","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-roma-la-sapienza-roma-applied-computer-science-and-artificial-l31  _(batch b29-025e5b)_

**Applied Computer Science and Artificial Intelligence**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Roma La Sapienza;STEM;Informatica e Tecnologie ICT;Laurea;L-31;Scienze e tecnologie informatiche;Applied Computer Science and Artificial Intelligence;Roma;ROMA;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **documents**: `[{"slug":"passport","name":{"fr":{"text":"Passeport en cours de validité","status":"draft"},"en":{"text":"Valid passport","status":"draft"}},"translationRequired":null},{"slug":"study-visa","name":{"fr":{"text":"Visa d'études","status":"draft"},"en":{"text":"Study Visa","status":"draft"}},"translationRequired":null},{"slug":"high-school-diploma","name":{"fr":{"text":"Diplôme de fin d'études secondaires","status":"draft"},"en":{"text":"High School Diploma","status":"draft"}},"translationRequired":true}]` (official; source page-2) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"prior_study_years_min","years":12}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-roma-tor-vergata-roma-engineering-sciences-l9  _(batch b29-025e5b)_

**Engineering Sciences**

- **durationYears**: `3` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Roma Tor Vergata;STEM;Ingegneria industriale e dell'informazione;Laurea;L-9;Ingegneria industriale;Engineering Sciences;Roma;ROMA;accesso libero;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"prior_study_years_min","years":12}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Une preuve de connaissances obligatoire est prévue pour l'admission ; elle ne bloque pas l'inscription.","status":"draft"},"en":{"text":"A compulsory knowledge assessment test is required for admission; it does not prevent enrollment.","status":"draft"}}}`
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Préinscription obligatoire sur Universitaly avant le 31 juillet pour les candidats non-UE résidant à l'étranger.","status":"draft"},"en":{"text":"Mandatory pre-enrollment on Universitaly by July 31 for non-EU applicants living abroad.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

## programs/it-siena-siena-economics-and-management-l18  _(batch b29-025e5b)_

**Economics and Management**

- **teachingLanguages**: `["en"]` (official; source page-1)
  - "2025;Siena;Economica, Giuridica e Sociale;Economico;Laurea;L-18;Scienze dell'economia e della gestione aziendale;Economics and Management;Siena;SIENA;locale;Convenzionale;Inglese" — https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2/resource/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Un test d'accès obligatoire mais non sélectif est prévu; il sert à vérifier la préparation de base et peut entraîner des obligations formatives supplémentaires à remplir durant la première année.","status":"draft"},"en":{"text":"A compulsory but non-selective entrance test is required; it verifies basic preparation and may lead to additional formative obligations to be fulfilled in the first year.","status":"draft"}}}`

> Preparer's caveats: Teaching language from the MUR offer file (Italian ministry, open data, 2025/26 academic year): the course is listed as "Inglese".

