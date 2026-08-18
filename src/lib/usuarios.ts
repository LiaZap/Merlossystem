import { z } from "zod"

/**
 * Regras de cadastro de usuario.
 *
 * Isolado do route handler porque as mesmas regras valem em tres lugares:
 * criar (`POST /api/usuarios`), editar (`PUT /api/usuarios/[id]`) e o bootstrap
 * do primeiro admin (`/api/register`). Duplicar significava tres definicoes de
 * "quais papeis existem" — e foi exatamente esse tipo de divergencia que
 * quebrou a criacao de usuario: o `/api/register` aceitava o papel `"agent"`,
 * que nao existe no RBAC nem passa na constraint do banco.
 */

/**
 * Os papeis do sistema. Fonte unica — a mesma lista que o RBAC usa
 * (`src/lib/rbac.ts`) e que a constraint `users_loja_por_papel` exige.
 */
export const PAPEIS = ["admin", "gerente", "vendedor", "viewer"] as const
export type Papel = (typeof PAPEIS)[number]

/** Papeis que alcancam as duas lojas e por isso NAO tem loja propria. */
export const PAPEIS_SEM_LOJA: readonly Papel[] = ["admin", "gerente"]

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
  viewer: "Somente leitura",
}

export const DESCRICAO_DO_PAPEL: Record<Papel, string> = {
  admin: "Acessa tudo, inclusive integrações e cadastro de usuários.",
  gerente: "Vê as duas lojas e opera o dia a dia. Não mexe em integrações nem em usuários.",
  vendedor: "Atende e vende na loja dele. Não vê a outra loja.",
  viewer: "Só leitura na loja dele. Não envia mensagem nem altera nada.",
}

/**
 * A loja combina com o papel?
 *
 * A regra tambem mora no banco (constraint `users_loja_por_papel`), de
 * proposito: insert direto no banco tem que respeitar. Aqui ela existe para a
 * API devolver uma mensagem que a pessoa entende, em vez de deixar o Postgres
 * estourar um erro de constraint cru na tela.
 */
export function lojaCombinaComPapel(papel: string, storeId: string | null): boolean {
  if (PAPEIS_SEM_LOJA.includes(papel as Papel)) return storeId === null
  return typeof storeId === "string" && storeId.length > 0
}

/** Mensagem para o usuario quando papel e loja nao combinam. */
export function erroDeLojaEPapel(papel: string): string {
  return PAPEIS_SEM_LOJA.includes(papel as Papel)
    ? `${ROTULO_DO_PAPEL[papel as Papel] ?? papel} alcança as duas lojas: não escolha uma loja.`
    : `${ROTULO_DO_PAPEL[papel as Papel] ?? papel} precisa estar em uma loja.`
}

/**
 * Senha minima de 8 caracteres.
 *
 * O `/api/register` pedia 6. Como aqui quem define a senha inicial e o admin, e
 * ela circula por fora do sistema ate a pessoa trocar, 8 e o piso.
 */
const senha = z.string().min(8, "A senha precisa de pelo menos 8 caracteres")

export const criarUsuarioSchema = z.object({
  name: z.string().min(2, "Informe o nome completo"),
  email: z.string().email("E-mail inválido"),
  password: senha,
  role: z.enum(PAPEIS),
  /** Obrigatoria para vendedor e viewer; precisa ser nula para gestao. */
  storeId: z.string().nullable().optional(),
})

export const editarUsuarioSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(PAPEIS).optional(),
  storeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  /** Trocar a senha e opcional; string vazia nao conta como troca. */
  password: senha.optional(),
})

/**
 * A alteracao deixaria o sistema sem administrador ativo?
 *
 * Funcao pura de proposito: e a regra que impede trancar a empresa para fora, e
 * uma varredura sobre o texto do route handler nao prova nada — desligar o `if`
 * passaria despercebido. Aqui a decisao e testavel caso a caso.
 *
 * Duas formas de perder o ultimo admin, e as duas contam: rebaixar o papel, ou
 * desativar o acesso.
 */
export function deixariaSemAdmin(estado: {
  /** Papel de quem esta sendo alterado, antes da mudanca. */
  papelAtual: string
  /** O acesso esta ativo hoje? Quem ja esta inativo nao "perde o posto". */
  ativoAtual: boolean
  /** Papel depois da alteracao. */
  papelFinal: string
  /** Estado depois da alteracao. */
  ativoFinal: boolean
  /** Quantos OUTROS administradores ativos existem. */
  outrosAdminsAtivos: number
}): boolean {
  const eraAdminAtivo = estado.papelAtual === "admin" && estado.ativoAtual
  if (!eraAdminAtivo) return false

  const continuaAdminAtivo = estado.papelFinal === "admin" && estado.ativoFinal
  if (continuaAdminAtivo) return false

  return estado.outrosAdminsAtivos === 0
}

/** Campos que a API pode devolver. `passwordHash` nunca entra nesta lista. */
export const CAMPOS_PUBLICOS = {
  id: true,
  name: true,
  role: true,
  avatarUrl: true,
  storeId: true,
} as const

/** Acrescimo so para a tela de gestao de equipe (admin). */
export const CAMPOS_DE_GESTAO = {
  ...CAMPOS_PUBLICOS,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const
