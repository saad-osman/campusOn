"use client";

/*
 * "Waking up the server" (lib/backend-status.ts). While the API is unreachable, pages show
 * this card instead of blank sections; the page itself stays mounted underneath (so a
 * half-filled form keeps its values) and data refetches as soon as the server answers.
 * The home page is exempt: it needs no data, and its own check wakes the server early.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { LatticeLoader } from "@/components/motion/lattice-loader";
import { checkBackend, onBackendRecovered, useBackendStatus } from "@/lib/backend-status";

/** A check slower than this already means a sleeping server: show the card, don't wait out the timeout. */
const SLOW_CHECK_MS = 2_500;
const EXEMPT = new Set(["/"]);

export function BackendGate({ children }: { children: React.ReactNode }) {
  const status = useBackendStatus();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    void checkBackend();
  }, []);

  React.useEffect(() => onBackendRecovered(() => void qc.invalidateQueries()), [qc]);

  React.useEffect(() => {
    if (status !== "checking") {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_CHECK_MS);
    return () => clearTimeout(t);
  }, [status]);

  const blocking = !EXEMPT.has(pathname) && (status === "waking" || status === "down" || (status === "checking" && slow));

  return (
    <>
      {blocking && <ServerWaking down={status === "down"} />}
      <div hidden={blocking}>{children}</div>
    </>
  );
}

function ServerWaking({ down }: { down: boolean }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-16">
      <Card>
        <CardHeader className="gap-3">
          {/* The lattice and the verb sit side by side; the stopwatch follows and freezes on give-up. */}
          <LatticeLoader
            status={down ? "error" : "working"}
            label="Waking up the server"
            errorLabel="Not responding after"
            pattern="orbit"
            grid={3}
            shape="round"
            cellSize={6}
            gap={2}
            fontSize={18}
            errorColor="var(--color-rose-500)"
            className="font-heading font-semibold text-foreground"
          />
          <CardDescription>
            {down
              ? "It may be restarting. Try again in a minute."
              : "Lodestar's free hosting sleeps when nobody's using it. This usually takes under a minute, and the page carries on by itself."}
          </CardDescription>
        </CardHeader>
        {down && (
          <CardContent>
            <Button onClick={() => void checkBackend()} className="w-full">
              Try again
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
