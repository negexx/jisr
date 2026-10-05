import { describe, expect, it } from "vitest";

import { unicodeHostname } from "@/lib/punycode";

describe("unicodeHostname", () => {
  it("decodes xn-- labels and keeps the other labels", () => {
    expect(unicodeHostname("www.xn--bafg-7qa.de")).toBe("www.bafög.de");
    expect(unicodeHostname("xn--mnchen-3ya.de")).toBe("münchen.de");
    expect(unicodeHostname("xn--e1afmkfd.xn--p1ai")).toBe("пример.рф");
  });

  it("leaves ASCII hostnames unchanged", () => {
    expect(unicodeHostname("www.campusfrance.org")).toBe("www.campusfrance.org");
  });

  it("keeps a label it cannot decode as it was written", () => {
    expect(unicodeHostname("xn--.example.org")).toBe("xn--.example.org");
    expect(unicodeHostname("xn--a-.example.org")).toBe("xn--a-.example.org");
    expect(unicodeHostname("xn--99999999999999.example.org")).toBe(
      "xn--99999999999999.example.org",
    );
  });
});
