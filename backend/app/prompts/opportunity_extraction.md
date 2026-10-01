Extract structured research-opportunity data from this page text as JSON.
Return ONLY valid JSON (no markdown fences) with these exact keys:
title, organization, type (one of: research_internship, fellowship, grant, scholarship,
research_position, summer_school), degree_levels (array from: bachelors, masters, phd, postdoc, any),
fields (array of free-text field names), funding_type (one of: fully_funded, partial, stipend,
unfunded, unknown), funding_amount (string or null), location (string or null),
is_remote (bool), open_to_uae_residents (bool or null), deadline (ISO date YYYY-MM-DD or null),
deadline_text (string or null), eligibility (object: degree_levels, min_year, max_year,
min_cgpa {{value, scale}} or null, nationality_allowed, nationality_excluded,
residency_required, english_requirements {{IELTS, TOEFL}}, required_fields, other_requirements),
description_summary (1-2 sentences), confidence (object mapping each top-level field name to a
0-1 score), overall_confidence (0-1, your honest estimate of extraction completeness/reliability).

Source: {source_name} ({source_url})
Text:
{text}
