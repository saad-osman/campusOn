"use client";

import { useActivity } from "@/lib/workspaces";

const ACTION_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  workspace_created: () => "created this Application File",
  workspace_updated: () => "updated the details",
  workspace_duplicated: () => "duplicated this Application File",
  member_role_changed: (m) => `changed a member's role to ${m.role}`,
  member_removed: () => "removed a member",
  invite_created: (m) => `invited ${m.email}`,
  invite_accepted: (m) => `joined as ${m.role}`,
  document_created: (m) => `created the document "${m.title}"`,
  document_edited: (m) => `edited "${m.title}"`,
  document_restored: (m) => `restored a previous version of a document`,
};

export function ActivityTab({ workspaceId }: { workspaceId: string }) {
  const { data: activity, isLoading } = useActivity(workspaceId, { refetchInterval: 10_000 });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading&hellip;</p>;
  if (!activity || activity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {activity.map((a) => {
        const describe = ACTION_LABELS[a.action];
        return (
          <div key={a.id} className="flex items-baseline justify-between border-b py-2.5 text-sm last:border-0">
            <span>
              <span className="font-medium">{a.user_name}</span>{" "}
              <span className="text-muted-foreground">{describe ? describe(a.meta) : a.action}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
