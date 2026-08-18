/**
 * Tokens do Tailwind x variaveis do CSS.
 *
 * O buraco que este teste fecha: no Tailwind v3, declarar `--popover` no
 * `:root` do CSS **nao cria** o utilitario `bg-popover`. Sem a entrada
 * correspondente no `tailwind.config.ts`, a classe fica no HTML e nao pinta
 * nada — silenciosamente. Nada quebra, nada avisa: o popup so aparece sem
 * fundo e o texto some.
 *
 * Era o estado real ate 18/08/2026: 2 tokens declarados no config contra 167
 * usos no codigo.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")

const css = ler("src", "app", "globals.css")
const config = ler("tailwind.config.ts")

/** Variaveis que NAO sao cor — nao viram utilitario de cor. */
const NAO_SAO_COR = new Set(["--radius", "--font-sans", "--font-heading"])

function variaveisDoCss(): string[] {
  const achadas = css.match(/--[a-z][a-z-]*(?=\s*:)/g) ?? []
  return Array.from(new Set(achadas))
    .filter((v) => !NAO_SAO_COR.has(v))
    .sort()
}

describe("todo token de cor do CSS tem utilitario no Tailwind", () => {
  const variaveis = variaveisDoCss()

  it("o CSS declara os tokens do design system", () => {
    expect(variaveis.length).toBeGreaterThan(20)
    expect(variaveis).toContain("--popover")
    expect(variaveis).toContain("--muted-foreground")
  })

  it.each(variaveisDoCss())("%s tem par no tailwind.config.ts", (variavel) => {
    // O config referencia a variavel como `var(--x)`. Sem isso, a classe
    // correspondente nao existe no CSS final.
    expect(config).toContain(`var(${variavel})`)
  })
})

describe("o CSS nao mistura Tailwind v4 num projeto v3", () => {
  it("nao importa a folha do shadcn em sintaxe v4", () => {
    // `@theme inline` e sintaxe da v4: num projeto v3 sai crua no bundle e o
    // navegador ignora. Pior, dava a impressao de que os tokens estavam
    // configurados — foi o que mascarou o problema acima.
    expect(css).not.toContain('@import "shadcn/tailwind.css"')
    expect(css).not.toContain("@theme inline")
  })
})

describe("popup em portal define a propria cor de texto", () => {
  // Componentes que renderizam em portal NAO herdam a cor de quem os abriu:
  // eles saem na raiz do documento. Fundo sem cor de texto = letra invisivel.
  it.each([
    ["dialog", "bg-background"],
    ["sheet", "bg-background"],
  ])("%s pareia fundo com cor de texto", (arquivo, fundo) => {
    const src = ler("src", "components", "ui", `${arquivo}.tsx`)
    expect(src).toContain(fundo)
    expect(src).toContain("text-foreground")
  })
})

/**
 * Encoding do texto da interface.
 *
 * Esta varredura existe porque o hook de gravacao NAO cobre tudo: ele so ve
 * Write/Edit. Um arquivo reescrito por script de shell entra sem passar por
 * hook nenhum — foi assim que 3 telas ganharam mojibake de uma vez, por um
 * `Get-Content -Raw` que leu UTF-8 como cp1252 no PowerShell 5.1.
 * O hook pega na hora; este teste pega o repositorio inteiro.
 */
describe("encoding do texto da interface", () => {
  const arquivos = readdirSync(resolve(raiz, "src"), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))

  const culpados = (regra: RegExp) =>
    arquivos.filter((f) => regra.test(ler("src", f)))

  it("nenhum arquivo tem \\u00XX escrito como texto", () => {
    // `Automações` aparecia exatamente assim na tela: em JSX o `\u`
    // fora de string literal nao e interpretado.
    expect(culpados(/\\u00[0-9a-f]{2}/i)).toEqual([])
  })

  it("nenhum arquivo tem mojibake", () => {
    // Um acento vira dois caracteres quando o arquivo UTF-8 e lido como
    // cp1252 e regravado: `ç` -> `Ã§`, `—` -> `â€"`.
    expect(culpados(/[ÃÂ][-¿]|â€/)).toEqual([])
  })

  it("nenhum arquivo comeca com BOM", () => {
    // O BOM nao atrapalha o TypeScript, mas atrapalhou o SQL do bootstrap
    // ("syntax error at or near") e sinaliza que um editor Windows regravou
    // o arquivo — normalmente junto com o mojibake acima.
    expect(culpados(/^﻿/)).toEqual([])
  })
})
