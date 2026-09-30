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

export type WorkspaceTemplate = "blank" | "single_application" | "scholarship_hunt";
export type MemberRole = "owner" | "editor" | "viewer";
export type DocumentType = "sop" | "cold_email" | "checklist" | "notes" | "cover_letter";

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  owner_id: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  my_role: MemberRole;
  member_count: number;
  document_count: number;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  role: MemberRole;
  name: string;
  email: string;
}

export interface Invite {
  id: string;
  workspace_id: string;
  email: string;
  role: "editor" | "viewer";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  invite_link: string;
}

export interface InvitePreview {
  workspace_name: string;
  workspace_icon: string;
  role: string;
  invited_by_name: string;
  expired: boolean;
  already_accepted: boolean;
}

export interface Document {
  id: string;
  workspace_id: string;
  type: DocumentType;
  title: string;
  content: string;
  opportunity_id: string | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface DocumentVersion {
  version: number;
  content: string;
  edited_by: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
}
