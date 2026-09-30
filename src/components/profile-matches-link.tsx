"use client";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useProfile } from "@/lib/profile/use-profile";

// Loaded lazily by HomeMatchesLink: validating the stored profile pulls the Zod schema, which the
// home page's initial JavaScript must not carry.
export function ProfileMatchesLink({ label }: { label: string }) {
  const { state } = useProfile();
  if (state.status !== "ok") return null;
  return (
    <Button asChild variant="outline" className="w-full sm:w-auto">
      <Link href="/matches">{label}</Link>
    </Button>
  );
}
