import type { User } from "@supabase/supabase-js";

export const BYPASS_AUTH = true;
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEV_USER_EMAIL = "dev@local.test";

export const DEV_PROFILE = {
  id: DEV_USER_ID,
  email: DEV_USER_EMAIL,
  display_name: "Mode développement",
  plan: "premium",
  is_active: true,
  hide_welcome: true,
} as const;

export const DEV_USER = {
  id: DEV_USER_ID,
  email: DEV_USER_EMAIL,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-05-01T00:00:00.000Z",
} as User;

export function isDevBypassUser(user: User | null | undefined) {
  return Boolean(BYPASS_AUTH && user?.id === DEV_USER_ID);
}