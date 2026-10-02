import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The link may be old, or the opportunity may have been removed after a re-check.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/discover">Discover opportunities</Link>
        </Button>
      </div>
    </div>
  );
}
