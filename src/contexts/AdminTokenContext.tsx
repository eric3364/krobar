import { createContext, useContext, useState, ReactNode, useCallback } from "react";

type AdminTokenContextValue = {
  token: string;
  setToken: (t: string) => void;
  clearToken: () => void;
  hasToken: boolean;
};

const AdminTokenContext = createContext<AdminTokenContextValue | undefined>(undefined);

export function AdminTokenProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState("");
  const setToken = useCallback((t: string) => setTokenState(t), []);
  const clearToken = useCallback(() => setTokenState(""), []);

  return (
    <AdminTokenContext.Provider value={{ token, setToken, clearToken, hasToken: token.length > 0 }}>
      {children}
    </AdminTokenContext.Provider>
  );
}

export function useAdminToken() {
  const ctx = useContext(AdminTokenContext);
  if (!ctx) throw new Error("useAdminToken must be used within AdminTokenProvider");
  return ctx;
}
