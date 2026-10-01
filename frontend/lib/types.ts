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
  has_cv: boolean;
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
  opportunity_count: number;
  nearest_deadline: string | null;
  last_activity_at: string | null;
  members: { user_id: string; name: string }[];
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

// ---------- opportunities (Phase 3/4) ----------

export type OpportunityType =
  | "research_internship"
  | "fellowship"
  | "grant"
  | "scholarship"
  | "research_position"
  | "summer_school";
export type FundingType = "fully_funded" | "partial" | "stipend" | "unfunded" | "unknown";
export type Region = "uae" | "gcc" | "global" | "india" | "europe" | "usa" | "asia";
export type Verdict = "eligible" | "partially_eligible" | "not_eligible" | "unknown";

export interface EligibilityRequirements {
  degree_levels?: string[];
  min_year?: number | null;
  max_year?: number | null;
  min_cgpa?: { value: number; scale: number } | null;
  nationality_allowed?: string[];
  nationality_excluded?: string[];
  residency_required?: string | null;
  english_requirements?: Record<string, number | null>;
  required_fields?: string[];
  other_requirements?: string[];
}

export interface EligibilityCheck {
  verdict: Verdict;
  met: string[];
  missing: string[];
  blocking: string[];
  unknown: string[];
  notes: string[];
}

export interface Match {
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

export interface Endorsement {
  id: string;
  faculty_name: string;
  note: string | null;
  target_degree_level: string | null;
  target_year: number | null;
  target_major: string | null;
  created_at: string;
}

export interface Opportunity {
  id: string;
  canonical_id: string | null;
  title: string;
  organization: string;
  url: string | null;
  type: OpportunityType;
  degree_levels: string[];
  fields: string[];
  funding_type: FundingType;
  funding_amount: string | null;
  location: string | null;
  is_remote: boolean;
  open_to_uae_residents: boolean | null;
  deadline: string | null;
  deadline_text: string | null;
  eligibility: EligibilityRequirements;
  description_summary: string | null;
  confidence: Record<string, number>;
  overall_confidence: number;
  verified: boolean;
  status: "active" | "expired" | "broken" | "pending_review";
  first_seen: string;
  last_checked: string;
  source_count: number;
  sources: { name: string; url: string; region: Region }[];
  regions: Region[];
  saved: boolean;
  endorsements: Endorsement[];
  eligibility_check: EligibilityCheck | null;
  match: Match | null;
  relevance: number | null;
}

export interface OpportunityChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
  summary: string | null;
  detected_at: string;
}

export interface SearchFilters {
  degree_level: "bachelors" | "masters" | "phd" | null;
  year: number | null;
  fields: string[];
  funding: "any" | "funded" | "fully_funded";
  regions: Region[];
  types: OpportunityType[];
  deadline_within_days: number | null;
  remote_only: boolean;
  open_to_uae_residents: boolean | null;
  eligible_only: boolean;
  verified_only: boolean;
  include_expired: boolean;
  semantic_query: string | null;
}

export interface SearchResponse {
  filters: SearchFilters;
  parsed_by: "llm" | "rule_based" | null;
  results: Opportunity[];
  total: number;
}

export interface CVExtraction {
  cv_filename: string | null;
  suggestions: Partial<Profile>;
  method: "llm" | "rule_based";
  characters: number;
}

// ---------- Phase 5: tracker, professors, copilot ----------

export type TrackerStatus = "saved" | "preparing" | "submitted" | "accepted" | "rejected";

export interface TrackerItem {
  id: string;
  workspace_id: string;
  opportunity_id: string | null;
  status: TrackerStatus;
  position: number;
  notes: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  updated_at: string;
  opportunity: {
    id: string;
    title: string;
    organization: string;
    type: OpportunityType;
    deadline: string | null;
    deadline_text: string | null;
    status: string;
    url: string | null;
    eligibility_verdict: Verdict | null;
    match_score: number | null;
  } | null;
}

export interface Paper {
  title: string | null;
  year: number | null;
  venue: string | null;
  url: string | null;
  citations: number;
}

export interface Professor {
  author_id: string;
  name: string | null;
  affiliations: string[];
  topics: string[];
  h_index: number | null;
  citation_count: number | null;
  paper_count: number | null;
  profile_url: string | null;
  highlight: "BITS Pilani" | "UAE" | null;
  sample: boolean;
  recent_papers: Paper[];
}

export interface ProfessorSearch {
  query: string;
  source: "live" | "cache" | "sample";
  fetched_at: string | null;
  authors: Professor[];
}

export interface ProfessorRef {
  name: string;
  affiliation?: string | null;
  paper_title?: string | null;
  paper_year?: number | null;
}

export interface KitResponse {
  workspace_id: string;
  workspace_name: string;
  documents: Document[];
  method: "llm" | "template" | "mixed";
}
