"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, CheckCircle2, LogOut, ShieldCheck, SunMoon, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/lib/auth";
import { initials } from "@/lib/format";
import { profileCompleteness, useProfile } from "@/lib/profile";
import type { User } from "@/lib/types";

const ITEM_ICON = "size-4 text-muted-foreground";

/** Students: how complete the profile is, linking to it; "Profile complete" at 100%. */
function Completeness() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  const { percent } = profileCompleteness(profile);
  if (percent === 100) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Profile complete
      </p>
    );
  }
  return (
    <DropdownMenuItem asChild className="mt-2 -mx-1 flex-col items-stretch gap-1.5 px-2 py-1.5">
      <Link href="/settings/profile">
        <span className="flex items-center justify-between text-xs">
          <span>Profile {percent}% complete</span>
          <span className="text-muted-foreground">Finish</span>
        </span>
        <span className="block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full data-[state=open]:ring-2 data-[state=open]:ring-ring"
          aria-label="Account menu"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-honor" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-medium">{user.name}</span>
                {user.role !== "student" && (
                  <Badge variant="secondary" className="shrink-0 capitalize">
                    {user.role}
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {user.role === "student" && <Completeness />}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <UserRound className={ITEM_ICON} aria-hidden /> Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/notifications">
            <Bell className={ITEM_ICON} aria-hidden /> Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <ShieldCheck className={ITEM_ICON} aria-hidden /> Account &amp; access
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon className={ITEM_ICON} aria-hidden /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          // mutateAsync, not mutate's onSuccess: logging out unmounts this menu, and per-call
          // callbacks of an unmounted component never run.
          onClick={() => void logout.mutateAsync().then(() => router.push("/"), () => undefined)}
        >
          <LogOut className={ITEM_ICON} aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
