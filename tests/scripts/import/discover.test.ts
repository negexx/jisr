import { describe, expect, it } from "vitest";
import {
  discover,
  discoverBySearch,
  discoverFromRegister,
  extractLinks,
  sameSite,
  scoreLink,
} from "../../../scripts/import/discover";
import {
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  type SearchProvider,
} from "../../../scripts/import/search";

describe("extractLinks", () => {
  it("drops a PDF by default and keeps it with pdf: true, other files always dropped", () => {
    const html =
      '<a href="/fees.pdf">Fees</a><a href="/photo.jpg">Photo</a><a href="/page">Page</a>';
    const base = "https://www.uni.example/";
    expect(extractLinks(html, base).map((l) => l.url)).toEqual(["https://www.uni.example/page"]);
    expect(extractLinks(html, base, { pdf: true }).map((l) => l.url)).toEqual([
      "https://www.uni.example/fees.pdf",
      "https://www.uni.example/page",
    ]);
  });

  it("decodes HTML entities in an href", () => {
    const links = extractLinks(
      '<a href="/prog?id=3&amp;lang=en&#38;x=1">Programme</a>',
      "https://www.uni.example/",
    );
    expect(links.map((l) => l.url)).toEqual(["https://www.uni.example/prog?id=3&lang=en&x=1"]);
  });

  const html = `
    <a href="/en/programmes/data-science">Data Science</a>
    <a href="https://www.uni.example/en/fees#top">Tuition fees</a>
    <a href="https://www.uni.example/en/fees">Tuition fees again</a>
    <a href="mailto:info@uni.example">mail</a>
    <a href="tel:+31000">phone</a>
    <a href="/brochure.pdf">Brochure</a>
    <a href="javascript:void(0)">x</a>
    <a href="http://www.uni.example/insecure">insecure</a>
    <a href="https://other.example/x">elsewhere</a>
    <a href="../up">Up</a>
  `;

  it("resolves relative links, drops fragments, mail/tel/javascript and non-https, and dedupes", () => {
    const links = extractLinks(html, "https://www.uni.example/en/home/");
    const urls = links.map((l) => l.url);
    expect(urls).toContain(
      "https://www.uni.example/en/programmes/data-science".replace(
        "/en/programmes",
        "/en/programmes",
      ),
    );
    expect(urls).toContain("https://www.uni.example/en/fees");
    expect(urls.filter((u) => u === "https://www.uni.example/en/fees")).toHaveLength(1);
    expect(
      urls.some((u) => u.startsWith("mailto") || u.startsWith("tel") || u.startsWith("javascript")),
    ).toBe(false);
    expect(urls.some((u) => u.startsWith("http://"))).toBe(false);
  });

  it("keeps the anchor text, stripped of tags", () => {
    const links = extractLinks(
      '<a href="/x"><span>Bachelor</span> <b>ICT</b></a>',
      "https://a.example/",
    );
    expect(links[0]?.text).toBe("Bachelor ICT");
  });

  it("leaves out files that are not pages", () => {
    const links = extractLinks(html, "https://www.uni.example/en/home/");
    expect(links.some((l) => l.url.endsWith(".pdf"))).toBe(false);
  });
});

describe("sameSite", () => {
  it("accepts the same registrable domain and its subdomains", () => {
    expect(sameSite("https://www.uni.example/a", "https://sciences.uni.example/b")).toBe(true);
    expect(sameSite("https://www.uni.example/a", "https://other.example/b")).toBe(false);
  });

  it("handles two-label public suffixes like ac.uk", () => {
    expect(sameSite("https://www.ox.ac.uk/a", "https://www.cam.ac.uk/b")).toBe(false);
  });
});

describe("scoreLink", () => {
  const name = "Applied Data Science and Artificial Intelligence";

  it("scores a programme link by how many words of the name its text and path carry", () => {
    const hit = scoreLink(
      {
        url: "https://u.example/en/programmes/applied-data-science-artificial-intelligence",
        text: "Applied Data Science & AI",
      },
      "programme",
      name,
    );
    const miss = scoreLink(
      { url: "https://u.example/en/about-us", text: "About us" },
      "programme",
      name,
    );
    expect(hit).toBeGreaterThan(miss);
    expect(hit).toBeGreaterThan(0.5);
  });

  it("ignores accents when matching", () => {
    expect(
      scoreLink(
        {
          url: "https://u.example/formations/sciences-pour-l-ingenieur",
          text: "Sciences pour l'ingénieur",
        },
        "programme",
        "Licence Sciences pour l'Ingénieur",
      ),
    ).toBeGreaterThan(0.5);
  });

  it("recognises fee and admission pages by their wording in several languages", () => {
    expect(
      scoreLink({ url: "https://u.example/en/tuition-fees", text: "Tuition fees" }, "fees", name),
    ).toBeGreaterThan(0);
    expect(
      scoreLink(
        { url: "https://u.example/studium/studiengebuehren", text: "Studiengebühren" },
        "fees",
        name,
      ),
    ).toBeGreaterThan(0);
    expect(
      scoreLink(
        { url: "https://u.example/admission/apply", text: "How to apply" },
        "admission",
        name,
      ),
    ).toBeGreaterThan(0);
    expect(
      scoreLink({ url: "https://u.example/bewerbung", text: "Bewerbung" }, "admission", name),
    ).toBeGreaterThan(0);
    expect(scoreLink({ url: "https://u.example/about", text: "About" }, "fees", name)).toBe(0);
  });

  it("scores news and event pages down", () => {
    const news = scoreLink(
      {
        url: "https://u.example/news/applied-data-science-artificial-intelligence-launch",
        text: "Applied Data Science AI launch",
      },
      "programme",
      name,
    );
    const page = scoreLink(
      {
        url: "https://u.example/programmes/applied-data-science-artificial-intelligence",
        text: "Applied Data Science AI",
      },
      "programme",
      name,
    );
    expect(page).toBeGreaterThan(news);
  });
});

describe("discover", () => {
  const site: Record<string, string> = {
    "https://www.uni.example/": `<a href="/en/study">Study</a><a href="/en/about">About</a><a href="/en/news/x">News</a>`,
    "https://www.uni.example/en/study": `<a href="/en/study/bachelor/applied-data-science">Applied Data Science</a><a href="/en/study/bachelor/nursing">Nursing</a>`,
    "https://www.uni.example/en/study/bachelor/applied-data-science": `<h1>Applied Data Science</h1> Bachelor of Applied Data Science, 4 years. <a href="/en/tuition-fees">Tuition fees</a> <a href="/en/apply">How to apply</a>`,
    "https://www.uni.example/en/study/bachelor/nursing": "<h1>Nursing</h1> Bachelor of Nursing.",
    "https://www.uni.example/en/tuition-fees": "Tuition fees 2026: EUR 14,650 for non-EU students.",
    "https://www.uni.example/en/apply": "Apply via Studielink before 1 May.",
    "https://www.uni.example/en/about": "About the university.",
    "https://www.uni.example/en/news/x": "News.",
  };
  const fetchHtml = async (url: string) => {
    const page = site[url];
    if (page === undefined) throw new Error(`404 ${url}`);
    return page;
  };

  it("finds the programme page through a study hub, and its fee and admission pages", async () => {
    const found = await discover({
      website: "https://www.uni.example/",
      name: "Applied Data Science",
      fetchHtml,
    });
    expect(found.programme).toBe("https://www.uni.example/en/study/bachelor/applied-data-science");
    expect(found.fees).toContain("https://www.uni.example/en/tuition-fees");
    expect(found.admission).toContain("https://www.uni.example/en/apply");
  });

  it("returns no programme page when none of the pages names the programme", async () => {
    const found = await discover({
      website: "https://www.uni.example/",
      name: "Marine Biology",
      fetchHtml,
    });
    expect(found.programme).toBeNull();
  });

  it("never fetches more pages than its cap", async () => {
    let calls = 0;
    await discover({
      website: "https://www.uni.example/",
      name: "Applied Data Science",
      maxFetches: 3,
      fetchHtml: async (url) => {
        calls++;
        return fetchHtml(url);
      },
    });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it("survives a homepage that cannot be fetched", async () => {
    const found = await discover({
      website: "https://down.example/",
      name: "Applied Data Science",
      fetchHtml: async () => {
        throw new Error("down");
      },
    });
    expect(found).toEqual({ programme: null, fees: [], admission: [], fetched: 0 });
  });
});

describe("discoverFromRegister", () => {
  const site: Record<string, string> = {
    "https://www2.daad.de/en/detail/5225/": `
      <a href="https://www.study-in-germany.de/en/funding/">Funding</a>
      <a href="https://www.uni.example/en/fees-and-costs">website</a>
      <a href="https://www.uni.example/en/application">website</a>
      <a href="https://www.uni.example/en/study/bachelor/international-business">Course website</a>
      <a href="https://www.facebook.com/uni">fb</a>`,
    "https://www.uni.example/en/study/bachelor/international-business": `<a href="/en/study/costs">Costs</a>`,
    "https://www.uni.example/en/fees-and-costs": "Costs: no tuition fee.",
    "https://www.uni.example/en/application": "Apply here.",
    "https://www.uni.example/en/study/costs": "More costs.",
  };
  const fetchHtml = async (url: string) => {
    const page = site[url];
    if (page === undefined) throw new Error(`404 ${url}`);
    return page;
  };

  it("takes the programme page from a custom link reader when the register gives one (Study Finder contact website)", async () => {
    const register = "https://tempus.tpf.hu/studyfinder/index/show/116";
    const pages: Record<string, string> = {
      [register]:
        '<a href="https://www.facebook.com/x">https://www.facebook.com/x</a><a href="https://www.uni.example/p/bsc">https://www.uni.example/p/bsc</a>',
      "https://www.uni.example/p/bsc": '<a href="/tuition-fees">Tuition fees</a>',
    };
    const found = await discoverFromRegister({
      registerUrl: register,
      name: "Business Informatics",
      fetchHtml: async (url) => {
        const page = pages[url];
        if (page === undefined) throw new Error("404");
        return page;
      },
      programmeLink: () => "https://www.uni.example/p/bsc",
    });
    expect(found.programme).toBe("https://www.uni.example/p/bsc");
  });

  it("takes the programme page from the register's course-website link", async () => {
    const found = await discoverFromRegister({
      registerUrl: "https://www2.daad.de/en/detail/5225/",
      name: "International Business",
      fetchHtml,
    });
    expect(found.programme).toBe(
      "https://www.uni.example/en/study/bachelor/international-business",
    );
  });

  it("finds the institution's fee and application pages among the register's links, not the register's own", async () => {
    const found = await discoverFromRegister({
      registerUrl: "https://www2.daad.de/en/detail/5225/",
      name: "International Business",
      fetchHtml,
    });
    expect(found.fees).toContain("https://www.uni.example/en/fees-and-costs");
    expect(found.admission).toContain("https://www.uni.example/en/application");
    expect(
      found.fees
        .concat(found.admission)
        .some((u) => u.includes("facebook") || u.includes("study-in-germany")),
    ).toBe(false);
  });

  it("returns nothing when the register page cannot be fetched", async () => {
    const found = await discoverFromRegister({
      registerUrl: "https://www2.daad.de/en/detail/1/",
      name: "X",
      fetchHtml,
    });
    expect(found).toEqual({ programme: null, fees: [], admission: [], fetched: 0 });
  });
});

describe("discoverBySearch", () => {
  const pages: Record<string, string> = {
    "https://www.uni.example/en/study/bachelor/applied-data-science":
      "<h1>Applied Data Science</h1> Bachelor of Applied Data Science, 4 years.",
    "https://www.uni.example/en/study/bachelor/nursing": "<h1>Nursing</h1> Bachelor of Nursing.",
  };
  const fetchHtml = async (url: string) => {
    const page = pages[url];
    if (page === undefined) throw new Error(`404 ${url}`);
    return page;
  };
  const fakeSearch = (log: string[]): SearchProvider => ({
    name: "fake",
    search: async (query) => {
      log.push(query);
      if (query.includes("tuition")) {
        return [
          {
            url: "https://www.uni.example/en/tuition-fees",
            title: "Tuition fees",
            snippet: "fees for non-EU students",
          },
          { url: "https://other.example/fees", title: "Tuition fees elsewhere", snippet: "" },
        ];
      }
      if (query.includes("admission")) {
        return [
          {
            url: "https://www.uni.example/en/apply",
            title: "How to apply",
            snippet: "admission requirements",
          },
        ];
      }
      return [
        { url: "https://www.uni.example/en/study/bachelor/nursing", title: "Nursing", snippet: "" },
        {
          url: "https://www.uni.example/en/study/bachelor/applied-data-science",
          title: "Applied Data Science",
          snippet: "Bachelor",
        },
        {
          url: "https://other.example/applied-data-science",
          title: "Applied Data Science",
          snippet: "",
        },
      ];
    },
  });
  const input = {
    name: "Applied Data Science",
    institution: "Uni Example",
    country: "NL",
    website: "https://www.uni.example/",
    fetchHtml,
  };

  it("finds the programme page among the search hits, on the institution's own site", async () => {
    const log: string[] = [];
    const found = await discoverBySearch({ ...input, search: fakeSearch(log) });
    expect(found.programme).toBe("https://www.uni.example/en/study/bachelor/applied-data-science");
    expect(log.some((q) => q.includes("site:uni.example"))).toBe(true);
  });

  it("finds the fee and admission pages and ignores pages of other sites", async () => {
    const found = await discoverBySearch({ ...input, search: fakeSearch([]) });
    expect(found.fees).toEqual(["https://www.uni.example/en/tuition-fees"]);
    expect(found.admission).toEqual(["https://www.uni.example/en/apply"]);
  });

  it("asks the institution-level questions once for all of that institution's programmes", async () => {
    const log: string[] = [];
    const memo = new Map<string, Promise<SearchHit[]>>();
    const search = fakeSearch(log);
    await discoverBySearch({ ...input, search, memo });
    await discoverBySearch({ ...input, name: "Nursing", search, memo });
    expect(log.filter((q) => q.includes("tuition"))).toHaveLength(1);
    expect(log.filter((q) => q.includes("admission"))).toHaveLength(1);
  });

  it("asks the institution-level questions in Italian and English for Italy", async () => {
    const log: string[] = [];
    const languages: (string | undefined)[] = [];
    const search: SearchProvider = {
      name: "fake",
      search: async (query, options) => {
        log.push(query);
        languages.push(options?.language);
        return [];
      },
    };
    await discoverBySearch({ ...input, country: "IT", search });
    expect(log.some((q) => q.includes("tasse") && q.includes("tuition fees"))).toBe(true);
    expect(log.some((q) => q.includes("preiscrizione") && q.includes("admission"))).toBe(true);
    expect(languages.every((l) => l === "it")).toBe(true);
  });

  it("asks the institution-level questions in Spanish for Spain", async () => {
    const log: string[] = [];
    const languages: (string | undefined)[] = [];
    const search: SearchProvider = {
      name: "fake",
      search: async (query, options) => {
        log.push(query);
        languages.push(options?.language);
        return [];
      },
    };
    await discoverBySearch({ ...input, country: "ES", search });
    expect(log.some((q) => q.includes("tasas") && q.includes("tuition fees"))).toBe(true);
    expect(log.some((q) => q.includes("preinscripción") && q.includes("admission"))).toBe(true);
    expect(languages.every((l) => l === "es")).toBe(true);
  });

  it("returns no programme page when no hit's page names the programme", async () => {
    const found = await discoverBySearch({
      ...input,
      name: "Marine Biology",
      search: fakeSearch([]),
    });
    expect(found.programme).toBeNull();
  });
  it("lets a search budget stop propagate", async () => {
    const budget = new QueryBudget(1);
    await expect(discoverBySearch({ ...input, search: fakeSearch([]), budget })).rejects.toThrow(
      SearchBudgetExceeded,
    );
  });
});

describe("discoverBySearch noise", () => {
  const search: SearchProvider = {
    name: "fake",
    search: async (query) =>
      query.includes("tuition") || query.includes("collegegeld")
        ? [
            {
              url: "https://www.uni.example/sites/default/files/2019-09/collegegeld-regeling.pdf",
              title: "Collegegeld regeling",
              snippet: "tuition fees",
            },
            {
              url: "https://punt.uni.example/2018/03/collegegeld-stijgt/",
              title: "Collegegeld stijgt",
              snippet: "tuition fees",
            },
            {
              url: "https://www.uni.example/studeren/collegegeld",
              title: "Collegegeld",
              snippet: "tuition fees",
            },
          ]
        : [],
  };

  it("drops PDFs and dated news posts from the fee pages", async () => {
    const found = await discoverBySearch({
      name: "Applied Data Science",
      institution: "Uni Example",
      country: "NL",
      website: "https://www.uni.example/",
      search,
      fetchHtml: async () => {
        throw new Error("none");
      },
    });
    expect(found.fees).toEqual(["https://www.uni.example/studeren/collegegeld"]);
  });
});

describe("discoverBySearch hardening", () => {
  const hitsFor = (hits: SearchHit[]): SearchProvider => ({
    name: "fake",
    search: async () => hits,
  });
  const base = { name: "Applied Data Science", institution: "Uni Example", country: "NL" };

  it("without a known website it asks nothing and finds nothing (an aggregator's page would be labelled official)", async () => {
    const log: string[] = [];
    const search: SearchProvider = {
      name: "fake",
      search: async (q) => {
        log.push(q);
        return [
          {
            url: "https://bachelorsportal.example/applied-data-science",
            title: "Applied Data Science",
            snippet: "",
          },
        ];
      },
    };
    const found = await discoverBySearch({ ...base, website: null, search });
    expect(found).toEqual({ programme: null, fees: [], admission: [], fetched: 0 });
    expect(log).toEqual([]);
  });

  it("survives a malformed url in the results", async () => {
    const search = hitsFor([
      { url: "https://", title: "broken", snippet: "" },
      { url: "https://www.uni.example/en/tuition-fees", title: "Tuition fees", snippet: "fees" },
    ]);
    const found = await discoverBySearch({
      ...base,
      website: "https://www.uni.example/",
      search,
      fetchHtml: async () => "",
    });
    expect(found.fees).toEqual(["https://www.uni.example/en/tuition-fees"]);
  });

  it("keeps a fee page whose path has a school year, and drops a dated news post", async () => {
    const search = hitsFor([
      {
        url: "https://www.uni.example/studeren/collegegeld-2025-2026",
        title: "Collegegeld",
        snippet: "tuition fees",
      },
      {
        url: "https://www.uni.example/nieuws/2018/03/collegegeld-stijgt",
        title: "Collegegeld stijgt",
        snippet: "tuition fees",
      },
    ]);
    const found = await discoverBySearch({
      ...base,
      website: "https://www.uni.example/",
      search,
      fetchHtml: async () => "",
    });
    expect(found.fees).toEqual(["https://www.uni.example/studeren/collegegeld-2025-2026"]);
  });

  it("asks a shared question once even when two programmes ask it at the same moment", async () => {
    let calls = 0;
    const search: SearchProvider = {
      name: "fake",
      search: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        return [];
      },
    };
    const memo = new Map<string, Promise<SearchHit[]>>();
    await Promise.all([
      discoverBySearch({ ...base, website: "https://www.uni.example/", search, memo }),
      discoverBySearch({
        ...base,
        name: "Nursing",
        website: "https://www.uni.example/",
        search,
        memo,
      }),
    ]);
    // 2 programme questions + 1 fee question + 1 admission question
    expect(calls).toBe(4);
  });
});

describe("sameSite and government hosts", () => {
  it("does not treat every *.gouv.fr host as one site", () => {
    expect(
      sameSite(
        "https://www.enseignementsup-recherche.gouv.fr/a",
        "https://www.interieur.gouv.fr/b",
      ),
    ).toBe(false);
    expect(
      sameSite("https://www.interieur.gouv.fr/a", "https://immigration.interieur.gouv.fr/b"),
    ).toBe(true);
  });
});

describe("a failed search is not remembered", () => {
  it("lets the next programme of the institution ask again", async () => {
    let calls = 0;
    const search: SearchProvider = {
      name: "fake",
      search: async () => {
        calls++;
        if (calls === 1) throw new Error("search failed");
        return [];
      },
    };
    const memo = new Map<string, Promise<SearchHit[]>>();
    const input = {
      name: "Applied Data Science",
      institution: "Uni Example",
      country: "NL",
      website: "https://www.uni.example/",
      search,
      memo,
    };
    await expect(discoverBySearch(input)).rejects.toThrow("search failed");
    await expect(discoverBySearch(input)).resolves.toBeDefined();
  });
});
