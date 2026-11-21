import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "holler-theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Saves the member's theme and applies it at once. System follows the OS. */
export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  for (const listener of listeners) listener();
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "system",
  );
}

/** The theme a page is actually showing, resolving System through the OS setting. */
export function useResolvedTheme(): "light" | "dark" {
  const choice = useTheme();
  const osDark = useSyncExternalStore(
    (listener) => {
      const query = matchMedia("(prefers-color-scheme: dark)");
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return choice === "system" ? (osDark ? "dark" : "light") : choice;
}
