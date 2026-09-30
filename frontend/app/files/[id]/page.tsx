"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/auth";
import { usePatchState } from "@/lib/state";
import { useWorkspace } from "@/lib/workspaces";
import { OverviewTab } from "@/components/workspace/overview-tab";
import { DocumentsTab } from "@/components/workspace/documents-tab";
import { TeamTab } from "@/components/workspace/team-tab";
import { ActivityTab } from "@/components/workspace/activity-tab";

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: workspace, isLoading, error } = useWorkspace(workspaceId);
  const patchState = usePatchState();
  const tracked = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!userLoading && !user) router.replace(`/login?next=/files/${workspaceId}`);
  }, [user, userLoading, router, workspaceId]);

  React.useEffect(() => {
    if (user && tracked.current !== workspaceId) {
      tracked.current = workspaceId;
      patchState.mutate({ last_route: `/files/${workspaceId}`, last_workspace_id: workspaceId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, workspaceId]);

  if (userLoading || !user || isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  if (error || !workspace) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        This Application File doesn&apos;t exist, or you don&apos;t have access to it.
      </div>
    );
  }

  const canEdit = workspace.my_role === "owner" || workspace.my_role === "editor";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{workspace.icon}</span>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {workspace.name}
            {workspace.archived && <Badge variant="outline">archived</Badge>}
          </h1>
          {workspace.description && <p className="text-sm text-muted-foreground">{workspace.description}</p>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab workspace={workspace} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab workspaceId={workspace.id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <TeamTab workspaceId={workspace.id} isOwner={workspace.my_role === "owner"} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab workspaceId={workspace.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
