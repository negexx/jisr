import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";

const classesOf = (value: string) => value.split(/\s+/);

describe("buttonVariants", () => {
  it("keeps the outline border colour and drops the transparent base border", () => {
    const classes = classesOf(buttonVariants({ variant: "outline" }));
    expect(classes).toContain("border-input");
    expect(classes).not.toContain("border-transparent");
  });

  it("keeps the base border for variants that do not set one", () => {
    expect(classesOf(buttonVariants({ variant: "default" }))).toContain("border-transparent");
  });

  it("lets a caller class win over the variant", () => {
    const classes = classesOf(
      buttonVariants({ variant: "outline", size: "default", className: "h-9" }),
    );
    expect(classes).toContain("h-9");
    expect(classes).not.toContain("h-12");
  });
});
