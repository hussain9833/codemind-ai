export type SearchKind = "project" | "file" | "symbol" | "investigation" | "incident" | "pull-request" | "commit";

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href: string;
}

/** Categories shown in the palette. Code-level kinds need an indexed repository. */
export const SEARCH_KINDS: { kind: SearchKind; label: string }[] = [
  { kind: "project", label: "Projects" },
  { kind: "file", label: "Files" },
  { kind: "symbol", label: "Symbols" },
  { kind: "investigation", label: "Investigations" },
  { kind: "incident", label: "Incidents" },
  { kind: "pull-request", label: "Pull Requests" },
  { kind: "commit", label: "Commits" },
];
