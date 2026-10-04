"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/auth";
import { usePatchProfile, useProfile } from "@/lib/profile";
import { useUploadCV } from "@/lib/opportunities";
import { useTrackRoute } from "@/lib/state";
import { ApiError } from "@/lib/api";
import type { CVExtraction } from "@/lib/types";
import {
  AcademicsFields,
  BasicsFields,
  EnglishTestFields,
  LocationFields,
  SkillsInterestsFields,
} from "@/components/profile/profile-fields";
import { CvDropzone } from "@/components/profile/cv-upload";
import {
  applyAllSuggestions,
  EMPTY_PROFILE_FORM,
  formatSuggestion,
  formToPatch,
  profileToForm,
  SUGGESTION_LABELS,
  type ProfileForm,
} from "@/components/profile/profile-form";

const STEPS = ["Upload your CV", "Academic basics", "Grades", "Background", "Skills & interests"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const patchProfile = usePatchProfile();

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const hydrated = React.useRef(false);
  const uploadCV = useUploadCV();
  const [extraction, setExtraction] = React.useState<CVExtraction | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = await uploadCV.mutateAsync(file);
      setExtraction(result);
      toast.success(`Read ${result.cv_filename}. Review what we found below.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  useTrackRoute("/onboarding");

  React.useEffect(() => {
    // `null` = logged out; `undefined` = the check failed (server asleep), which BackendGate handles.
    if (!userLoading && user === null) router.replace("/login?next=/onboarding");
  }, [user, userLoading, router]);

  // Onboarding is for first-time setup; a finished profile is edited in settings.
  // (Not while finishing here: then Finish goes on to the dashboard.)
  const finishing = React.useRef(false);
  const finished = !!profile?.onboarding_complete && !finishing.current;
  React.useEffect(() => {
    if (finished) router.replace("/settings/profile");
  }, [finished, router]);

  React.useEffect(() => {
    if (profile && !hydrated.current) {
      hydrated.current = true;
      setStep(Math.min(profile.onboarding_step, STEPS.length - 1));
      setForm(profileToForm(profile));
    }
  }, [profile]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function saveStepAndContinue() {
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    const isLast = step === STEPS.length - 1;

    let payload: Record<string, unknown> = { onboarding_step: nextStep };
    if (step === 0) {
      // Copies extracted values into the form; the student reviews every step before saving.
      if (extraction) setForm((f) => applyAllSuggestions(f, extraction.suggestions));
    } else if (step === 1) {
      payload = { ...payload, ...formToPatch(form, ["basics"]) };
    } else if (step === 2) {
      payload = { ...payload, ...formToPatch(form, ["academics"]) };
    } else if (step === 3) {
      payload = { ...payload, ...formToPatch(form, ["location", "english"]) };
    } else if (step === 4) {
      payload = { ...payload, ...formToPatch(form, ["skills"]), onboarding_complete: true };
      finishing.current = true;
    }

    await patchProfile.mutateAsync(payload);

    if (isLast) {
      router.push("/dashboard");
    } else {
      setStep(nextStep);
    }
  }

  if (userLoading || profileLoading || finished) {
    return <div className="py-16 text-center text-muted-foreground">Loading&hellip;</div>;
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-6">
        <Progress value={((step + 1) / STEPS.length) * 100} />
        <p className="mt-2 text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          {!profile?.onboarding_complete && (
            <CardDescription>
              Leaving halfway through? Come back any time &mdash; you&apos;ll resume right here.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Upload a CV or transcript (PDF or DOCX, up to 5 MB) and we&apos;ll pre-fill the next steps. You review
                every value before it&apos;s saved. We keep only the extracted text, never the file.
              </p>
              <CvDropzone
                pending={uploadCV.isPending}
                currentFile={!extraction ? profile?.cv_filename : null}
                onFile={onFile}
              />
              <p className="text-xs text-muted-foreground">
                No CV handy?{" "}
                <a href="/sample-cv.docx" download className="underline underline-offset-2">
                  Download a sample CV
                </a>{" "}
                to try it.
              </p>
              {extraction && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">
                    Found in {extraction.cv_filename}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({extraction.method === "llm" ? "read by AI" : "demo-mode reader"})
                    </span>
                  </p>
                  {Object.keys(extraction.suggestions).length === 0 ? (
                    <p className="text-muted-foreground">
                      We couldn&apos;t pick out profile details. Fill them in on the next steps.
                    </p>
                  ) : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {Object.entries(extraction.suggestions).map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt className="text-muted-foreground">{SUGGESTION_LABELS[k] ?? k}</dt>
                          <dd>{formatSuggestion(v)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Continue to review and correct these. Nothing is saved to your profile until you do.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && <BasicsFields form={form} update={update} />}
          {step === 2 && <AcademicsFields form={form} update={update} />}
          {step === 3 && (
            <>
              <LocationFields form={form} update={update} />
              <EnglishTestFields form={form} update={update} />
            </>
          )}
          {step === 4 && <SkillsInterestsFields form={form} update={update} />}

          <div className="mt-2 flex justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            <Button onClick={saveStepAndContinue} disabled={patchProfile.isPending || uploadCV.isPending}>
              {step === STEPS.length - 1 ? "Finish" : step === 0 && !extraction ? "Skip" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
