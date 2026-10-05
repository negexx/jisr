import { describe, expect, it } from "vitest";

import {
  matchContact,
  parseContacts,
  siteOrigin,
} from "../../../scripts/import/sources/mur-contacts";

const cell = (text: string, tag = "td") => `<${tag}>${text}</${tag}>`;
const tr = (...cells: string[]) => `<tr>${cells.map((c) => cell(c)).join("")}</tr>`;

const HTML = `<table><tr><th>Istituzione</th><th>Telefono</th><th>Email</th><th>Sito</th></tr>
${tr("Università degli Studi di FIRENZE", "0552756962", "internationaldesk@unifi.it", "www.unifi.it")}
${tr("Università Commerciale &quot;Luigi Bocconi&quot; MILANO", "+3902403434", "visa.support@unibocconi.it", "https://www.unibocconi.eu")}
${tr("Conservatorio di Musica - Pavia", "0382304764", "segreteria@conspv.it", "https://conspv.it/")}
${tr("Università Politecnica delle MARCHE", "-", "student.admission@sm.univpm.it", "https://www.international.univpm.it/")}
${tr("Istituto Italiano Design - PERUGIA", "-", "-", "-")}
</table>`;

describe("parseContacts", () => {
  it("reads name, phone, email and site, with a dash as unknown", () => {
    const contacts = parseContacts(HTML);
    expect(contacts).toHaveLength(5);
    expect(contacts[0]).toEqual({
      name: "Università degli Studi di FIRENZE",
      phone: "0552756962",
      email: "internationaldesk@unifi.it",
      site: "www.unifi.it",
    });
    expect(contacts[1]?.name).toBe('Università Commerciale "Luigi Bocconi" MILANO');
    expect(contacts[4]).toEqual({
      name: "Istituto Italiano Design - PERUGIA",
      phone: null,
      email: null,
      site: null,
    });
  });

  it("throws when the table is missing: the page changed", () => {
    expect(() => parseContacts("<p>hello</p>")).toThrow(/contacts/i);
  });
});

describe("siteOrigin", () => {
  it("keeps the origin of the first usable address", () => {
    expect(siteOrigin("www.unifi.it")).toBe("https://www.unifi.it/");
    expect(
      siteOrigin("https://en.unito.it/studying-unito/application-international-students"),
    ).toBe("https://en.unito.it/");
    expect(siteOrigin("http://web.uniroma2.it/home (IT) - https://en.uniroma2.it/ (EN)")).toBe(
      "http://web.uniroma2.it/",
    );
    expect(siteOrigin("https://www.unina.it/documents/20117/4260320/Uni_2026_27.pdf")).toBe(
      "https://www.unina.it/",
    );
  });

  it("is null for a dash, an empty host or junk", () => {
    expect(siteOrigin(null)).toBeNull();
    expect(siteOrigin("-")).toBeNull();
    expect(siteOrigin("http://www.")).toBeNull();
    expect(siteOrigin("see our website")).toBeNull();
  });
});

describe("matchContact", () => {
  const contacts = parseContacts(HTML);
  const ateneo = (fullName: string, city: string) => ({ fullName, city });

  it("matches when the distinctive words are the same, ignoring case, quotes and filler", () => {
    expect(
      matchContact(ateneo("Università degli studi di Firenze", "FIRENZE"), contacts)?.site,
    ).toBe("www.unifi.it");
    expect(
      matchContact(ateneo("Università commerciale Luigi Bocconi di Milano", "MILANO"), contacts)
        ?.site,
    ).toBe("https://www.unibocconi.eu");
  });

  it("accepts the headquarters town as the only extra word", () => {
    expect(
      matchContact(ateneo("Università Politecnica delle Marche - Ancona", "ANCONA"), contacts)
        ?.site,
    ).toBe("https://www.international.univpm.it/");
  });

  it("does not match a conservatory or another town, and never guesses on an ambiguous name", () => {
    expect(matchContact(ateneo("Università degli studi di Pavia", "PAVIA"), contacts)).toBeNull();
    const twin = [
      ...contacts,
      { name: "Università degli Studi FIRENZE", phone: null, email: null, site: "www.other.it" },
    ];
    expect(matchContact(ateneo("Università degli studi di Firenze", "FIRENZE"), twin)).toBeNull();
  });
});
