import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import {
  editarUsuarioSchema,
  deixariaSemAdmin,
  lojaCombinaComPapel,
  erroDeLojaEPapel,
  CAMPOS_DE_GESTAO,
} from "@/lib/usuarios"

/**
 * Edicao e desativacao de usuario. Só admin (RBAC).
 *
 * A trava importante aqui e a do ULTIMO ADMIN: sem ela, o admin conseguia se
 * rebaixar a vendedor ou se desativar, e a partir dali ninguem mais abria
 * integracoes nem cadastrava usuario — o sistema ficava sem dono e a saida era
 * mexer no banco a mao.
 */

/** Quantos OUTROS administradores ativos existem alem deste. */
async function outrosAdminsAtivos(idQueSai: string): Promise<number> {
  return prisma.user.count({
    where: { role: "admin", isActive: true, id: { not: idQueSai } },
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const alvo = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, storeId: true, isActive: true },
  })
  if (!alvo) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  }

  const parse = editarUsuarioSchema.safeParse(await req.json().catch(() => null))
  if (!parse.success) {
    return NextResponse.json(
      { error: "Dados inválidos", detalhes: parse.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const dados = parse.data

  // Papel e loja andam juntos: trocar so um dos dois deixa o par invalido e o
  // banco recusa. Por isso o par e sempre avaliado no estado FINAL.
  const papelFinal = dados.role ?? alvo.role
  const lojaFinal =
    dados.storeId !== undefined ? dados.storeId : alvo.storeId

  if (!lojaCombinaComPapel(papelFinal, lojaFinal)) {
    return NextResponse.json({ error: erroDeLojaEPapel(papelFinal) }, { status: 422 })
  }

  if (lojaFinal) {
    const loja = await prisma.store.findFirst({
      where: { id: lojaFinal },
      select: { id: true },
    })
    if (!loja) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 422 })
    }
  }

  // A decisao mora em `deixariaSemAdmin` (lib/usuarios.ts), funcao pura, para
  // poder ser testada caso a caso — varredura sobre o texto deste arquivo nao
  // provaria que a trava esta ligada.
  const semAdmin = deixariaSemAdmin({
    papelAtual: alvo.role,
    ativoAtual: alvo.isActive,
    papelFinal,
    ativoFinal: dados.isActive ?? alvo.isActive,
    outrosAdminsAtivos: await outrosAdminsAtivos(alvo.id),
  })

  if (semAdmin) {
    return NextResponse.json(
      {
        error:
          "Este é o último administrador ativo. Promova outra pessoa a administrador antes de alterar este acesso.",
      },
      { status: 409 }
    )
  }

  const atualizado = await prisma.user.update({
    where: { id },
    data: {
      ...(dados.name !== undefined && { name: dados.name.trim() }),
      ...(dados.role !== undefined && { role: dados.role }),
      ...(dados.storeId !== undefined && { storeId: dados.storeId }),
      ...(dados.isActive !== undefined && { isActive: dados.isActive }),
      ...(dados.password && { passwordHash: await hash(dados.password, 12) }),
    },
    select: CAMPOS_DE_GESTAO,
  })

  return NextResponse.json(atualizado)
}

/**
 * DELETE: desativa, nunca apaga (ADR 0005).
 *
 * O usuario aparece como autor de mensagens, pedidos e da trilha de auditoria.
 * Apagar a linha quebraria essas referencias e reescreveria o historico: a
 * mensagem passaria a nao ter quem a enviou. `isActive: false` ja barra o
 * login (`src/lib/auth.ts`).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const alvo = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  })
  if (!alvo) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  }

  if (alvo.id === usuario.id) {
    return NextResponse.json(
      { error: "Você não pode desativar o próprio acesso." },
      { status: 409 }
    )
  }

  const semAdmin = deixariaSemAdmin({
    papelAtual: alvo.role,
    ativoAtual: alvo.isActive,
    papelFinal: alvo.role,
    ativoFinal: false,
    outrosAdminsAtivos: await outrosAdminsAtivos(alvo.id),
  })

  if (semAdmin) {
    return NextResponse.json(
      {
        error:
          "Este é o último administrador ativo. Promova outra pessoa antes de desativá-lo.",
      },
      { status: 409 }
    )
  }

  const desativado = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: CAMPOS_DE_GESTAO,
  })

  return NextResponse.json(desativado)
}
