import type { Config } from "tailwindcss";

/**
 * Tokens de cor do design system.
 *
 * IMPORTANTE, e foi a causa de "texto transparente" e popup sem fundo: no
 * Tailwind v3 declarar a variavel no `:root` do CSS **nao cria o utilitario**.
 * Sem a entrada aqui, `bg-popover`, `text-muted-foreground`, `border-border`
 * e companhia nao geram uma linha de CSS — a classe fica no HTML e nao pinta
 * nada. Eram 167 usos no codigo contra 2 tokens declarados.
 *
 * Regra ao mexer: toda variavel `--x` do globals.css precisa de um par aqui,
 * senao o utilitario correspondente e silenciosamente inerte. O teste
 * `tests/tokens-tailwind.test.ts` compara as duas listas.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",

        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",

        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",

        sidebar: "var(--sidebar)",
        "sidebar-foreground": "var(--sidebar-foreground)",
        "sidebar-primary": "var(--sidebar-primary)",
        "sidebar-primary-foreground": "var(--sidebar-primary-foreground)",
        "sidebar-accent": "var(--sidebar-accent)",
        "sidebar-accent-foreground": "var(--sidebar-accent-foreground)",
        "sidebar-border": "var(--sidebar-border)",
        "sidebar-ring": "var(--sidebar-ring)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
