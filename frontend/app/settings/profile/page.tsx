"use client";

import * as React from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  AcademicsFields,
  BasicsFields,
  EnglishTestFields,
  LocationFields,
  SkillsInterestsFields,
} from "@/components/profile/profile-fields";
import { CvDropzone, CvSuggestionsReview } from "@/components/profile/cv-upload";
import {
  applySuggestion,
  EMPTY_PROFILE_FORM,
  formToPatch,
  profileToForm,
  validateProfileForm,
  type ProfileForm,
} from "@/components/profile/profile-form";
import { ApiError } from "@/lib/api";
import { useCurrentUser, useUpdateMe } from "@/lib/auth";
import { prefersReducedMotionNow } from "@/lib/motion";
import { useUploadCV } from "@/lib/opportunities";
import { profileCompleteness, useDeleteCV, usePatchProfile, useProfile } from "@/lib/profile";
import { useTrackRoute } from "@/lib/state";
import type { CVExtraction } from "@/lib/types";

const TITLE = "font-heading text-base";
const NAME_ID = "profile-name";

/** Scrolls a field into view and focuses it (used by the "missing" links). */
function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: prefersReducedMotionNow() ? "auto" : "smooth" });
  window.setTimeout(() => el.focus({ preventScroll: true }), prefersReducedMotionNow() ? 0 : 350);
}

function CompletenessCard({ profile }: { profile: Parameters<typeof profileCompleteness>[0] }) {
  const { percent, missing } = profileCompleteness(profile);
  if (percent === 100) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Your profile is complete. Eligibility verdicts and match scores use all of it.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className={TITLE}>Profile {percent}% complete</CardTitle>
        <CardDescription>A complete profile gives sharper eligibility verdicts and match scores.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Missing:</span>
          {missing.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => focusField(m.field)}
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfileSettingsPage() {
  useTrackRoute("/settings/profile");
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading } = useProfile();
  const patchProfile = usePatchProfile();
  const updateMe = useUpdateMe();
  const uploadCV = useUploadCV();
  const deleteCV = useDeleteCV();
  const isStudent = user?.role === "student";

  // The last saved state; the form is dirty when it differs from this.
  const [saved, setSaved] = React.useState<{ form: ProfileForm; name: string } | null>(null);
  const [form, setForm] = React.useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const [name, setName] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [extraction, setExtraction] = React.useState<CVExtraction | null>(null);
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (profile && user && !saved) {
      const initial = { form: profileToForm(profile), name: user.name };
      setSaved(initial);
      setForm(initial.form);
      setName(initial.name);
    }
  }, [profile, user, saved]);

  const nameChanged = !!saved && name.trim() !== saved.name;
  const formChanged = !!saved && JSON.stringify(form) !== JSON.stringify(saved.form);
  const dirty = nameChanged || formChanged;

  const fieldErrors = validateProfileForm(form);
  const nameError = name.trim().length === 0 ? "Enter your name." : name.trim().length > 80 ? "Use 80 characters or fewer." : undefined;
  const hasErrors = !!nameError || Object.keys(fieldErrors).length > 0;

  // Warn before leaving the page with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (hasErrors) {
      setShowErrors(true);
      toast.error("Fix the highlighted fields first.");
      return;
    }
    try {
      if (nameChanged) await updateMe.mutateAsync({ name: name.trim() });
      if (formChanged && isStudent) await patchProfile.mutateAsync(formToPatch(form));
      setSaved({ form, name: name.trim() });
      setName(name.trim());
      setShowErrors(false);
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save your profile.");
    }
  }

  function discard() {
    if (!saved) return;
    setForm(saved.form);
    setName(saved.name);
    setShowErrors(false);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = await uploadCV.mutateAsync(file);
      setExtraction(result);
      setAccepted(new Set());
      toast.success(`Read ${result.cv_filename}. Review what we found.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  if (isLoading || !profile || !user || !saved) {
    return (
      <div className="flex flex-col gap-6" aria-hidden>
        {[160, 260, 200].map((h) => (
          <div key={h} className="animate-pulse rounded-xl bg-muted" style={{ height: h }} />
        ))}
      </div>
    );
  }

  const errors = showErrors ? fieldErrors : {};
  const saving = updateMe.isPending || patchProfile.isPending;

  return (
    <>
      {isStudent && <CompletenessCard profile={profile} />}

      <Card>
        <CardHeader>
          <CardTitle className={TITLE}>Basics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={NAME_ID}>Name</Label>
            <Input
              id={NAME_ID}
              value={name}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={(showErrors && !!nameError) || undefined}
              aria-describedby={showErrors && nameError ? `${NAME_ID}-error` : undefined}
            />
            {showErrors && nameError && (
              <p id={`${NAME_ID}-error`} className="text-xs text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">Your sign-in email can&apos;t be changed: there&apos;s no email verification yet.</p>
          </div>
          {isStudent && <BasicsFields form={form} update={update} errors={errors} />}
        </CardContent>
      </Card>

      {isStudent ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className={TITLE}>Academics</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AcademicsFields form={form} update={update} errors={errors} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className={TITLE}>Location</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <LocationFields form={form} update={update} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className={TITLE}>English tests</CardTitle>
              <CardDescription>Optional, but many international programmes require one.</CardDescription>
            </CardHeader>
            <CardContent>
              <EnglishTestFields form={form} update={update} errors={errors} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className={TITLE}>Skills and interests</CardTitle>
              <CardDescription>Research interests drive your match scores and the professor finder.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SkillsInterestsFields form={form} update={update} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className={TITLE}>CV</CardTitle>
              <CardDescription>We keep only the extracted text, never the file.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {profile.cv_filename ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{profile.cv_filename}</span>
                  </span>
                  <div className="flex gap-2">
                    <Button id="profile-cv" variant="secondary" size="sm" onClick={() => document.getElementById("cv-replace")?.click()} disabled={uploadCV.isPending}>
                      {uploadCV.isPending ? "Reading…" : "Replace"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={deleteCV.isPending}>
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove your CV?</AlertDialogTitle>
                          <AlertDialogDescription>
                            We&apos;ll delete the text extracted from {profile.cv_filename}. Your profile fields stay as they
                            are; match scores will no longer use your CV.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              try {
                                await deleteCV.mutateAsync();
                                setExtraction(null);
                                toast.success("CV removed.");
                              } catch (err) {
                                toast.error(err instanceof ApiError ? err.message : "Could not remove the CV.");
                              }
                            }}
                          >
                            Remove CV
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <input
                    id="cv-replace"
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              ) : (
                <div id="profile-cv" tabIndex={-1} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <CvDropzone id="cv-upload" pending={uploadCV.isPending} onFile={onFile} />
                </div>
              )}
              {extraction && (
                <CvSuggestionsReview
                  extraction={extraction}
                  accepted={accepted}
                  onAccept={(key) => {
                    setForm((f) => applySuggestion(f, key, extraction.suggestions));
                    setAccepted((a) => new Set(a).add(key));
                  }}
                  onAcceptAll={() => {
                    const keys = Object.keys(extraction.suggestions);
                    setForm((f) => keys.reduce((acc, k) => applySuggestion(acc, k, extraction.suggestions), f));
                    setAccepted(new Set(keys));
                  }}
                  onDismiss={() => setExtraction(null)}
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Academic details are only used to match students with opportunities, so there&apos;s nothing else to fill in for a{" "}
          {user.role} account.
        </p>
      )}

      {dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-[0_8px_24px_-8px_rgb(15_23_42/0.25)] dark:shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]"
        >
          <span className="text-sm font-medium">Unsaved changes</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
