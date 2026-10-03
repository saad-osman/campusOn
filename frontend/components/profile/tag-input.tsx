"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Splits on commas and newlines, trims, and drops empties. */
function splitTags(text: string) {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Appends `incoming` to `current`, skipping case-insensitive duplicates. */
function addUnique(current: string[], incoming: string[]) {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const next = [...current];
  for (const tag of incoming) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      next.push(tag);
    }
  }
  return next;
}

/**
 * Tag input for skills and interests. Type then Enter or comma to add; Backspace on an
 * empty input removes the last tag; pasting a comma-separated list adds them all; each
 * tag has a labelled remove button. Values are trimmed and de-duplicated
 * case-insensitively. Saves the same string array the API stores.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  ariaDescribedBy,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaDescribedBy?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commit = (text: string) => {
    const tags = splitTags(text);
    if (tags.length) onChange(addUnique(value, tags));
    setDraft("");
  };

  return (
    <div
      className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((t) => t !== tag));
              inputRef.current?.focus();
            }}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        aria-describedby={ariaDescribedBy}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const text = e.target.value;
          // A typed comma completes the tag before it.
          if (text.includes(",")) commit(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            e.preventDefault();
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,\n]/.test(text)) {
            e.preventDefault();
            commit(draft + text);
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        className={cn("min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground")}
      />
    </div>
  );
}
