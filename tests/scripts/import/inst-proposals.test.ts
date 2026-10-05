import { describe, expect, it } from "vitest";

import {
  alternateHomes,
  pickQuote,
  quoteFor,
  quoteNames,
  websiteFrom,
} from "../../../scripts/import/inst-proposals";

describe("websiteFrom", () => {
  it("takes the home page of the domain most of the institution's own pages are on", () => {
    expect(
      websiteFrom([
        "https://www.fontys.nl/Opleidingen/ICT.htm",
        "https://www.fontys.nl/Studeren/Collegegeld.htm",
        "https://www2.daad.de/deutschland/studienangebote/x/detail/1/",
        "https://other.example/x",
      ]),
    ).toBe("https://www.fontys.nl/");
  });

  it("ignores register and national pages, which belong to no institution", () => {
    expect(
      websiteFrom([
        "https://www2.daad.de/a",
        "https://dossierappel.parcoursup.fr/b",
        "https://www.maroc.campusfrance.org/c",
        "https://tempus.tpf.hu/studyfinder/index/show/116",
        "https://studyinhungary.hu/institution/university-of-debrecen-60.html",
        "https://stipendiumhungaricum.hu/apply/",
        "https://www.universitaly.it/en/studenti-stranieri",
        "https://universitaly-private.cineca.it/uploads/universitaly-pubblico/FAQ.pdf",
        "https://www.mur.gov.it/it",
      ]),
    ).toBeNull();
  });

  it("prefers the staged candidate website when it is on the winning domain", () => {
    const urls = [
      "https://corsidilaurea.uniroma1.it/it/course/33502",
      "https://corsidilaurea.uniroma1.it/it/course/33549",
      "https://www.uniroma1.it/it/pagina/contributi-e-agevolazioni",
    ];
    expect(websiteFrom(urls)).toBe("https://corsidilaurea.uniroma1.it/");
    expect(websiteFrom(urls, "https://www.uniroma1.it/")).toBe("https://www.uniroma1.it/");
    // a candidate on another domain is not used
    expect(websiteFrom(urls, "https://www.other.it/")).toBe("https://corsidilaurea.uniroma1.it/");
    // an insecure or missing candidate is not used
    expect(websiteFrom(urls, "http://www.uniroma1.it/")).toBe("https://corsidilaurea.uniroma1.it/");
    expect(websiteFrom(urls, null)).toBe("https://corsidilaurea.uniroma1.it/");
  });

  it("is null without any page", () => {
    expect(websiteFrom([])).toBeNull();
  });
});

describe("alternateHomes", () => {
  it("offers the main www home page when the website is a sub-site", () => {
    expect(alternateHomes("https://en.unito.it/")).toEqual(["https://www.unito.it/"]);
    expect(alternateHomes("https://apply.unipv.eu/")).toEqual(["https://www.unipv.eu/"]);
  });

  it("offers nothing for a www or bare-domain home page, or for a two-part registrable domain", () => {
    expect(alternateHomes("https://www.unibo.it/")).toEqual([]);
    expect(alternateHomes("https://unibo.it/")).toEqual([]);
    expect(alternateHomes("https://www.example.ac.uk/")).toEqual([]);
    expect(alternateHomes("https://study.example.ac.uk/")).toEqual(["https://www.example.ac.uk/"]);
  });
});

describe("quoteFor", () => {
  const page =
    "Home | Welkom bij Fontys Hogeschool ICT in Tilburg. Studeer bij ons en ontdek meer over onze opleidingen.";

  it("returns a verbatim stretch of the page around the institution's distinctive word", () => {
    const quote = quoteFor("Fontys Hogeschool Tilburg", page);
    expect(quote).not.toBeNull();
    expect(page).toContain(quote ?? "");
    expect(quote).toMatch(/Fontys/);
    expect((quote ?? "").length).toBeGreaterThanOrEqual(15);
  });

  it("is null when the page does not name the institution at all", () => {
    expect(
      quoteFor("Windesheim", "A page about something else entirely, with no relevant name."),
    ).toBeNull();
  });

  it("skips generic words so a page that only says 'Hogeschool' does not count", () => {
    expect(
      quoteFor(
        "Hogeschool Utrecht",
        "Een hogeschool is een instelling voor hoger onderwijs in Nederland.",
      ),
    ).toBeNull();
  });
});

describe("quoteFor prefers a quote that says what the institution is", () => {
  const filler = "Lorem ipsum dolor sit amet. ".repeat(40);

  it("skips a news headline that merely mentions the name when a better line exists", () => {
    const page = `Aktuelles Duale Hochschule Baden-Württemberg Mosbach trauert um ihren ehemaligen Präsidenten. ${filler} Willkommen an der Dualen Hochschule Baden-Württemberg Mosbach: Studium mit Praxis.`;
    const quote = quoteFor("Baden-Wuerttemberg Cooperative State University", page);
    expect(quote).not.toMatch(/trauert/);
    expect(quote).toMatch(/Baden-Württemberg Mosbach/);
  });

  it("prefers a mention that comes with an institution word and sits near the top", () => {
    const page = `Home ${filler} Our news: Fontys sponsors a football club. ${filler} Fontys Hogeschool ICT is a university of applied sciences.`;
    const quote = quoteFor("Fontys Hogeschool Tilburg", page);
    expect(quote).toMatch(/Hogeschool/);
  });

  it("still returns the only mention there is, whatever it looks like", () => {
    const quote = quoteFor("Windesheim", `${filler} Nieuws: Windesheim wint prijs voor onderwijs.`);
    expect(quote).toMatch(/Windesheim/);
  });
});

describe("pickQuote", () => {
  const home = {
    url: "https://www.uni.example/",
    text: "Start Duale Hochschule Baden-Württemberg Mosbach trauert um ihren langjährigen Präsidenten.",
  };
  const programme = {
    url: "https://www.uni.example/studium/informatik",
    text: `${"Studium Informatik Bachelor. ".repeat(3)}Duale Hochschule Baden-Württemberg Mosbach: Studieren mit Praxis und Theorie im Wechsel.`,
  };

  it("takes the quote from the page where the name appears in the best context, with that page's url", () => {
    const picked = pickQuote("Baden-Wuerttemberg Cooperative State University", [home, programme]);
    expect(picked?.url).toBe("https://www.uni.example/studium/informatik");
    expect(picked?.quote).toMatch(/Studieren mit Praxis/);
  });

  it("uses the home page when its quote is already good", () => {
    const good = {
      url: "https://www.uni.example/",
      text: "Fontys Hogeschool ICT is a university of applied sciences in Tilburg.",
    };
    expect(pickQuote("Fontys Hogeschool Tilburg", [good, programme])?.url).toBe(
      "https://www.uni.example/",
    );
  });

  it("is null when no page names the institution", () => {
    expect(
      pickQuote("Windesheim", [
        { url: "https://x.example/", text: "Nothing relevant here at all." },
      ]),
    ).toBeNull();
  });
});

describe("quoteFor matches whole words only", () => {
  it("does not match the brand word inside a longer word", () => {
    expect(
      quoteFor("Hogeschool Delft", "Studeren aan de TUDelft en in Delfts blauw is leuk, zegt men."),
    ).toBeNull();
    expect(
      quoteFor(
        "Hochschule Rhein-Waal",
        "Willkommen im Rheinland: Studieren am Niederrhein mit Aussicht.",
      ),
    ).toBeNull();
  });

  it("matches the word next to punctuation and accents", () => {
    const quote = quoteFor(
      "Université Lille",
      "Bienvenue à l'Université de Lille, université publique du Nord.",
    );
    expect(quote).toMatch(/Lille/);
  });
});

describe("quoteNames", () => {
  it("is true when the quote contains a distinctive word of the name as a whole word", () => {
    expect(quoteNames("Fontys Hogeschool Tilburg", "Welkom bij Fontys Hogeschool ICT")).toBe(true);
  });

  it("is false when the word only appears inside a longer one, or only generic words match", () => {
    expect(quoteNames("Hochschule Rhein-Waal", "Willkommen im Rheinland")).toBe(false);
    expect(quoteNames("Hogeschool Utrecht", "Een hogeschool is een school")).toBe(false);
  });
});
