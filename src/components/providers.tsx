"use client"

import { SessionProvider } from "next-auth/react"
import { createContext, useContext, useEffect, useState } from "react"

// Theme context
type Theme = "light" | "dark"

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({ theme: "light", toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("merlos-theme") as Theme | null
    if (saved === "dark" || saved === "light") {
      setTheme(saved)
      document.documentElement.classList.toggle("dark", saved === "dark")
    }
  }, [])

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light"
    setTheme(next)
    localStorage.setItem("merlos-theme", next)
    document.documentElement.classList.toggle("dark", next === "dark")
  }

  // Prevent flash of wrong theme
  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}
