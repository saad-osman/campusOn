"use client";

/*
 * Profile field groups shared by onboarding and /settings/profile, so both edit the same
 * fields with the same inputs. Each control has a stable id (FIELD_IDS) so "missing item"
 * links can scroll to and focus it.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/profile/tag-input";
import { FIELD_IDS, type ProfileForm } from "@/components/profile/profile-form";

type Props = {
  form: ProfileForm;
  update: <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => void;
  errors?: Partial<Record<keyof ProfileForm, string>>;
};

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string) => (error ? `${id}-error` : undefined);

export function BasicsFields({ form, update, errors = {} }: Props) {
  return (
    <>
      <Field id={FIELD_IDS.degree_level} label="Degree level">
        <Select value={form.degree_level} onValueChange={(v: string) => update("degree_level", v)}>
          <SelectTrigger id={FIELD_IDS.degree_level} className="w-full">
            <SelectValue placeholder="Select degree level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bachelors">Bachelor&apos;s</SelectItem>
            <SelectItem value="masters">Master&apos;s</SelectItem>
            <SelectItem value="phd">PhD</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field id={FIELD_IDS.year_of_study} label="Year of study" error={errors.year_of_study}>
        <Input
          id={FIELD_IDS.year_of_study}
          type="number"
          min={1}
          max={8}
          value={form.year_of_study}
          aria-invalid={!!errors.year_of_study || undefined}
          aria-describedby={describedBy(FIELD_IDS.year_of_study, errors.year_of_study)}
          onChange={(e) => update("year_of_study", e.target.value)}
        />
      </Field>
      <Field id={FIELD_IDS.major} label="Major">
        <Input id={FIELD_IDS.major} value={form.major} onChange={(e) => update("major", e.target.value)} placeholder="e.g. Computer Science" />
      </Field>
    </>
  );
}

export function AcademicsFields({ form, update, errors = {} }: Props) {
  return (
    <>
      <Field id={FIELD_IDS.cgpa} label="CGPA" error={errors.cgpa}>
        <Input
          id={FIELD_IDS.cgpa}
          type="number"
          step="0.01"
          value={form.cgpa}
          aria-invalid={!!errors.cgpa || undefined}
          aria-describedby={describedBy(FIELD_IDS.cgpa, errors.cgpa)}
          onChange={(e) => update("cgpa", e.target.value)}
        />
      </Field>
      <Field id={FIELD_IDS.cgpa_scale} label="Scale">
        <Select value={form.cgpa_scale} onValueChange={(v: string) => update("cgpa_scale", v)}>
          <SelectTrigger id={FIELD_IDS.cgpa_scale} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4">out of 4</SelectItem>
            <SelectItem value="10">out of 10</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

export function LocationFields({ form, update }: Props) {
  return (
    <>
      <Field id={FIELD_IDS.nationality} label="Nationality">
        <Input id={FIELD_IDS.nationality} value={form.nationality} onChange={(e) => update("nationality", e.target.value)} />
      </Field>
      <Field id={FIELD_IDS.country_of_residence} label="Country of residence">
        <Input
          id={FIELD_IDS.country_of_residence}
          value={form.country_of_residence}
          onChange={(e) => update("country_of_residence", e.target.value)}
        />
      </Field>
    </>
  );
}

export function EnglishTestFields({ form, update, errors = {} }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field id={FIELD_IDS.ielts} label="IELTS score (optional)" error={errors.ielts}>
        <Input
          id={FIELD_IDS.ielts}
          type="number"
          step="0.5"
          value={form.ielts}
          aria-invalid={!!errors.ielts || undefined}
          aria-describedby={describedBy(FIELD_IDS.ielts, errors.ielts)}
          onChange={(e) => update("ielts", e.target.value)}
        />
      </Field>
      <Field id={FIELD_IDS.toefl} label="TOEFL score (optional)" error={errors.toefl}>
        <Input
          id={FIELD_IDS.toefl}
          type="number"
          value={form.toefl}
          aria-invalid={!!errors.toefl || undefined}
          aria-describedby={describedBy(FIELD_IDS.toefl, errors.toefl)}
          onChange={(e) => update("toefl", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function SkillsInterestsFields({ form, update }: Props) {
  return (
    <>
      <Field id={FIELD_IDS.skills} label="Skills" hint="Type a skill, then press Enter or comma. Paste a list to add several.">
        <TagInput
          id={FIELD_IDS.skills}
          value={form.skills}
          onChange={(v) => update("skills", v)}
          placeholder="Python, PyTorch, React"
          ariaDescribedBy={`${FIELD_IDS.skills}-hint`}
        />
      </Field>
      <Field id={FIELD_IDS.interests} label="Research interests" hint="Press Enter or comma after each one.">
        <TagInput
          id={FIELD_IDS.interests}
          value={form.interests}
          onChange={(v) => update("interests", v)}
          placeholder="machine learning, robotics, public policy"
          ariaDescribedBy={`${FIELD_IDS.interests}-hint`}
        />
      </Field>
    </>
  );
}
