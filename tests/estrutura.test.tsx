/**
 * Smoke test da estrutura base.
 *
 * Prova duas coisas que, se quebrarem, quebram tudo o mais em silencio:
 *   1. o auditor de conformidade realmente pega violacao (guarda-corpo do projeto);
 *   2. o setup de teste de componente (jsdom + Testing Library) esta de pe.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Button } from "@/components/ui/button";

const ROOT = resolve(__dirname, "..");
const CHECKER = join(ROOT, "scripts", "check-compliance.mjs");

/** Roda o auditor num arquivo e devolve o relatorio JSON. */
function auditar(codigo: string) {
  const dir = mkdtempSync(join(tmpdir(), "compliance-"));
  const arquivo = join(dir, "alvo.ts");
  writeFileSync(arquivo, codigo, "utf8");
  try {
    let saida = "";
    try {
      saida = execFileSync(process.execPath, [CHECKER, "--file", arquivo, "--json"], {
        encoding: "utf8",
        cwd: ROOT,
      });
    } catch (e: any) {
      saida = String(e.stdout ?? ""); // exit 1 quando ha erro — JSON vem no stdout
    }
    return JSON.parse(saida) as {
      ok: boolean;
      findings: { level: string; id: string }[];
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ids = (codigo: string) => auditar(codigo).findings.map((f) => f.id);

describe("auditor de conformidade", () => {
  it("aprova codigo limpo", () => {
    expect(auditar("export const x = 1;\n").ok).toBe(true);
  });

  it("pega SQLite", () => {
    expect(ids('import db from "better-sqlite3";\n')).toContain("sqlite");
  });

  it("pega delete fisico em codigo Drizzle novo (ERRO, sem excecao)", () => {
    const r = auditar("await db.delete(tabela);\n");
    expect(r.findings.find((f) => f.id === "delete-fisico")?.level).toBe("error");
  });

  it("pega delete fisico legado do Prisma", () => {
    expect(ids("await prisma.contact.delete({ where: { id } });\n"))
      .toContain("delete-fisico-legado");
  });

  it("isenta o delete exigido pela LGPD quando marcado", () => {
    const codigo = "await prisma.contact.delete({ where: { id } }); // compliance:delete-fisico-lgpd\n";
    expect(ids(codigo)).not.toContain("delete-fisico-legado");
  });

  it("pega segredo hardcoded", () => {
    expect(ids('const k = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123";\n')).toContain("segredo");
  });

  it("exige colunas de auditoria em tabela Drizzle nova", () => {
    const codigo = `export const t = pgTable("clientes", { id: uuid("id") });\n`;
    const achado = auditar(codigo).findings.find((f) => f.id === "tabela-sem-auditoria");
    expect(achado?.level).toBe("error");
  });
});

describe("setup de componente", () => {
  it("renderiza um componente do design system", () => {
    render(<Button>Enviar</Button>);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });
});
