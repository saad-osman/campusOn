import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

async function getHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<{ status: string; app: string; demo_mode: boolean }>;
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">ScholarRadar</h1>
      <p className="max-w-xl text-muted-foreground">
        From discovery to a submitted application: what exists, what you&apos;re eligible for,
        who to contact, and what to send &mdash; with your teammates.
      </p>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Backend status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          {health ? (
            <>
              <span className="text-muted-foreground">{health.app} API</span>
              <div className="flex gap-2">
                <Badge variant="secondary">{health.status}</Badge>
                {health.demo_mode && <Badge variant="outline">demo mode</Badge>}
              </div>
            </>
          ) : (
            <span className="text-destructive">
              Backend unreachable at {API_URL} &mdash; is uvicorn running?
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
