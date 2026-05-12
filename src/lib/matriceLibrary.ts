// localStorage-backed store for the Matrice catalog state and Academic Library.
// Globally shared per browser. Emits a "matrice:update" event to sync across components.

export type MatriceStatus = "idle" | "generating" | "pending" | "validated" | "rejected";

export type MatriceState = {
  comment?: string;
  svg?: string;            // last generated, awaiting validation
  validatedSvg?: string;   // validated SVG, lives in Academic Library
  status: MatriceStatus;
  inProduction?: boolean;  // true once it has been used in Studio as premium template
  updatedAt?: number;
};

const KEY = "krobar.matrice.state.v1";
const EVT = "matrice:update";

type Store = Record<string, MatriceState>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Store : {};
  } catch { return {}; }
}

function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getAllStates(): Store { return read(); }

export function getState(id: string): MatriceState {
  return read()[id] ?? { status: "idle" };
}

export function setState(id: string, patch: Partial<MatriceState>) {
  const s = read();
  s[id] = { ...(s[id] ?? { status: "idle" }), ...patch, updatedAt: Date.now() };
  write(s);
}

export function removeFromLibrary(id: string) {
  const s = read();
  if (s[id]) {
    delete s[id].validatedSvg;
    s[id].status = "idle";
    s[id].inProduction = false;
    write(s);
  }
}

export function markInProduction(id: string) {
  setState(id, { inProduction: true });
}

export function subscribe(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}
