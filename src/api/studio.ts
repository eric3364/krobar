import { adminFetch } from "@/lib/adminApi";

export type SuggestIconCandidate = {
  name: string;
  tags: string[];
};

export type SuggestIconResponse = {
  candidates: SuggestIconCandidate[];
};

export function suggestIcon(params: {
  slot_text: string;
  exclude_icons?: string[];
}): Promise<SuggestIconResponse> {
  return adminFetch<SuggestIconResponse>("/admin/studio/suggest-icon", {
    method: "POST",
    body: {
      slot_text: params.slot_text,
      exclude_icons: params.exclude_icons ?? [],
    },
  });
}
