// Le projet possède déjà un AdminTokenContext (src/contexts/AdminTokenContext.tsx)
// qui expose `useAdminToken`. Ce fichier est un ré-export pour respecter la
// convention `src/hooks/useAdminToken` attendue par la spec Lucide.
export { useAdminToken } from "@/contexts/AdminTokenContext";
