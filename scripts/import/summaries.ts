// Short descriptions are shown in all three locales; the importers know the fixed sentence for
// each source, so they write en and ar next to fr (all drafts) instead of leaving the page to fall
// back to French.
type Locale = "fr" | "en" | "ar";
export type Localized = Record<Locale, { text: string; status: "draft" }>;

const draft = (fr: string, en: string, ar: string): Localized => ({
  fr: { text: fr, status: "draft" },
  en: { text: en, status: "draft" },
  ar: { text: ar, status: "draft" },
});

export type SummarySource =
  | "parcoursup"
  | "rio"
  | "daad"
  | "studiensuche"
  | "studyfinder"
  | "mur"
  | "universitaly"
  | "ruct";

const SOURCE_LINE: Record<SummarySource, { fr: string; en: string; ar: string }> = {
  parcoursup: {
    fr: "Fiche officielle Parcoursup.",
    en: "Official Parcoursup listing.",
    ar: "البطاقة الرسمية على منصة Parcoursup.",
  },
  rio: {
    fr: "Programme recensé au registre néerlandais RIO.",
    en: "Programme listed in the Dutch RIO register.",
    ar: "برنامج مدرج في السجل الهولندي RIO.",
  },
  daad: {
    fr: "Programme recensé dans la base de programmes internationaux du DAAD.",
    en: "Programme listed in the DAAD international programmes database.",
    ar: "برنامج مدرج في قاعدة بيانات البرامج الدولية التابعة لـ DAAD.",
  },
  studyfinder: {
    fr: "Programme recensé dans le Study Finder de Study in Hungary (Tempus Public Foundation).",
    en: "Programme listed in the Study in Hungary Study Finder (Tempus Public Foundation).",
    ar: "برنامج مدرج في Study Finder التابع لـ Study in Hungary (مؤسسة Tempus العامة).",
  },
  mur: {
    fr: "Programme recensé dans les données ouvertes de l'offre de formation du ministère italien de l'Université et de la Recherche (MUR).",
    en: "Programme listed in the Italian Ministry of University and Research (MUR) open data on degree courses.",
    ar: "برنامج مدرج في البيانات المفتوحة لعرض التكوين لدى وزارة الجامعات والبحث الإيطالية (MUR).",
  },
  universitaly: {
    fr: "Programme recensé sur Universitaly, le portail de l'offre de formation du ministère italien de l'Université et de la Recherche (MUR).",
    en: "Programme listed on Universitaly, the Italian Ministry of University and Research (MUR) portal of the degree offer.",
    ar: "برنامج مدرج على بوابة Universitaly لعرض التكوين التابعة لوزارة الجامعات والبحث الإيطالية (MUR).",
  },
  studiensuche: {
    fr: "Programme référencé dans la Studiensuche de l'Agence fédérale pour l'emploi.",
    en: "Programme listed in the Federal Employment Agency's Studiensuche.",
    ar: "برنامج مدرج في Studiensuche التابع للوكالة الفيدرالية للتوظيف.",
  },
  ruct: {
    fr: "Programme recensé dans le registre espagnol des universités et des titres (RUCT).",
    en: "Programme listed in the Spanish register of universities and degrees (RUCT).",
    ar: "برنامج مدرج في السجل الإسباني للجامعات والشهادات (RUCT).",
  },
};

export function programmeSummary(
  title: string,
  institution: string,
  city: string,
  source: SummarySource,
): Localized {
  const line = SOURCE_LINE[source];
  const make = (locale: Locale) =>
    `${title}, ${institution} (${city}). ${line[locale]}`.slice(0, 400);
  return draft(make("fr"), make("en"), make("ar"));
}

export const CHANNEL_SUMMARIES: Record<string, Localized> = {
  "fr-parcoursup": draft(
    "Plateforme nationale de candidature en première année de Licence et de BUT.",
    "National application platform for first-year Licence and BUT programmes.",
    "المنصة الوطنية للتقدّم إلى السنة الأولى من الإجازة والإجازة الجامعية في التكنولوجيا (BUT).",
  ),
  "fr-campus-france": draft(
    "Procédure Études en France de Campus France Maroc, obligatoire pour candidater en première année de Licence ou de BUT depuis le Maroc avec le baccalauréat marocain.",
    "Campus France Morocco's Études en France procedure, mandatory for applying to a first-year Licence or BUT from Morocco with the Moroccan baccalauréat.",
    "مسطرة Études en France لدى كامبوس فرانس المغرب، إلزامية للتقدّم إلى السنة الأولى من الإجازة أو BUT من المغرب بالباكالوريا المغربية.",
  ),
  "nl-studielink": draft(
    "Plateforme nationale d'inscription dans l'enseignement supérieur néerlandais.",
    "National enrolment platform for Dutch higher education.",
    "المنصة الوطنية للتسجيل في التعليم العالي الهولندي.",
  ),
};

export const UNI_ASSIST_SUMMARY: Localized = draft(
  "Service central de candidature pour les étudiants internationaux de nombreuses universités allemandes.",
  "Central application service for international students of many German universities.",
  "الخدمة المركزية لطلبات التسجيل للطلبة الدوليين في عدد كبير من الجامعات الألمانية.",
);

export const UNI_ASSIST_VPD_SUMMARY: Localized = draft(
  "uni-assist examine d'abord vos diplômes étrangers et vous remet une attestation préliminaire (VPD) ; vous déposez ensuite votre candidature avec la VPD directement auprès de l'université.",
  "uni-assist first reviews your foreign certificates and issues a preliminary review document (VPD); you then submit your application with the VPD directly to the university.",
  "تقوم uni-assist أولًا بمراجعة شهاداتكم الأجنبية وتمنحكم وثيقة المراجعة الأولية (VPD)، ثم تقدّمون طلبكم مع هذه الوثيقة مباشرة إلى الجامعة.",
);

export const UNIVERSITY_DIRECT_SUMMARY: Localized = draft(
  "Candidature directement auprès de l'université, via son propre portail de candidature : renseignez-vous auprès d'elle sur la reconnaissance de votre diplôme étranger.",
  "Apply directly to the university through its own application portal: ask the university how your foreign diploma gets recognised.",
  "التقدّم مباشرة إلى الجامعة عبر بوابة التسجيل الخاصة بها: استفسروا لديها عن كيفية الاعتراف بشهادتكم الأجنبية.",
);
