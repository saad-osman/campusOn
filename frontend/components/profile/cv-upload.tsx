"use client";

import * as React from "react";
import { Check, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSuggestion, SUGGESTION_LABELS } from "@/components/profile/profile-form";
import type { CVExtraction } from "@/lib/types";

/** CV / transcript drop zone (PDF or DOCX up to 5 MB). Shared by onboarding and settings. */
export function CvDropzone({
  id = "cv-file",
  pending,
  currentFile,
  onFile,
  label = "Drop your CV here or click to choose a file",
}: {
  id?: string;
  pending: boolean;
  currentFile?: string | null;
  onFile: (file: File | undefined) => void;
  label?: string;
}) {
  return (
    <>
      <input
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        id={id}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{pending ? "Reading your CV…" : label}</span>
        {currentFile && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-4" aria-hidden /> Current: {currentFile}
          </span>
        )}
      </label>
    </>
  );
}

/**
 * Review panel for values read from a new CV: the student accepts each one (or all) into
 * the form. Accepting only fills the form; nothing is saved until they press Save.
 */
export function CvSuggestionsReview({
  extraction,
  accepted,
  onAccept,
  onAcceptAll,
  onDismiss,
}: {
  extraction: CVExtraction;
  accepted: Set<string>;
  onAccept: (key: string) => void;
  onAcceptAll: () => void;
  onDismiss: () => void;
}) {
  const entries = Object.entries(extraction.suggestions).filter(([k]) => k in SUGGESTION_LABELS);
  const pending = entries.filter(([k]) => !accepted.has(k));
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm" role="region" aria-label={`Values found in ${extraction.cv_filename}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          Found in {extraction.cv_filename}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({extraction.method === "llm" ? "read by AI" : "demo-mode reader"})
          </span>
        </p>
        <div className="flex gap-2">
          {pending.length > 1 && (
            <Button size="sm" variant="secondary" onClick={onAcceptAll}>
              Accept all
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Done
          </Button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">We couldn&apos;t pick out profile details. Fill them in below.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="text-muted-foreground">{SUGGESTION_LABELS[k]}: </span>
                <span className="break-words">{formatSuggestion(v)}</span>
              </span>
              {accepted.has(k) ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-4" aria-hidden /> Added
                </span>
              ) : (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAccept(k)} aria-label={`Accept ${SUGGESTION_LABELS[k]}`}>
                  Accept
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Accepted values fill the form below. Nothing is saved until you press Save.</p>
    </div>
  );
}
