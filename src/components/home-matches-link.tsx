"use client";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useProfile } from "@/lib/profile/use-profile";

// The wrapper always holds the button's height, so the link appearing after hydration moves nothing.
export function HomeMatchesLink({ label }: { label: string }) {
  const { state } = useProfile();
  return (
    <div className="min-h-12">
      {state.status === "ok" ? (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/matches">{label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
