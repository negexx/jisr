// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsLoader } from "@/components/analytics-loader";

const URL = "https://jisr.goatcounter.com/count";

function scriptBody(): string {
  const html = renderToStaticMarkup(<AnalyticsLoader goatCounterUrl={URL} />);
  return html.replace(/^<script>/, "").replace(/<\/script>$/, "");
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__jisrAnalytics;
  delete window.__jisrEvents;
  delete window.goatcounter;
  document.head.innerHTML = "";
});

describe("AnalyticsLoader markup", () => {
  it("renders nothing without a url", () => {
    expect(renderToStaticMarkup(<AnalyticsLoader goatCounterUrl={null} />)).toBe("");
  });

  it("renders one inline script that loads count.js from the official host when idle", () => {
    const html = renderToStaticMarkup(<AnalyticsLoader goatCounterUrl={URL} />);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).toContain(URL);
    expect(html).toContain("https://gc.zgo.at/count.js");
    expect(html).toContain("requestIdleCallback");
    expect(html).toContain("__jisrAnalytics");
  });
});

describe("AnalyticsLoader script", () => {
  it("enables tracking at once but adds count.js only after load and idle", () => {
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    window.requestIdleCallback = idle;
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    new Function(scriptBody())();
    expect(window.__jisrAnalytics).toBe(true);
    expect(window.goatcounter).toEqual({ endpoint: URL });
    expect(document.head.querySelector("script")).toBeNull();
    expect(idle).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect(document.head.querySelector("script")).toBeNull();

    idle.mock.calls[0]?.[0]();
    const added = document.head.querySelector("script");
    expect(added?.getAttribute("src")).toBe("https://gc.zgo.at/count.js");
    expect(added?.getAttribute("data-goatcounter")).toBe(URL);
    delete (document as { readyState?: string }).readyState;
  });

  it("flushes events queued before count.js loaded, once count exists", () => {
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    new Function(scriptBody())();
    window.__jisrEvents = ["matches-viewed"];
    idle.mock.calls[0]?.[0]();
    const count = vi.fn();
    window.goatcounter = { count };
    document.head.querySelector("script")?.dispatchEvent(new Event("load"));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ path: "matches-viewed", event: true });
    expect(window.__jisrEvents).toEqual([]);
    delete (document as { readyState?: string }).readyState;
  });
});
