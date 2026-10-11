// GENERATED FILE - do not edit by hand.
// Produced by scripts/data/demo-fixture.ts from the shipped records in data/.
//
// The hero demo is illustrative. Exactly two things depart from the shipped facts:
//   1. requirements.coverage is set to "complete" on every demo programme. Every real record ships
//      coverage "partial", which forces an unknown coverage reason and makes a satisfied match
//      unreachable; the flag is changed, no fact is. The demo card labels the snapshot
//      "illustrative".
//   2. Each destination needs a decisive route. A real route that is already "direct" and
//      condition-free is reused verbatim (ma-bac-to-fr). Where the real route is "foundation"
//      (ma-bac-to-de, which short-circuits matching to "check"), a curated direct, condition-free
//      demo route reuses the real route's source_url and last_verified_at but is marked info_kind
//      "guidance", so it is never presented as an official requirement.
//
// Regenerate: pnpm exec tsx scripts/data/demo-fixture.ts
import type { AdmissionRoute, Country, Institution, Program } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";

export const DEMO_PROGRAMS: Program[] = [
  {
    slug: "de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225",
    institution: "de-technische-hochschule-aschaffenburg-hrk333",
    institutionType: "public",
    country: "DE",
    city: "aschaffenburg",
    field: "computer-science",
    level: "bachelor",
    name: "Software Design International",
    summary:
      "programs/de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225#summary",
    officialUrl:
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
    durationYears: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: 3.5,
    },
    teachingLanguages: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: ["en"],
    },
    tuition: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "volatile",
      value: {
        amountMinor: 0,
        currency: "EUR",
        period: "year",
      },
    },
    intakes: {
      source_url: "https://www.th-ab.de/studium/bewerben/",
      info_kind: "official",
      last_verified_at: "2026-10-02",
      class: "volatile",
      value: [
        {
          startDate: null,
          applicationOpens: null,
          applicationDeadline: null,
          recurringDeadline: {
            month: 6,
            day: 30,
          },
        },
      ],
    },
    applicationChannel: {
      source_url:
        "https://www.th-ab.de/studium/bewerben/bewerben-mit-auslaendischem-bildungsnachweis/",
      info_kind: "official",
      last_verified_at: "2026-10-02",
      class: "stable",
      value: "de-uni-assist-vpd",
    },
    documents: {
      source_url: "https://www.th-ab.de/studium/bewerben/",
      info_kind: "official",
      last_verified_at: "2026-10-02",
      class: "stable",
      value: [
        {
          slug: "school-leaving-certificate",
          name: "programs/de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225#documents.0.name",
          translationRequired: null,
        },
        {
          slug: "cv",
          name: "programs/de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225#documents.1.name",
          translationRequired: null,
        },
      ],
    },
    requirements: {
      coverage: "complete",
      fact: {
        source_url:
          "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
        info_kind: "official",
        last_verified_at: "2026-10-01",
        class: "stable",
      },
      rules: [
        {
          id: "req-1",
          fact: {
            source_url:
              "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "language_proficiency",
          language: "en",
          minCefr: "B2",
          certificateRequired: true,
          acceptedTests: ["toefl", "ielts"],
        },
        {
          id: "req-2",
          fact: {
            source_url:
              "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "language_proficiency",
          language: "de",
          minCefr: "A1",
          certificateRequired: null,
          acceptedTests: [],
        },
        {
          id: "req-3",
          fact: {
            source_url:
              "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9225/",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "manual_check",
          note: "programs/de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225#requirements.rules.req-3.note",
        },
      ],
    },
    scholarships: [],
  },
  {
    slug: "de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594",
    institution: "de-friedrich-alexander-universitat-erlangen-hrk70",
    institutionType: "public",
    country: "DE",
    city: "erlangen",
    field: "computer-science",
    level: "bachelor",
    name: "Artificial Intelligence BSc",
    summary:
      "programs/de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594#summary",
    officialUrl:
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
    durationYears: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: 3,
    },
    teachingLanguages: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: ["en"],
    },
    tuition: {
      source_url:
        "https://www.fau.eu/studying/international-students/application-and-enrollment-for-international-applicants/tuition-fees-for-students-from-non-eu-states/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "volatile",
      value: {
        amountMinor: 100000,
        currency: "EUR",
        period: "semester",
      },
    },
    intakes: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "volatile",
      value: [
        {
          startDate: null,
          applicationOpens: null,
          applicationDeadline: null,
          recurringDeadline: {
            month: 5,
            day: 31,
          },
        },
      ],
    },
    applicationChannel: {
      source_url:
        "https://www.fau.eu/studying/international-students/application-and-enrollment-for-international-applicants/prospective-international-students-applying-for-undergraduate-programs/",
      info_kind: "official",
      last_verified_at: "2026-10-09",
      class: "stable",
      value: "de-university-direct",
    },
    documents: {
      source_url:
        "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: null,
    },
    requirements: {
      coverage: "complete",
      fact: {
        source_url:
          "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
        info_kind: "official",
        last_verified_at: "2026-10-01",
        class: "stable",
      },
      rules: [
        {
          id: "req-1",
          fact: {
            source_url:
              "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/9594/",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "language_proficiency",
          language: "en",
          minCefr: "B1",
          certificateRequired: true,
          acceptedTests: ["ielts"],
        },
        {
          id: "req-2",
          fact: {
            source_url:
              "https://www.ai.study.fau.eu/prospective-students/bachelor-ai/admission-test/",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "manual_check",
          note: "programs/de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594#requirements.rules.req-2.note",
        },
      ],
    },
    scholarships: [],
  },
  {
    slug: "fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236",
    institution: "fr-aix-marseille-universite-site-de-marseil-0134316w",
    institutionType: "public",
    country: "FR",
    city: "marseille",
    field: "engineering",
    level: "bachelor",
    name: "Licence - Sciences pour l'ingénieur - Portail Marie Curie",
    summary:
      "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#summary",
    officialUrl:
      "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
    durationYears: {
      source_url:
        "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: 3,
    },
    teachingLanguages: {
      source_url:
        "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: ["fr"],
    },
    tuition: {
      source_url:
        "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "volatile",
      value: null,
    },
    intakes: {
      source_url:
        "https://www.maroc.campusfrance.org/calendrier-de-la-procedure-de-candidature-20262027",
      info_kind: "official",
      last_verified_at: "2026-10-04",
      class: "volatile",
      value: [
        {
          startDate: null,
          applicationOpens: "2026-10-01",
          applicationDeadline: "2026-11-15",
        },
      ],
    },
    applicationChannel: {
      source_url:
        "https://www.maroc.campusfrance.org/candidature-en-1ere-annee-de-licence-a-l-universite-et-en-paces",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
      value: "fr-campus-france",
    },
    documents: {
      source_url: "https://www.maroc.campusfrance.org/2la-saisie-des-informations-personnelles",
      info_kind: "official",
      last_verified_at: "2026-10-09",
      class: "stable",
      value: [
        {
          slug: "passport-photo",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.0.name",
          translationRequired: null,
        },
        {
          slug: "identity-document",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.1.name",
          translationRequired: null,
        },
        {
          slug: "school-leaving-certificate",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.2.name",
          translationRequired: null,
        },
        {
          slug: "transcript-of-secondary-school-studies",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.3.name",
          translationRequired: null,
        },
        {
          slug: "school-enrolment-certificate",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.4.name",
          translationRequired: null,
        },
        {
          slug: "french-language-certificate",
          name: "programs/fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236#documents.5.name",
          translationRequired: null,
        },
      ],
    },
    requirements: {
      coverage: "complete",
      fact: {
        source_url:
          "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
        info_kind: "official",
        last_verified_at: "2026-10-01",
        class: "stable",
      },
      rules: [
        {
          id: "req-1",
          fact: {
            source_url:
              "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=39236&typeBac=0&originePc=0",
            info_kind: "official",
            last_verified_at: "2026-10-01",
            class: "stable",
          },
          kind: "language_proficiency",
          language: "fr",
          minCefr: "B2",
          certificateRequired: true,
          acceptedTests: ["tcf", "delf-dalf"],
        },
      ],
    },
    scholarships: [],
  },
];

export const DEMO_ROUTES: AdmissionRoute[] = [
  {
    slug: "demo-ma-bac-to-de",
    origin: "MA",
    credentialType: "ma-bac",
    destination: "DE",
    level: "bachelor",
    outcome: "direct",
    conditions: [],
    note: null,
    applicationChannels: [],
    fact: {
      source_url:
        "https://www.uni-assist.de/en/tools/info-country-by-country/details-country/country/ma/",
      info_kind: "guidance",
      last_verified_at: "2026-10-01",
      class: "stable",
    },
  },
  {
    slug: "ma-bac-to-fr",
    origin: "MA",
    credentialType: "ma-bac",
    destination: "FR",
    level: "bachelor",
    outcome: "direct",
    conditions: [],
    note: "admission-routes/ma-bac-to-fr#note",
    guidance: [
      {
        id: "crous-grant-needs-residence",
        note: "admission-routes/ma-bac-to-fr#guidance.crous-grant-needs-residence.note",
        fact: {
          source_url: "https://www.etudiant.gouv.fr/fr/bourses-sur-criteres-sociaux-pour-qui-2980",
          info_kind: "guidance",
          last_verified_at: "2026-10-05",
          class: "stable",
        },
      },
    ],
    applicationChannels: ["fr-campus-france"],
    fact: {
      source_url:
        "https://www.maroc.campusfrance.org/candidature-en-1ere-annee-de-licence-a-l-universite-et-en-paces",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
    },
  },
];

export const DEMO_INSTITUTIONS: Institution[] = [
  {
    slug: "de-friedrich-alexander-universitat-erlangen-hrk70",
    name: "Friedrich-Alexander-Universität Erlangen-Nürnberg",
    country: "DE",
    city: {
      slug: "erlangen",
      name: "Erlangen",
    },
    type: "public",
    website: "https://www.fau.de/",
    fact: {
      source_url: "https://www.hochschulkompass.de/en/higher-education-institutions/downloads.html",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
    },
  },
  {
    slug: "de-technische-hochschule-aschaffenburg-hrk333",
    name: "Technische Hochschule Aschaffenburg",
    country: "DE",
    city: {
      slug: "aschaffenburg",
      name: "Aschaffenburg",
    },
    type: "public",
    website: "https://www.th-ab.de/",
    fact: {
      source_url: "https://www.hochschulkompass.de/en/higher-education-institutions/downloads.html",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
    },
  },
  {
    slug: "fr-aix-marseille-universite-site-de-marseil-0134316w",
    name: "Aix-Marseille Université - Site de Marseille Saint-Jérôme",
    country: "FR",
    city: {
      slug: "marseille",
      name: "Marseille",
    },
    type: "public",
    website: "https://sciences.univ-amu.fr/fr/sites-campus/marseille-site-saint-jerome",
    fact: {
      source_url: "https://sciences.univ-amu.fr/fr/sites-campus/marseille-site-saint-jerome",
      info_kind: "official",
      last_verified_at: "2026-10-01",
      class: "stable",
    },
  },
];

export const DEMO_COUNTRIES: Country[] = [
  {
    code: "DE",
    name: "countries/DE#name",
    currency: "EUR",
  },
  {
    code: "FR",
    name: "countries/FR#name",
    currency: "EUR",
  },
  {
    code: "MA",
    name: "countries/MA#name",
    currency: "MAD",
  },
];

export const DEMO_CORE: Pick<CoreShard, "credentialTypes" | "gradingScales" | "gradeConversions"> =
  {
    credentialTypes: [
      {
        slug: "ma-bac",
        country: "MA",
        name: "Baccalauréat marocain",
        gloss: "credential-types/ma-bac#gloss",
        gradingScale: "ma-bac-scale",
        tracks: [
          {
            slug: "sciences-mathematiques-a",
            name: "Sciences Mathématiques A",
            gloss: "credential-types/ma-bac#tracks.0.gloss",
            subjects: null,
          },
          {
            slug: "sciences-mathematiques-b",
            name: "Sciences Mathématiques B",
            gloss: "credential-types/ma-bac#tracks.1.gloss",
            subjects: null,
          },
          {
            slug: "sciences-physiques",
            name: "Sciences Physiques",
            gloss: "credential-types/ma-bac#tracks.2.gloss",
            subjects: null,
          },
          {
            slug: "svt",
            name: "Sciences de la Vie et de la Terre (SVT)",
            gloss: "credential-types/ma-bac#tracks.3.gloss",
            subjects: null,
          },
          {
            slug: "sciences-economiques-et-gestion",
            name: "Sciences Économiques et Gestion",
            gloss: "credential-types/ma-bac#tracks.4.gloss",
            subjects: null,
          },
          {
            slug: "lettres",
            name: "Lettres",
            gloss: "credential-types/ma-bac#tracks.5.gloss",
            subjects: null,
          },
          {
            slug: "sciences-humaines",
            name: "Sciences Humaines",
            gloss: "credential-types/ma-bac#tracks.6.gloss",
            subjects: null,
          },
          {
            slug: "sciences-et-technologies-mecaniques",
            name: "Sciences et Technologies Mécaniques",
            gloss: "credential-types/ma-bac#tracks.7.gloss",
            subjects: null,
          },
          {
            slug: "sciences-et-technologies-electriques",
            name: "Sciences et Technologies Électriques",
            gloss: "credential-types/ma-bac#tracks.8.gloss",
            subjects: null,
          },
          {
            slug: "sciences-de-gestion-comptable",
            name: "Sciences de Gestion Comptable",
            gloss: "credential-types/ma-bac#tracks.9.gloss",
            subjects: null,
          },
          {
            slug: "arts-appliques",
            name: "Arts Appliqués",
            gloss: "credential-types/ma-bac#tracks.10.gloss",
            subjects: null,
          },
          {
            slug: "sciences-agronomiques",
            name: "Sciences Agronomiques",
            gloss: "credential-types/ma-bac#tracks.11.gloss",
            subjects: null,
          },
          {
            slug: "sciences-de-la-charia",
            name: "Sciences de la Charia",
            gloss: "credential-types/ma-bac#tracks.12.gloss",
            subjects: null,
          },
          {
            slug: "baccalaureat-professionnel",
            name: "Baccalauréat professionnel",
            gloss: "credential-types/ma-bac#tracks.13.gloss",
            subjects: null,
          },
        ],
        fact: {
          source_url:
            "https://www.men.gov.ma/sites/default/files/2026-06/%D8%A8%D9%84%D8%A7%D8%BA%20%D8%B5%D8%AD%D9%81%D9%8A_1.pdf",
          info_kind: "official",
          last_verified_at: "2026-10-01",
          class: "stable",
        },
      },
    ],
    gradingScales: [
      {
        slug: "ma-bac-scale",
        country: "MA",
        min: 0,
        max: 20,
        pass: 10,
        direction: "higher_better",
        fact: {
          source_url:
            "https://www.phil.fau.de/files/2016/01/Umrechnung-ausl%C3%A4ndischer-Noten.pdf",
          info_kind: "guidance",
          last_verified_at: "2026-10-01",
          class: "stable",
        },
      },
    ],
    gradeConversions: [],
  };
