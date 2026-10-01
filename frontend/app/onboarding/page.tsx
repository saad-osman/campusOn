"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { useCurrentUser } from "@/lib/auth";
import { usePatchProfile, useProfile } from "@/lib/profile";
import { useUploadCV } from "@/lib/opportunities";
import { useTrackRoute } from "@/lib/state";
import { ApiError } from "@/lib/api";
import type { CVExtraction } from "@/lib/types";

const SUGGESTION_LABELS: Record<string, string> = {
  degree_level: "Degree level",
  year_of_study: "Year of study",
  major: "Major",
  cgpa: "CGPA",
  cgpa_scale: "CGPA scale",
  nationality: "Nationality",
  country_of_residence: "Lives in",
  english_tests: "English tests",
  skills: "Skills",
  interests: "Interests",
};

const STEPS = ["Upload your CV", "Academic basics", "Grades", "Background", "Skills & interests"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const patchProfile = usePatchProfile();

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    degree_level: "",
    year_of_study: "",
    major: "",
    cgpa: "",
    cgpa_scale: "10",
    nationality: "",
    country_of_residence: "",
    ielts: "",
    toefl: "",
    skills: "",
    interests: "",
  });
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

  /** Copies extracted values into the form; the student reviews every step before saving. */
  function applySuggestions(s: CVExtraction["suggestions"]) {
    setForm((f) => ({
      ...f,
      degree_level: s.degree_level ?? f.degree_level,
      year_of_study: s.year_of_study?.toString() ?? f.year_of_study,
      major: s.major ?? f.major,
      cgpa: s.cgpa?.toString() ?? f.cgpa,
      cgpa_scale: s.cgpa_scale?.toString() ?? f.cgpa_scale,
      nationality: s.nationality ?? f.nationality,
      country_of_residence: s.country_of_residence ?? f.country_of_residence,
      ielts: s.english_tests?.IELTS?.toString() ?? f.ielts,
      toefl: s.english_tests?.TOEFL?.toString() ?? f.toefl,
      skills: s.skills?.length ? s.skills.join(", ") : f.skills,
      interests: s.interests?.length ? s.interests.join(", ") : f.interests,
    }));
  }

  useTrackRoute("/onboarding");

  React.useEffect(() => {
    if (!userLoading && !user) router.replace("/login?next=/onboarding");
  }, [user, userLoading, router]);

  React.useEffect(() => {
    if (profile && !hydrated.current) {
      hydrated.current = true;
      setStep(Math.min(profile.onboarding_step, STEPS.length - 1));
      setForm({
        degree_level: profile.degree_level ?? "",
        year_of_study: profile.year_of_study?.toString() ?? "",
        major: profile.major ?? "",
        cgpa: profile.cgpa?.toString() ?? "",
        cgpa_scale: profile.cgpa_scale?.toString() ?? "10",
        nationality: profile.nationality ?? "",
        country_of_residence: profile.country_of_residence ?? "",
        ielts: profile.english_tests?.IELTS?.toString() ?? "",
        toefl: profile.english_tests?.TOEFL?.toString() ?? "",
        skills: profile.skills?.join(", ") ?? "",
        interests: profile.interests?.join(", ") ?? "",
      });
    }
  }, [profile]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function saveStepAndContinue() {
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    const isLast = step === STEPS.length - 1;

    const payload: Record<string, unknown> = { onboarding_step: nextStep };
    if (step === 0) {
      if (extraction) applySuggestions(extraction.suggestions);
    } else if (step === 1) {
      payload.degree_level = form.degree_level || null;
      payload.year_of_study = form.year_of_study ? parseInt(form.year_of_study, 10) : null;
      payload.major = form.major || null;
    } else if (step === 2) {
      payload.cgpa = form.cgpa ? parseFloat(form.cgpa) : null;
      payload.cgpa_scale = form.cgpa_scale ? parseFloat(form.cgpa_scale) : 10;
    } else if (step === 3) {
      payload.nationality = form.nationality || null;
      payload.country_of_residence = form.country_of_residence || null;
      const english_tests: Record<string, number> = {};
      if (form.ielts) english_tests.IELTS = parseFloat(form.ielts);
      if (form.toefl) english_tests.TOEFL = parseFloat(form.toefl);
      payload.english_tests = english_tests;
    } else if (step === 4) {
      payload.skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
      payload.interests = form.interests.split(",").map((s) => s.trim()).filter(Boolean);
      payload.onboarding_complete = true;
    }

    await patchProfile.mutateAsync(payload);

    if (isLast) {
      router.push("/dashboard");
    } else {
      setStep(nextStep);
    }
  }

  if (userLoading || profileLoading) {
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
          <CardDescription>
            Leaving halfway through? Come back any time &mdash; you&apos;ll resume right here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Upload a CV or transcript (PDF or DOCX, up to 5 MB) and we&apos;ll pre-fill the next steps. You review
                every value before it&apos;s saved. We keep only the extracted text, never the file.
              </p>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                id="cv-file"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <label
                htmlFor="cv-file"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <Upload className="size-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">
                  {uploadCV.isPending ? "Reading your CV…" : "Drop your CV here or click to choose a file"}
                </span>
                {profile?.cv_filename && !extraction && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3.5" /> Current: {profile.cv_filename}
                  </span>
                )}
              </label>
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
                          <dd>
                            {Array.isArray(v)
                              ? v.join(", ")
                              : typeof v === "object" && v
                                ? Object.entries(v)
                                    .map(([t, n]) => `${t} ${n}`)
                                    .join(", ")
                                : String(v)}
                          </dd>
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

          {step === 1 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Degree level</Label>
                <Select value={form.degree_level} onValueChange={(v: string) => update("degree_level", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select degree level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bachelors">Bachelor&apos;s</SelectItem>
                    <SelectItem value="masters">Master&apos;s</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Year of study</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={form.year_of_study}
                  onChange={(e) => update("year_of_study", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Major</Label>
                <Input value={form.major} onChange={(e) => update("major", e.target.value)} placeholder="e.g. Computer Science" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>CGPA</Label>
                <Input type="number" step="0.01" value={form.cgpa} onChange={(e) => update("cgpa", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Scale</Label>
                <Select value={form.cgpa_scale} onValueChange={(v: string) => update("cgpa_scale", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">out of 4</SelectItem>
                    <SelectItem value="10">out of 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Nationality</Label>
                <Input value={form.nationality} onChange={(e) => update("nationality", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Country of residence</Label>
                <Input
                  value={form.country_of_residence}
                  onChange={(e) => update("country_of_residence", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>IELTS score (optional)</Label>
                  <Input type="number" step="0.5" value={form.ielts} onChange={(e) => update("ielts", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>TOEFL score (optional)</Label>
                  <Input type="number" value={form.toefl} onChange={(e) => update("toefl", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Skills (comma separated)</Label>
                <Input value={form.skills} onChange={(e) => update("skills", e.target.value)} placeholder="Python, PyTorch, React" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Research interests (comma separated)</Label>
                <Input
                  value={form.interests}
                  onChange={(e) => update("interests", e.target.value)}
                  placeholder="machine learning, robotics, public policy"
                />
              </div>
            </>
          )}

          <div className="mt-2 flex justify-between">
            <Button
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
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
