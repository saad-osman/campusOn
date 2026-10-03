import type { CVExtraction, Profile } from "@/lib/types";

/** The editable profile as form state (numbers kept as strings while typing). */
export type ProfileForm = {
  degree_level: string;
  year_of_study: string;
  major: string;
  cgpa: string;
  cgpa_scale: string;
  nationality: string;
  country_of_residence: string;
  ielts: string;
  toefl: string;
  skills: string[];
  interests: string[];
};

export const EMPTY_PROFILE_FORM: ProfileForm = {
  degree_level: "",
  year_of_study: "",
  major: "",
  cgpa: "",
  cgpa_scale: "10",
  nationality: "",
  country_of_residence: "",
  ielts: "",
  toefl: "",
  skills: [],
  interests: [],
};

/** Stable element ids, so other places (e.g. "missing" links) can scroll to and focus a field. */
export const FIELD_IDS = {
  degree_level: "profile-degree-level",
  year_of_study: "profile-year-of-study",
  major: "profile-major",
  cgpa: "profile-cgpa",
  cgpa_scale: "profile-cgpa-scale",
  nationality: "profile-nationality",
  country_of_residence: "profile-country",
  ielts: "profile-ielts",
  toefl: "profile-toefl",
  skills: "profile-skills",
  interests: "profile-interests",
} as const;

export function profileToForm(p: Profile): ProfileForm {
  return {
    degree_level: p.degree_level ?? "",
    year_of_study: p.year_of_study?.toString() ?? "",
    major: p.major ?? "",
    cgpa: p.cgpa?.toString() ?? "",
    cgpa_scale: p.cgpa_scale?.toString() ?? "10",
    nationality: p.nationality ?? "",
    country_of_residence: p.country_of_residence ?? "",
    ielts: p.english_tests?.IELTS?.toString() ?? "",
    toefl: p.english_tests?.TOEFL?.toString() ?? "",
    skills: p.skills ?? [],
    interests: p.interests ?? [],
  };
}

type Group = "basics" | "academics" | "location" | "english" | "skills";

/** The PATCH body for the given groups (all of them by default). */
export function formToPatch(f: ProfileForm, groups: Group[] = ["basics", "academics", "location", "english", "skills"]) {
  const body: Partial<Profile> = {};
  if (groups.includes("basics")) {
    body.degree_level = (f.degree_level || null) as Profile["degree_level"];
    body.year_of_study = f.year_of_study ? parseInt(f.year_of_study, 10) : null;
    body.major = f.major.trim() || null;
  }
  if (groups.includes("academics")) {
    body.cgpa = f.cgpa ? parseFloat(f.cgpa) : null;
    body.cgpa_scale = f.cgpa_scale ? parseFloat(f.cgpa_scale) : 10;
  }
  if (groups.includes("location")) {
    body.nationality = f.nationality.trim() || null;
    body.country_of_residence = f.country_of_residence.trim() || null;
  }
  if (groups.includes("english")) {
    const tests: Record<string, number> = {};
    if (f.ielts) tests.IELTS = parseFloat(f.ielts);
    if (f.toefl) tests.TOEFL = parseFloat(f.toefl);
    body.english_tests = tests;
  }
  if (groups.includes("skills")) {
    body.skills = f.skills;
    body.interests = f.interests;
  }
  return body;
}

/** Inline validation, matching the inputs' limits and the API (year 1-8, CGPA within its scale, IELTS 0-9, TOEFL 0-120). */
export function validateProfileForm(f: ProfileForm): Partial<Record<keyof ProfileForm, string>> {
  const errors: Partial<Record<keyof ProfileForm, string>> = {};
  const num = (v: string) => (v === "" ? null : Number(v));
  const year = num(f.year_of_study);
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 8)) errors.year_of_study = "Enter a whole number from 1 to 8.";
  const scale = num(f.cgpa_scale) ?? 10;
  const cgpa = num(f.cgpa);
  if (cgpa !== null && (Number.isNaN(cgpa) || cgpa < 0 || cgpa > scale)) errors.cgpa = `Enter a CGPA from 0 to ${scale}.`;
  const ielts = num(f.ielts);
  if (ielts !== null && (Number.isNaN(ielts) || ielts < 0 || ielts > 9)) errors.ielts = "IELTS scores run from 0 to 9.";
  const toefl = num(f.toefl);
  if (toefl !== null && (Number.isNaN(toefl) || toefl < 0 || toefl > 120)) errors.toefl = "TOEFL scores run from 0 to 120.";
  return errors;
}

export const SUGGESTION_LABELS: Record<string, string> = {
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

export function formatSuggestion(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return Object.entries(v).map(([t, n]) => `${t} ${n}`).join(", ");
  return String(v);
}

/** Copies one extracted value (or all of them) into the form. Nothing is saved here. */
export function applySuggestion(f: ProfileForm, key: string, s: CVExtraction["suggestions"]): ProfileForm {
  switch (key) {
    case "degree_level":
      return s.degree_level ? { ...f, degree_level: s.degree_level } : f;
    case "year_of_study":
      return s.year_of_study != null ? { ...f, year_of_study: String(s.year_of_study) } : f;
    case "major":
      return s.major ? { ...f, major: s.major } : f;
    case "cgpa":
      return s.cgpa != null ? { ...f, cgpa: String(s.cgpa) } : f;
    case "cgpa_scale":
      return s.cgpa_scale != null ? { ...f, cgpa_scale: String(s.cgpa_scale) } : f;
    case "nationality":
      return s.nationality ? { ...f, nationality: s.nationality } : f;
    case "country_of_residence":
      return s.country_of_residence ? { ...f, country_of_residence: s.country_of_residence } : f;
    case "english_tests":
      return {
        ...f,
        ielts: s.english_tests?.IELTS?.toString() ?? f.ielts,
        toefl: s.english_tests?.TOEFL?.toString() ?? f.toefl,
      };
    case "skills":
      return s.skills?.length ? { ...f, skills: s.skills } : f;
    case "interests":
      return s.interests?.length ? { ...f, interests: s.interests } : f;
    default:
      return f;
  }
}

export function applyAllSuggestions(f: ProfileForm, s: CVExtraction["suggestions"]): ProfileForm {
  return Object.keys(s).reduce((acc, key) => applySuggestion(acc, key, s), f);
}
