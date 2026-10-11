import type { ReactNode } from "react";

export function GuideSteps({ children }: { children?: ReactNode }) {
  return (
    <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-base text-secondary-foreground">
      {children}
    </ol>
  );
}
