import type { ReactNode } from "react";

// The aside comes first in the DOM so the phone shows the profile strip on top and the tab order is
// the same in every direction; from lg it moves to a sticky second column (about 720px for the list).
export function MatchesLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">{aside}</div>
      <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">{children}</div>
    </div>
  );
}
