// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsLoader } from "@/components/analytics-loader";

const URL = "https://jisr.goatcounter.com/count";
const COUNT_JS = "https://gc.zgo.at/count.v5.js";
// Published at https://www.goatcounter.com/help/countjs-versions and re-computed from the downloaded
// file with `openssl dgst -sha384 -binary count.v5.js | openssl base64 -A`.
const COUNT_JS_INTEGRITY =
  "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

function scriptBody(): string {
  const html = renderToStaticMarkup(<AnalyticsLoader goatCounterUrl={URL} />);
  return html.replace(/^<script>/, "").replace(/<\/script>$/, "");
}

function runLoader(): void {
  new Function(scriptBody())();
}

function setReadyState(value: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value, configurable: true });
}

function setNavigatorProperty(name: "doNotTrack" | "globalPrivacyControl", value: unknown): void {
  Object.defineProperty(navigator, name, { value, configurable: true });
}

function countJsScripts(): number {
  return document.head.querySelectorAll(`script[src="${COUNT_JS}"]`).length;
}

// jsdom has no requestIdleCallback; remember what is there so every test starts from the same place.
const originalIdle = Object.getOwnPropertyDescriptor(window, "requestIdleCallback");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalIdle) Object.defineProperty(window, "requestIdleCallback", originalIdle);
  else Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(document, "readyState");
  Reflect.deleteProperty(navigator, "doNotTrack");
  Reflect.deleteProperty(navigator, "globalPrivacyControl");
  Reflect.deleteProperty(window, "__jisrAnalytics");
  Reflect.deleteProperty(window, "__jisrEvents");
  Reflect.deleteProperty(window, "goatcounter");
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
    expect(html).toContain(COUNT_JS);
    expect(html).not.toContain("gc.zgo.at/count.js");
    expect(html).toContain(COUNT_JS_INTEGRITY);
    expect(html).toContain("anonymous");
    expect(html).toContain("requestIdleCallback");
    expect(html).toContain("__jisrAnalytics");
  });
});

describe("AnalyticsLoader script", () => {
  it("enables tracking at once but adds count.js only after load and idle", () => {
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    setReadyState("loading");
    runLoader();
    expect(window.__jisrAnalytics).toBe(true);
    expect(window.goatcounter).toEqual({ endpoint: URL });
    expect(countJsScripts()).toBe(0);
    expect(idle).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect(countJsScripts()).toBe(0);

    idle.mock.calls[0]?.[0]();
    const added = document.head.querySelector("script");
    expect(added?.getAttribute("src")).toBe(COUNT_JS);
    expect(added?.getAttribute("data-goatcounter")).toBe(URL);
    expect(added?.getAttribute("integrity")).toBe(COUNT_JS_INTEGRITY);
    expect(added?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("flushes events queued before count.js loaded, once count exists", () => {
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    setReadyState("complete");
    runLoader();
    window.__jisrEvents = ["matches-viewed"];
    idle.mock.calls[0]?.[0]();
    const count = vi.fn();
    window.goatcounter = { count };
    document.head.querySelector("script")?.dispatchEvent(new Event("load"));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ path: "matches-viewed", event: true });
    expect(window.__jisrEvents).toEqual([]);
  });

  it("falls back to a 2 second timer when requestIdleCallback is missing", () => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, "requestIdleCallback");
    setReadyState("complete");
    runLoader();
    vi.advanceTimersByTime(1999);
    expect(countJsScripts()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(countJsScripts()).toBe(1);
  });

  it("does nothing when it runs a second time: one count.js, settings untouched", () => {
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    setReadyState("complete");
    runLoader();
    const settings = window.goatcounter;
    window.__jisrEvents = ["plan-opened"];
    runLoader();
    expect(window.goatcounter).toBe(settings);
    expect(window.__jisrEvents).toEqual(["plan-opened"]);
    expect(idle).toHaveBeenCalledTimes(1);
    for (const call of idle.mock.calls) call[0]();
    expect(countJsScripts()).toBe(1);
  });
});

describe("AnalyticsLoader privacy signals", () => {
  it.each([
    ["Do Not Track", "doNotTrack", "1"],
    ["Global Privacy Control", "globalPrivacyControl", true],
  ] as const)("stays off for %s: nothing is enabled, queued or loaded", (_label, name, value) => {
    vi.useFakeTimers();
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    setReadyState("complete");
    setNavigatorProperty(name, value);
    runLoader();
    vi.advanceTimersByTime(10_000);
    expect(window.__jisrAnalytics).toBeUndefined();
    expect(window.goatcounter).toBeUndefined();
    expect(idle).not.toHaveBeenCalled();
    expect(countJsScripts()).toBe(0);
  });

  it("still loads when Do Not Track is explicitly off", () => {
    const idle = vi.fn();
    window.requestIdleCallback = idle;
    setReadyState("complete");
    setNavigatorProperty("doNotTrack", "0");
    runLoader();
    expect(window.__jisrAnalytics).toBe(true);
  });
});
