#!/usr/bin/env node
// @ts-check
/**
 * db-backup.mjs — Dump do banco no padrao do CLAUDE.md.
 *
 * Uso:
 *   npm run db:backup                      # usa DATABASE_URL do ambiente/.env
 *   npm run db:backup -- --url <conn>      # outra conexao (ex.: HML)
 *   npm run db:backup -- --dir <pasta>     # destino (padrao: ~/Documents/DB_backups)
 *
 * Nome do arquivo: backup_DD_MM_YYYY_HH_MM.sql  (regra do CLAUDE.md)
 * Flags: --no-owner --no-acl --clean --if-exists
 *
 * Regra de DR: backup NUNCA fica so no servidor do banco. Este script grava
 * local; a copia off-server e responsabilidade do deploy (.github/workflows).
 *
 * Requer `pg_dump` no PATH (vem com o cliente PostgreSQL).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};

/** Le DATABASE_URL do .env sem depender de pacote externo. */
function urlFromEnvFile() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
  return m ? m[1] : undefined;
}

const url = flag("url") || process.env.DATABASE_URL || urlFromEnvFile();
if (!url) {
  console.error("DATABASE_URL nao encontrada (nem em --url, nem no ambiente, nem no .env).");
  process.exit(1);
}

const dir = flag("dir") || join(homedir(), "Documents", "DB_backups");
mkdirSync(dir, { recursive: true });

const p2 = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${p2(d.getDate())}_${p2(d.getMonth() + 1)}_${d.getFullYear()}_${p2(d.getHours())}_${p2(d.getMinutes())}`;
const file = join(dir, `backup_${stamp}.sql`);

try {
  execFileSync(
    "pg_dump",
    [url, "--no-owner", "--no-acl", "--clean", "--if-exists", `--file=${file}`],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
} catch (e) {
  console.error("pg_dump falhou. Confirme que o cliente PostgreSQL esta instalado e no PATH.");
  process.exit(1);
}

// Dump vazio "com sucesso" e a falha silenciosa classica de DR: so aparece no
// dia do restore. O schema sozinho ja passa de 1 KB com folga.
const bytes = statSync(file).size;
if (bytes < 1024) {
  console.error(`BACKUP SUSPEITO: ${file} tem ${bytes} bytes. Verifique a conexao.`);
  process.exit(1);
}

console.log(`OK — ${file} (${(bytes / 1024).toFixed(1)} KB)`);
console.log("Lembrete (DR): copie este arquivo para FORA do servidor do banco.");
