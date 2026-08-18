import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, ehGestao } from "@/lib/loja"
import { listarProdutos, listarSaldos, saldoNoDeposito, ehBlingError } from "@/lib/bling/cliente"
import { ehBlingConfigError } from "@/lib/bling/config"
import { reservadoPorSku } from "@/lib/pedidos/reservado"

/**
 * Catalogo e saldo vindos do Bling — **leitura apenas, em definitivo**.
 *
 * A decisao 8 fechou: o Masc e o dono da venda e o Bling e a autoridade de
 * estoque, alimentado pelo vinculo Masc->Bling. Escrever estoque daqui baixaria
 * a mesma peca duas vezes. Nao e cautela temporaria, e a arquitetura —
 * ver docs/adr/0004-fontes-da-verdade.md.
 *
 * O saldo sai por DEPOSITO: a conta do Bling e unica da rede e o deposito e o
 * que separa Centro de Cerro Azul (decisao 6). Saldo sem deposito seria a soma
 * das duas lojas — numero que nao serve para atender ninguem.
 */
export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const integracao = await prisma.storeIntegracao.findFirst({
    where: { provedor: "bling", isDeleted: false },
    select: { id: true, status: true },
  })
  if (!integracao) {
    return NextResponse.json({ error: "Bling nao esta conectado" }, { status: 409 })
  }

  // A loja define o deposito. Vendedor usa a dele; gestao escolhe pelo seletor.
  const escopo = escopoDaLoja(usuario, lojaAtiva(req))
  const lojas = await prisma.store.findMany({
    where: { isDeleted: false, ativo: true, ...(escopo.storeId ? { id: escopo.storeId } : {}) },
    select: { id: true, nome: true, blingDepositoId: true },
  })

  // Gestao sem loja escolhida veria a soma das duas — melhor pedir a escolha.
  if (lojas.length !== 1) {
    return NextResponse.json(
      {
        error: ehGestao(usuario.role)
          ? "Escolha a loja no seletor: o saldo do Bling e por deposito"
          : "Usuario sem loja definida",
      },
      { status: 400 }
    )
  }

  const loja = lojas[0]
  if (!loja.blingDepositoId) {
    return NextResponse.json(
      { error: `A loja ${loja.nome} ainda nao tem deposito do Bling configurado` },
      { status: 409 }
    )
  }

  try {
    // Sem validar, `?pagina=abc` ia cru para a URL do Bling, voltava 400 e
    // marcava a integracao inteira como "erro" na tela.
    const pedida = Number(new URL(req.url).searchParams.get("pagina"))
    const pagina = Number.isInteger(pedida) && pedida >= 1 ? pedida : 1

    // Em sequencia, nao em paralelo: `idsProdutos[]` e obrigatorio no saldo, e
    // os ids so existem depois de a pagina de produtos voltar.
    const produtos = await listarProdutos(integracao.id, pagina)
    const saldos = await listarSaldos(
      integracao.id,
      loja.blingDepositoId,
      produtos.map((p) => p.id)
    )

    // Saldo DAQUELE deposito. O total que vem junto na resposta e a soma da
    // rede — mostrar ele seria somar Centro com Cerro Azul (decisao 6).
    const saldoPorProduto = new Map(
      saldos
        .filter((s) => s.produto?.id !== undefined)
        .map((s) => [String(s.produto!.id), saldoNoDeposito(s, loja.blingDepositoId!)])
    )

    // O que ja prometemos e ainda nao chegou ao Bling. Com o vinculo
    // Masc -> Bling em tempo real, esta e a UNICA janela em que o saldo do
    // Bling superestima o disponivel (ADR 0004).
    const reservado = await reservadoPorSku(loja.id)

    return NextResponse.json({
      loja: { id: loja.id, nome: loja.nome, deposito: loja.blingDepositoId },
      pagina,
      produtos: produtos.map((p) => ({
        id: String(p.id),
        nome: p.nome ?? null,
        codigo: p.codigo ?? null,
        preco: p.preco ?? null,
        situacao: p.situacao ?? null,
        /** Saldo do deposito, como o Bling responde agora. */
        saldo: saldoPorProduto.get(String(p.id)) ?? null,
        /** Prometido por pedido nosso ainda nao lancado no Masc. */
        reservado: p.codigo ? (reservado.get(p.codigo) ?? 0) : 0,
        /**
         * O que da para prometer com seguranca = saldo - reservado.
         * `null` quando o Bling nao informou saldo: nao saber nao pode virar
         * zero, senao a vendedora recusa peca que existe.
         */
        disponivel: descontar(saldoPorProduto.get(String(p.id)) ?? null, p.codigo, reservado),
      })),
    })
  } catch (e) {
    if (ehBlingConfigError(e)) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 })
    }
    if (ehBlingError(e)) {
      // 401 do Bling vira 409 aqui: quem chamou nao esta desautenticado no
      // nosso sistema — a integracao e que precisa ser reconectada.
      const status = e.status === 401 ? 409 : 502
      return NextResponse.json({ error: "Bling: " + e.message }, { status })
    }
    console.error("[Bling] Catalogo:", e)
    return NextResponse.json({ error: "Erro ao consultar o Bling" }, { status: 500 })
  }
}

/**
 * Desconta do saldo o que ja foi prometido, sem deixar negativo virar promessa.
 *
 * Casa por SKU (`products.sku` aqui, `codigo` la) porque e o unico campo que
 * existe dos dois lados. Produto sem codigo nao desconta nada: descontar do
 * produto errado e pior do que nao descontar.
 */
function descontar(
  saldo: number | null,
  codigo: string | null | undefined,
  reservado: Map<string, number>
): number | null {
  if (saldo === null) return null
  if (!codigo) return saldo
  return Math.max(0, saldo - (reservado.get(codigo) ?? 0))
}
