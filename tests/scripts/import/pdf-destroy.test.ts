import { describe, expect, it, vi } from "vitest";

import { makePdf } from "./pdf-fixture";

const destroyed = vi.hoisted(() => ({ count: 0, failExtraction: false }));

// Wraps the real unpdf so the loading task's destroy() (what releases the document and its worker)
// can be observed.
vi.mock("unpdf", async (importActual) => {
  const actual = await importActual<typeof import("unpdf")>();
  return {
    ...actual,
    getDocumentProxy: async (...args: Parameters<typeof actual.getDocumentProxy>) => {
      const pdf = await actual.getDocumentProxy(...args);
      const destroy = pdf.loadingTask.destroy.bind(pdf.loadingTask);
      pdf.loadingTask.destroy = async () => {
        destroyed.count++;
        await destroy();
      };
      return pdf;
    },
    extractText: async (...args: Parameters<typeof actual.extractText>) => {
      if (destroyed.failExtraction) throw new Error("extraction failed");
      return actual.extractText(...args);
    },
  };
});

describe("pdfBytesToText releases the document", () => {
  it("destroys the document proxy after extracting", async () => {
    const { pdfBytesToText } = await import("../../../scripts/import/pdf");
    destroyed.count = 0;
    await pdfBytesToText(makePdf("Tuition fee: EUR 1,500 per semester"));
    expect(destroyed.count).toBe(1);
  });

  it("destroys it even when the extraction fails", async () => {
    const { pdfBytesToText } = await import("../../../scripts/import/pdf");
    destroyed.count = 0;
    destroyed.failExtraction = true;
    await expect(pdfBytesToText(makePdf("anything"))).rejects.toThrow(/extraction failed/);
    destroyed.failExtraction = false;
    expect(destroyed.count).toBe(1);
  });
});
