#!/usr/bin/env node
// @ts-check
/**
 * pre-write-guard.mjs — Hook PreToolUse (Write|Edit|MultiEdit).
 *
 * BLOQUEIA (exit 2) a gravacao de codigo que viola as regras absolutas da base,
 * ANTES de o arquivo ser escrito. Hooks impoem regras a 100% — markdown so ~70%.
 *
 * Regras bloqueadas:
 *   - Prisma          (projeto usa Drizzle)
 *   - SQLite          (projeto usa PostgreSQL)
 *   - Delete fisico   (db.delete / deleteMany — usar soft delete)
 *   - Editar .env     (secrets ficam fora do git; use .env.example)
 *
 * Fail-open: qualquer erro interno -> exit 0 (nunca trava o fluxo do dev).
 * Para desativar temporariamente, remova o bloco PreToolUse de .claude/settings.json.
 */

import { basename, extname, resolve } from "node:path";

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);
const SKIP_PATH = /(^|[\\/])(node_modules|templates|docs|\.claude)[\\/]/;

/**
 * MerlostoreChat nasceu em Prisma e esta migrando para Drizzle
 * (docs/adr/0002-orm-transicao-prisma-drizzle.md). Bloquear Prisma hoje
 * travaria os ~50 route handlers legados que ainda precisam de manutencao.
 *
 * true  -> Prisma vira AVISO (o dev ve o alerta, mas a gravacao passa)
 * false -> Prisma volta a BLOQUEAR (padrao da base)
 *
 * Mudar para `false` no PR que remover a ultima referencia a @prisma/client.
 */
const MIGRACAO_ORM_EM_ANDAMENTO = true;

const RULES = [
  {
    id: "prisma",
    warnOnly: MIGRACAO_ORM_EM_ANDAMENTO,
    re: /@prisma\/client|new\s+PrismaClient|from\s+["']prisma["']|require\(["']@prisma\/client["']\)/,
    msg: "Prisma detectado. Codigo NOVO deve usar Drizzle (src/lib/db/schema/).",
  },
  {
    id: "sqlite",
    re: /better-sqlite3|drizzle-orm\/better-sqlite3|from\s+["']sqlite3?["']|:memory:/,
    msg: "SQLite detectado. Esta base usa PostgreSQL em todos os ambientes.",
  },
  {
    id: "texto-cru",
    // Dois defeitos de encoding com a mesma consequencia: texto errado na tela.
    //   1. Escape literal: `Automa\u00e7\u00f5es` chegou a ser renderizado
    //      exatamente assim. Fora de uma string, `\u` nao e interpretado.
    //   2. Mojibake: o editor le o arquivo UTF-8 como cp1252 e regrava; um
    //      acento vira dois caracteres (`\u00c3` + outro).
    // Os arquivos sao UTF-8. Escreva o caractere acentuado direto.
    re: /\\u00[89a-fA-F][0-9a-fA-F]|[\u00c3\u00c2][\u0080-\u00bf]|\u00e2\u20ac[\u0093\u0094\u009d\u00a6]/,
    msg: "Texto acentuado quebrado (escape unicode literal ou mojibake). Escreva o caractere acentuado direto: os arquivos sao UTF-8.",
  },
  {
    id: "delete-fisico",
    re: /\bdb\.delete\s*\(|\.deleteMany\s*\(/,
    msg: "Delete fisico detectado. Use soft delete: set is_deleted=true, deleted_at=now().",
  },
];

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function introducedText(tool, input) {
  if (!input) return "";
  if (tool === "Write") return String(input.content ?? "");
  if (tool === "Edit") return String(input.new_string ?? "");
  if (tool === "MultiEdit" && Array.isArray(input.edits)) {
    return input.edits.map((e) => String(e?.new_string ?? "")).join("\n");
  }
  return "";
}

function block(reason) {
  process.stderr.write(
    `[guard] Gravacao bloqueada pela Estrutura Base:\n${reason}\n` +
    `Corrija e tente novamente. (regras em CLAUDE.md / docs/)\n`
  );
  process.exit(2);
}

async function main() {
  const raw = (await readStdin()).replace(/^﻿/, ""); // strip BOM
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // fail-open
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const filePath = String(input.file_path || "");
  if (!filePath) process.exit(0);

  // So governa arquivos DENTRO deste projeto. Edicoes em outros projetos
  // (ex.: outro repo com stack diferente) nao sao bloqueadas por esta base.
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (projectDir) {
    const root = resolve(projectDir).toLowerCase();
    const target = resolve(filePath).toLowerCase();
    if (!target.startsWith(root)) process.exit(0);
  }

  const base = basename(filePath);

  // Protecao de .env (secrets) — vale para qualquer extensao.
  if (base === ".env" || base === ".env.production" || base === ".env.prod") {
    block(
      `Nao edite "${base}" diretamente (contem secrets, fica fora do git).\n` +
      `Use ".env.example" para documentar variaveis no template.`
    );
  }

  const ext = extname(filePath);
  if (!CODE_EXT.has(ext)) process.exit(0);       // .md e outros: liberado
  if (SKIP_PATH.test(filePath)) process.exit(0); // templates/docs/.claude: liberado

  const text = introducedText(tool, input);
  if (!text) process.exit(0);

  const lines = text.split("\n");
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      if (isComment(lines[i]) && rule.id !== "texto-cru") continue;
      if (!rule.re.test(lines[i])) continue;
      if (rule.warnOnly) {
        process.stderr.write(`[guard:aviso] [${rule.id}] L~${i + 1}: ${rule.msg}\n`);
        break; // um aviso por regra basta
      }
      block(`  [${rule.id}] L~${i + 1}: ${rule.msg}`);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // fail-open
