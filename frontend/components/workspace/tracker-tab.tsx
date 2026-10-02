"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPlus, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { DeadlineBadge } from "@/components/opportunity/deadline-badge";
import { EligibilityPill } from "@/components/opportunity/eligibility-badge";
import {
  useAddToTracker,
  useDeleteTrackerItem,
  usePatchTrackerItem,
  useRecordOutcome,
  useReorderTracker,
  useTracker,
} from "@/lib/actions";
import { useSavedOpportunities } from "@/lib/opportunities";
import { useMembers } from "@/lib/workspaces";
import type { TrackerItem, TrackerStatus, WorkspaceMember } from "@/lib/types";

const COLUMNS: { id: TrackerStatus; label: string; tone: string }[] = [
  { id: "saved", label: "Saved", tone: "bg-slate-400" },
  { id: "preparing", label: "Preparing", tone: "bg-sky-500" },
  { id: "submitted", label: "Submitted", tone: "bg-gold" },
  { id: "accepted", label: "Accepted", tone: "bg-emerald-500" },
  { id: "rejected", label: "Rejected", tone: "bg-rose-500" },
];

type Board = Record<TrackerStatus, TrackerItem[]>;

function toBoard(items: TrackerItem[]): Board {
  const board = { saved: [], preparing: [], submitted: [], accepted: [], rejected: [] } as Board;
  for (const item of [...items].sort((a, b) => a.position - b.position)) board[item.status].push(item);
  return board;
}

function findColumn(board: Board, id: string): TrackerStatus | null {
  if (id in board) return id as TrackerStatus;
  return (Object.keys(board) as TrackerStatus[]).find((col) => board[col].some((i) => i.id === id)) ?? null;
}

function AssigneeMenu({ item, members, canEdit, workspaceId }: { item: TrackerItem; members: WorkspaceMember[]; canEdit: boolean; workspaceId: string }) {
  const patch = usePatchTrackerItem(workspaceId);
  const avatar = (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
        item.assignee_name ? "bg-primary text-primary-foreground" : "border border-dashed text-muted-foreground"
      )}
      title={item.assignee_name ? `Assigned to ${item.assignee_name}` : "Unassigned"}
    >
      {item.assignee_name ? initials(item.assignee_name) : "+"}
    </span>
  );
  if (!canEdit) return avatar;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Assign teammate" onPointerDown={(e) => e.stopPropagation()}>
          {avatar}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        {members.map((m) => (
          <DropdownMenuItem
            key={m.user_id}
            onClick={async () => {
              await patch.mutateAsync({ id: item.id, assignee_id: m.user_id });
              toast.success(`Assigned to ${m.name}`);
            }}
          >
            {m.name} {m.user_id === item.assignee_id && "✓"}
          </DropdownMenuItem>
        ))}
        {item.assignee_id && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => patch.mutate({ id: item.id, assignee_id: null })}>Unassign</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardBody({ item, members, canEdit, workspaceId, handle }: {
  item: TrackerItem; members: WorkspaceMember[]; canEdit: boolean; workspaceId: string; handle?: React.ReactNode;
}) {
  const remove = useDeleteTrackerItem(workspaceId);
  const opp = item.opportunity;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-start gap-1.5">
        {handle}
        <div className="min-w-0 flex-1">
          {opp ? (
            <Link href={`/opportunities/${opp.id}`} className="font-medium leading-snug hover:underline" onPointerDown={(e) => e.stopPropagation()}>
              {opp.title}
            </Link>
          ) : (
            <span className="font-medium text-muted-foreground">Opportunity removed</span>
          )}
          {opp && <p className="truncate text-xs text-muted-foreground">{opp.organization}</p>}
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Card actions" className="rounded p-0.5 text-muted-foreground hover:bg-muted" onPointerDown={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {opp?.deadline && (
                <DropdownMenuItem asChild>
                  <a href={`/api/opportunities/${opp.id}/calendar.ics`} download>Export to calendar</a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  await remove.mutateAsync(item.id);
                  toast.success("Removed from tracker");
                }}
              >
                Remove from tracker
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {opp && <DeadlineBadge deadline={opp.deadline} deadlineText={opp.deadline_text} />}
          {opp?.eligibility_verdict && <EligibilityPill verdict={opp.eligibility_verdict} className="px-1.5 py-0 text-[10px]" />}
        </div>
        <AssigneeMenu item={item} members={members} canEdit={canEdit} workspaceId={workspaceId} />
      </div>
    </div>
  );
}

function SortableCard(props: { item: TrackerItem; members: WorkspaceMember[]; canEdit: boolean; workspaceId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    disabled: !props.canEdit,
  });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")}>
      <CardBody
        {...props}
        handle={
          props.canEdit ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Move ${props.item.opportunity?.title ?? "card"}`}
              className="-ml-1 mt-0.5 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          ) : undefined
        }
      />
    </li>
  );
}

function Column({ id, label, tone, items, children }: { id: TrackerStatus; label: string; tone: string; items: TrackerItem[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} column`}
      className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2 md:w-auto md:min-w-0 md:flex-1", isOver && "ring-2 ring-primary/40")}
    >
      <h3 className="flex items-center gap-2 px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("size-2 rounded-full", tone)} aria-hidden />
        {label}
        <span className="ml-auto tabular-nums">{items.length}</span>
      </h3>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-col gap-2">{children}</ul>
      </SortableContext>
    </section>
  );
}

function OutcomeDialog({ item, status, workspaceId, onClose }: { item: TrackerItem | null; status: TrackerStatus | null; workspaceId: string; onClose: () => void }) {
  const record = useRecordOutcome();
  const [result, setResult] = React.useState<"accepted" | "rejected" | "waitlisted">("accepted");
  const [share, setShare] = React.useState(false);
  React.useEffect(() => {
    if (status === "accepted" || status === "rejected") setResult(status);
  }, [status]);
  if (!item?.opportunity) return null;
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record the outcome?</DialogTitle>
          <DialogDescription>
            {item.opportunity.title}. Outcomes help BPDC see what works; sharing is anonymous and optional.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={result} onValueChange={(v: string) => setResult(v as typeof result)} className="gap-2">
          {(["accepted", "waitlisted", "rejected"] as const).map((r) => (
            <div key={r} className="flex items-center gap-2">
              <RadioGroupItem id={`outcome-${r}`} value={r} />
              <Label htmlFor={`outcome-${r}`} className="font-normal capitalize">{r}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex items-start gap-2">
          <Checkbox id="outcome-share" checked={share} onCheckedChange={(v) => setShare(v === true)} />
          <Label htmlFor="outcome-share" className="font-normal leading-snug">
            Share anonymously as a success story (e.g. &ldquo;3 BPDC students were accepted to DAAD RISE&rdquo;)
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Skip</Button>
          <Button
            disabled={record.isPending}
            onClick={async () => {
              await record.mutateAsync({ opportunity_id: item.opportunity!.id, result, share_anonymously: share, workspace_id: workspaceId });
              toast.success("Outcome recorded. Thank you!");
              onClose();
            }}
          >
            Save outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFromSaved({ workspaceId, tracked }: { workspaceId: string; tracked: Set<string> }) {
  const [open, setOpen] = React.useState(false);
  const { data: saved } = useSavedOpportunities();
  const add = useAddToTracker();
  const options = (saved ?? []).filter((o) => !tracked.has(o.id));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add opportunity
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to tracker</DialogTitle>
          <DialogDescription>Pick from your saved opportunities, or open any opportunity and use &ldquo;Add to file&rdquo;.</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing saved that isn&apos;t already here. <Link href="/discover" className="underline">Find opportunities</Link>.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={async () => {
                    await add.mutateAsync({ workspaceId, opportunityId: o.id });
                    toast.success(`Added “${o.title}”`);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.organization}</span>
                  </span>
                  <Plus className="size-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TrackerTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [dragging, setDragging] = React.useState<TrackerItem | null>(null);
  const { data: items, isLoading } = useTracker(workspaceId, { refetchInterval: dragging ? undefined : 10_000 });
  const { data: members } = useMembers(workspaceId);
  const reorder = useReorderTracker(workspaceId);
  const [board, setBoard] = React.useState<Board>(() => toBoard([]));
  const [outcomeFor, setOutcomeFor] = React.useState<{ item: TrackerItem; status: TrackerStatus } | null>(null);
  const startColumn = React.useRef<TrackerStatus | null>(null);

  React.useEffect(() => {
    if (items && !dragging) setBoard(toBoard(items));
  }, [items, dragging]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragStart(e: DragStartEvent) {
    const col = findColumn(board, String(e.active.id));
    startColumn.current = col;
    setDragging(col ? board[col].find((i) => i.id === e.active.id) ?? null : null);
  }

  function onDragOver(e: DragOverEvent) {
    if (!e.over) return;
    const from = findColumn(board, String(e.active.id));
    const to = findColumn(board, String(e.over.id));
    if (!from || !to || from === to) return;
    setBoard((b) => {
      const moving = b[from].find((i) => i.id === e.active.id);
      if (!moving) return b;
      const overIndex = b[to].findIndex((i) => i.id === e.over!.id);
      const target = [...b[to]];
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, { ...moving, status: to });
      return { ...b, [from]: b[from].filter((i) => i.id !== e.active.id), [to]: target };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const col = findColumn(board, activeId);
    let next = board;
    if (col && e.over) {
      const oldIndex = board[col].findIndex((i) => i.id === activeId);
      const newIndex = board[col].findIndex((i) => i.id === e.over!.id);
      if (newIndex >= 0 && oldIndex !== newIndex) {
        next = { ...board, [col]: arrayMove(board[col], oldIndex, newIndex) };
        setBoard(next);
      }
    }
    const from = startColumn.current;
    setDragging(null);
    if (!col) return;
    const columns: Partial<Record<TrackerStatus, string[]>> = { [col]: next[col].map((i) => i.id) };
    if (from && from !== col) columns[from] = next[from].map((i) => i.id);
    reorder.mutate(columns, { onError: () => toast.error("Couldn't save the move. Refreshing the board.") });
    const moved = next[col].find((i) => i.id === activeId);
    if (moved && from !== col && (col === "accepted" || col === "rejected")) setOutcomeFor({ item: moved, status: col });
  }

  const tracked = new Set((items ?? []).map((i) => i.opportunity_id).filter(Boolean) as string[]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {canEdit ? "Drag cards between columns (or use the grip with Space and arrow keys)." : "You have view-only access to this tracker."}
        </p>
        <div className="flex gap-2">
          {canEdit && <AddFromSaved workspaceId={workspaceId} tracked={tracked} />}
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/workspaces/${workspaceId}/calendar.ics`} download>
              <CalendarPlus /> Export to calendar
            </a>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-3" aria-hidden>
          {COLUMNS.map((c) => <div key={c.id} className="h-40 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {COLUMNS.map((c) => (
              <Column key={c.id} {...c} items={board[c.id]}>
                {board[c.id].length === 0 && (
                  <li className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    {c.id === "saved" && canEdit ? "Add opportunities to start" : "Empty"}
                  </li>
                )}
                {board[c.id].map((item) => (
                  <SortableCard key={item.id} item={item} members={members ?? []} canEdit={canEdit} workspaceId={workspaceId} />
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {dragging ? <div className="w-72 rotate-2"><CardBody item={dragging} members={members ?? []} canEdit={false} workspaceId={workspaceId} /></div> : null}
          </DragOverlay>
        </DndContext>
      )}

      <OutcomeDialog item={outcomeFor?.item ?? null} status={outcomeFor?.status ?? null} workspaceId={workspaceId} onClose={() => setOutcomeFor(null)} />
    </div>
  );
}
