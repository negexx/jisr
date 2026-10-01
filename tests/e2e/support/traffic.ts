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
  const pending: Array<Promise<RecordedResponse>> = [];
  const pendingHeaders: Array<Promise<RecordedRequestHeaders>> = [];

  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
      resourceType: request.resourceType(),
    });
    pendingHeaders.push(request.allHeaders().then((headers) => ({ url: request.url(), headers })));
  });
  page.on("response", (response) => {
    pending.push(
      response
        .headersArray()
        .then((headers) => ({ url: response.url(), status: response.status(), headers })),
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
    responses: () => Promise.all(pending),
    requestHeaders: () => Promise.all(pendingHeaders),
  };
}
