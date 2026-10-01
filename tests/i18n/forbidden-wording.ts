type Locale = "fr" | "en" | "ar";

// The patterns intentionally over-ban (e.g. "make sure", "qualification", "صفحة القبول"): rephrase
// the string rather than deleting a pattern. "accepted" stays allowed where it refers to an
// accepted language certificate.
export const FORBIDDEN: Record<Locale, RegExp[]> = {
  en: [
    /eligib/i,
    /\badmitted\b/i,
    /admission guarantee/i,
    /guarantee/i,
    /\byou will\b/i,
    /you'?ll\b/i,
    /\byou can apply\b/i,
    /\bchances?\b/i,
    /\bqualif/i,
    /\byou meet\b/i,
    /\b(you are|will be) accepted\b/i,
    /\bready to apply\b/i,
    /\bsafe\b/i,
    /\bcertain(ly)?\b/i,
    /\bsure\b/i,
  ],
  fr: [
    /éligib|eligib/i,
    /\badmise?s?\b/i,
    /admissib/i,
    /garanti/i,
    /\bvous serez\b/i,
    /\bvous pouvez candidater\b/i,
    /\bqualifié/i,
    /\bassuré/i,
    /\bcertain(e|ement)?\b/i,
    /accepté(e|s)? (dans|en)\b/i,
  ],
  ar: [/قبول/u, /ضمان|نضمن|تضمن|مضمون/u, /يحق لك/u, /مؤهل/u, /يمكنك التقديم/u],
};
