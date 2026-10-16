import type { Page } from "@playwright/test";

export type RecordedRequest = {
  url: string;
  method: string;
  postData: string | null;
  resourceType: string;
};
export type RecordedResponse = {
  url: string;
  status: number;
  headers: ReadonlyArray<{ name: string; value: string }>;
};
export type RecordedRequestHeaders = { url: string; headers: Record<string, string> };
export type RecordedConsole = { type: string; text: string };

export type Traffic = {
  requests: RecordedRequest[];
  consoleMessages: RecordedConsole[];
  responses(): Promise<RecordedResponse[]>;
  requestHeaders(): Promise<RecordedRequestHeaders[]>;
};

// Everything the page asks for and everything it hears back, from the first navigation on.
export function recordTraffic(page: Page): Traffic {
  const requests: RecordedRequest[] = [];
  const consoleMessages: RecordedConsole[] = [];
  const pending: Array<Promise<RecordedResponse | null>> = [];
  const pendingHeaders: Array<Promise<RecordedRequestHeaders | null>> = [];

  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
      resourceType: request.resourceType(),
    });
    // A request still in flight when the test ends rejects with "Test ended"; drop that entry below
    // instead of letting the rejection fail the caller's Promise.all.
    pendingHeaders.push(
      request
        .allHeaders()
        .then((headers) => ({ url: request.url(), headers }))
        .catch(() => null),
    );
  });
  page.on("response", (response) => {
    pending.push(
      response
        .headersArray()
        .then((headers) => ({ url: response.url(), status: response.status(), headers }))
        .catch(() => null),
    );
  });
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    consoleMessages.push({ type: "pageerror", text: error.message });
  });

  return {
    requests,
    consoleMessages,
    // Entries that could not be read (a request or response still in flight when the test ended)
    // are dropped, so a test that finishes with network activity pending is not failed by the
    // recorder; what it did request is still in `requests`.
    responses: async () =>
      (await Promise.all(pending)).filter((entry): entry is RecordedResponse => entry !== null),
    requestHeaders: async () =>
      (await Promise.all(pendingHeaders)).filter(
        (entry): entry is RecordedRequestHeaders => entry !== null,
      ),
  };
}
