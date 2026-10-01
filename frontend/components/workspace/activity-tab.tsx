"use client";

import { parseServerTime } from "@/lib/format";
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
  document_restored: () => "restored a previous version of a document",
  tracker_added: (m) => `added "${m.title}" to the tracker`,
  tracker_moved: (m) => `moved "${m.title}" to ${String(m.status).replace("_", " ")}`,
  tracker_assigned: (m) => `assigned "${m.title}" to ${m.assignee_name}`,
  tracker_removed: (m) => `removed "${m.title}" from the tracker`,
  outcome_recorded: (m) => `recorded "${m.result}" for "${m.title}"`,
  kit_generated: (m) => `generated an application kit for "${m.title}"`,
  ai_draft_created: (m) => `generated an AI draft: "${m.title}"`,
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
              {parseServerTime(a.created_at).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
