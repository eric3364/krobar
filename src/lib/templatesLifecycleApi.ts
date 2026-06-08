import { adminFetch } from "@/lib/adminApi";

export type InventoryTemplate = {
  id: string;
  name: string;
  category: string;
  tier: string;
  file: string;
  figurative: boolean;
  disabled: boolean;
  svg_exists: boolean;
};

export type InventoryResponse = {
  total: number;
  active: number;
  disabled: number;
  templates: InventoryTemplate[];
};

export type ToggleDisabledResponse = {
  changed: boolean;
  disabled: boolean;
  previous: boolean;
  frontend_synced: boolean;
};

export const templatesLifecycleApi = {
  inventory: () =>
    adminFetch<InventoryResponse>("/admin/studio/templates-inventory", { method: "GET" }),

  setDisabled: (id: string, disabled: boolean) =>
    adminFetch<ToggleDisabledResponse>(
      `/admin/studio/templates/${encodeURIComponent(id)}/disabled`,
      { method: "POST", body: { disabled } },
    ),

  remove: (id: string) =>
    adminFetch<{ ok: boolean }>(
      `/admin/studio/templates/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};
