import type { CoreShard } from "@/data-schema/snapshot";

import { credentialType, scale20, scale100 } from "../../fixtures/domain/builders";

export function coreShard(): CoreShard {
  return {
    kind: "core",
    countries: [
      { code: "XA", name: "countries/XA#name", currency: "XTS" },
      { code: "XB", name: "countries/XB#name", currency: "XTS" },
    ],
    fields: [{ slug: "xx-test-field", name: "fields/xx-test-field#name" }],
    subjects: [
      { slug: "xx-test-math", name: "subjects/xx-test-math#name" },
      { slug: "xx-test-physics", name: "subjects/xx-test-physics#name" },
    ],
    languageCertificates: [
      {
        slug: "xx-test-cert-fr",
        name: "XX French test",
        language: "fr",
        url: "https://example.org/fr",
      },
      {
        slug: "xx-test-cert-en",
        name: "XX English test",
        language: "en",
        url: "https://example.org/en",
      },
      {
        slug: "xx-test-cert-en-2",
        name: "XX English test 2",
        language: "en",
        url: "https://example.org/en2",
      },
    ],
    gradingScales: [scale20, scale100],
    gradeConversions: [],
    credentialTypes: [credentialType()],
    applicationChannels: [],
  };
}
