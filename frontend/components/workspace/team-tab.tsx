"use client";

import { parseServerTime } from "@/lib/format";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/lib/workspaces";
import { ApiError } from "@/lib/api";
import type { MemberRole } from "@/lib/types";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function AddTeammateDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"editor" | "viewer">("editor");
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const create = useCreateInvite(workspaceId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const invite = await create.mutateAsync({ email, role });
      setLink(invite.invite_link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  function reset() {
    setOpen(false);
    setEmail("");
    setRole("editor");
    setError(null);
    setLink(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <Button size="sm">+ Add Teammate</Button>
      </DialogTrigger>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite created</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                Share this link &mdash; it works even if email isn&apos;t set up.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={link} className="text-xs" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={reset}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Add teammate</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v: string) => setRole(v as "editor" | "viewer")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Sending…" : "Create invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeamTab({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const { data: members } = useMembers(workspaceId);
  const { data: invites } = useInvites(workspaceId);
  const updateRole = useUpdateMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);

  async function onRoleChange(memberId: string, role: MemberRole) {
    try {
      await updateRole.mutateAsync({ memberId, role });
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update role.");
    }
  }

  async function onRemove(memberId: string) {
    try {
      await removeMember.mutateAsync(memberId);
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove member.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddTeammateDialog workspaceId={workspaceId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
              </div>
              {isOwner ? (
                <div className="flex items-center gap-2">
                  <Select value={m.role} onValueChange={(v: string) => onRoleChange(m.id, v as MemberRole)}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(m.id)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary">{m.role}</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {invites && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                <div>
                  <p>{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.role} &middot; expires {parseServerTime(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(inv.invite_link);
                    toast.success("Copied");
                  }}
                >
                  Copy link
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
