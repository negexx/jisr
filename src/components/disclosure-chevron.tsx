import { ChevronDown, ChevronRight } from "lucide-react";

// Must be a direct child of the <summary> of a native <details>: the open state is read from that parent, so nested disclosures never affect each other. Closed points to the inline end (mirrored in RTL), open points down.
export function DisclosureChevron() {
  return (
    <>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 rtl:rotate-180 [details[open]>summary>&]:hidden"
      />
      <ChevronDown
        aria-hidden="true"
        className="hidden size-4 shrink-0 [details[open]>summary>&]:block"
      />
    </>
  );
}

export const DISCLOSURE_SUMMARY_CLASS =
  "flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-primary font-medium md:min-h-8 [&::-webkit-details-marker]:hidden";
