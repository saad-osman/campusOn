import { redirect } from "next/navigation";

/** Settings lives in sections; the profile is the first one. */
export default function SettingsPage() {
  redirect("/settings/profile");
}
