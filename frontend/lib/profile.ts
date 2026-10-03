"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";

export function useProfile() {
  return useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>("/api/profile"),
  });
}

export function usePatchProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Profile>) => api.patch<Profile>("/api/profile", body),
    onSuccess: (profile) => {
      qc.setQueryData(["profile"], profile);
      // Eligibility verdicts and match scores depend on the profile.
      for (const key of ["opportunities", "top-matches", "search", "opportunity", "saved-opportunities"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useDeleteCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>("/api/profile/cv"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      // The CV feeds the profile embedding, so match scores change too.
      for (const key of ["opportunities", "top-matches", "search", "opportunity", "saved-opportunities"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** One item a complete profile needs; `field` is the form field to scroll to and focus. */
export type CompletenessItem = { key: string; label: string; done: boolean; field: string };

/**
 * How complete a student's profile is: ten items, each worth 10%. Used by the account
 * menu, the dashboard greeting and /settings/profile (which links each missing item).
 */
export function profileCompleteness(p: Profile | null | undefined): { percent: number; items: CompletenessItem[]; missing: CompletenessItem[] } {
  const items: CompletenessItem[] = [
    { key: "degree_level", label: "Degree level", done: !!p?.degree_level, field: "profile-degree-level" },
    { key: "year_of_study", label: "Year of study", done: p?.year_of_study != null, field: "profile-year-of-study" },
    { key: "major", label: "Major", done: !!p?.major, field: "profile-major" },
    { key: "cgpa", label: "CGPA", done: p?.cgpa != null, field: "profile-cgpa" },
    { key: "nationality", label: "Nationality", done: !!p?.nationality, field: "profile-nationality" },
    { key: "country_of_residence", label: "Country of residence", done: !!p?.country_of_residence, field: "profile-country" },
    { key: "english_tests", label: "An English test score", done: Object.keys(p?.english_tests ?? {}).length > 0, field: "profile-ielts" },
    { key: "skills", label: "Skills", done: (p?.skills?.length ?? 0) > 0, field: "profile-skills" },
    { key: "interests", label: "Research interests", done: (p?.interests?.length ?? 0) > 0, field: "profile-interests" },
    { key: "cv", label: "Your CV", done: !!p?.has_cv, field: "profile-cv" },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items, missing: items.filter((i) => !i.done) };
}

/** Where "complete / edit your profile" links go: onboarding until it's finished, then settings. */
export function profileEditHref(p: Profile | null | undefined): string {
  return p?.onboarding_complete ? "/settings/profile" : "/onboarding";
}
