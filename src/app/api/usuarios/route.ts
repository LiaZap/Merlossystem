import { NextResponse } from "next/server"
import { registrar } from "@/lib/auditoria"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { lojaAtiva, ehGestao } from "@/lib/loja"
import {
  criarUsuarioSchema,
  lojaCombinaComPapel,
  erroDeLojaEPapel,
  CAMPOS_PUBLICOS,
  CAMPOS_DE_GESTAO,
} from "@/lib/usuarios"

/**
 * GET: dois usos, duas superficies.
 *
 * Sem `?detalhe=1` — aberto a todo papel — devolve o minimo para o seletor de
 * transferencia do chat: id, nome, papel, avatar, loja. Nada de e-mail.
 *
 * Com `?detalhe=1` — so admin — devolve o que a tela de Equipe precisa
 * (e-mail, ativo, ultimo acesso) e inclui os desativados, para poder reativar.
 *
 * A separacao existe porque a leitura basica precisou ser aberta a todos (o
 * vendedor transfere conversa), e abrir a lista inteira junto entregaria o
 * e-mail de todo mundo a qualquer atendente.
 */
export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const querDetalhe = searchParams.get("detalhe") === "1"

  if (querDetalhe && usuario.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores veem os dados da equipe." },
      { status: 403 }
    )
  }

  // Vendedor: a loja e a do cadastro dele, nunca a pedida no request (cookie e
  // query string sao do cliente). Gestao: a loja escolhida no seletor, ou as
  // duas quando nao escolheu.
  const loja = ehGestao(usuario.role) ? lojaAtiva(req) : usuario.storeId

  const usuarios = await prisma.user.findMany({
    where: {
      // A tela de Equipe precisa ver quem esta desativado para reativar; o
      // seletor de transferencia, nao — nao se transfere para quem saiu.
      ...(querDetalhe ? {} : { isActive: true }),
      // `storeId: null` = gestao, que atende as duas lojas. Sem loja definida
      // (gestao sem seletor), lista todos.
      ...(loja ? { OR: [{ storeId: loja }, { storeId: null }] } : {}),
    },
    select: querDetalhe ? CAMPOS_DE_GESTAO : CAMPOS_PUBLICOS,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })

  return NextResponse.json(usuarios)
}

/**
 * POST: cadastra usuario. Só admin (RBAC).
 *
 * Existe porque nao havia caminho funcionando: o `/api/register` criava com o
 * papel `"agent"`, que nao existe no RBAC (o usuario nao conseguia acessar
 * nada) e nao passa na constraint `users_loja_por_papel` — os dois ramos do
 * CHECK exigem `admin|gerente` sem loja ou `vendedor|viewer` com loja. Toda
 * criacao depois do primeiro admin batia no banco e falhava.
 *
 * Nao ha convite por e-mail: o admin define a senha inicial e a entrega a
 * pessoa. Fingir um convite que nao sai do sistema seria pior.
 */
export async function POST(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const parse = criarUsuarioSchema.safeParse(await req.json().catch(() => null))
  if (!parse.success) {
    return NextResponse.json(
      { error: "Dados inválidos", detalhes: parse.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const dados = parse.data
  const storeId = dados.storeId ?? null

  if (!lojaCombinaComPapel(dados.role, storeId)) {
    return NextResponse.json({ error: erroDeLojaEPapel(dados.role) }, { status: 422 })
  }

  // Loja tem que existir de verdade: id vindo do corpo do request.
  if (storeId) {
    const loja = await prisma.store.findFirst({ where: { id: storeId }, select: { id: true } })
    if (!loja) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 422 })
    }
  }

  const email = dados.email.trim().toLowerCase()
  const jaExiste = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (jaExiste) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 })
  }

  try {
    const criado = await prisma.user.create({
      data: {
        name: dados.name.trim(),
        email,
        passwordHash: await hash(dados.password, 12),
        role: dados.role,
        storeId,
      },
      select: CAMPOS_DE_GESTAO,
    })
    await registrar({
      storeId: criado.storeId,
      userId: usuario.id,
      acao: "usuario_criado",
      entidade: "usuario",
      entidadeId: criado.id,
      // Sem a senha: `registrar` filtra, mas nem chega a receber.
      detalhes: { nome: criado.name, email: criado.email, papel: criado.role },
      req,
    })

    return NextResponse.json(criado, { status: 201 })
  } catch (e) {
    // P2002 = unicidade. A checagem acima resolve o caso comum; isto cobre
    // dois admins cadastrando o mesmo e-mail ao mesmo tempo, que sem o catch
    // devolveria 500 em vez de dizer o que houve.
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 })
    }
    throw e
  }
}
