import { createContext, useContext } from "react"

export type Theme = "dark" | "light" | "system"

export interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const ThemeContext = createContext<ThemeCtx>({ theme: "system", setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
