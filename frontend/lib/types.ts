export interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "faculty" | "admin";
  created_at: string;
}

export interface Profile {
  degree_level: "bachelors" | "masters" | "phd" | null;
  year_of_study: number | null;
  major: string | null;
  cgpa: number | null;
  cgpa_scale: number;
  nationality: string | null;
  country_of_residence: string | null;
  english_tests: Record<string, number>;
  skills: string[];
  interests: string[];
  cv_filename: string | null;
  onboarding_step: number;
  onboarding_complete: boolean;
}

export interface UserState {
  last_route: string | null;
  last_workspace_id: string | null;
  last_document_id: string | null;
  ui_state: Record<string, unknown>;
}
