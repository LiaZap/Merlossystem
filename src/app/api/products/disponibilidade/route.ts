import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, ehGestao } from "@/lib/loja"
import { listarProdutosPorCodigo, listarSaldos, saldoNoDeposito } from "@/lib/bling/cliente"
import { reservadoPorSku } from "@/lib/pedidos/reservado"

/**
 * Catalogo da loja com a disponibilidade real, para a tela de venda.
 *
 * Existe separada de `/api/integracoes/bling/catalogo` por dois motivos, e os
 * dois sao decisivos:
 *
 *  1. **Quem usa e a vendedora.** A rota de integracoes e so de admin no RBAC
 *     (credencial de integracao e outra coisa); vendedor tomaria 403 e a tela
 *     de venda nao funcionaria.
 *  2. **O pedido referencia o produto DAQUI.** `orders.items[].productId` e o id
 *     do nosso `products` — e o que `reservadoPorSku` usa para saber o que ja
 *     foi prometido. Montar a venda a partir do id do Bling quebraria a conta.
 *
 * Tres numeros por produto, e a diferenca importa (ADR 0004):
 *   saldo      o que o Bling responde agora para o deposito da loja
 *   reservado  o que ja prometemos em pedido ainda nao lancado no Masc
 *   disponivel saldo - reservado, o que da para prometer com seguranca
 *
 * **Nao escreve nada.** Nem aqui, nem no Bling.
 */

type Disponibilidade = { saldo: number | null; reservado: number; disponivel: number | null }

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const escopo = escopoDaLoja(usuario, lojaAtiva(req))
  const lojas = await prisma.store.findMany({
    where: { isDeleted: false, ativo: true, ...(escopo.storeId ? { id: escopo.storeId } : {}) },
    select: { id: true, nome: true, blingDepositoId: true },
  })

  // Saldo e por deposito, e deposito e por loja: sem saber a loja nao ha
  // resposta correta, so a soma das duas (decisao 6).
  if (lojas.length !== 1) {
    return NextResponse.json(
      {
        error: ehGestao(usuario.role)
          ? "Escolha a loja no seletor: o estoque e por loja"
          : "Usuario sem loja definida",
      },
      { status: 400 }
    )
  }
  const loja = lojas[0]

  const busca = (new URL(req.url).searchParams.get("busca") || "").trim()
  const produtos = await prisma.product.findMany({
    where: {
      storeId: loja.id,
      active: true,
      ...(busca
        ? {
            OR: [
              { name: { contains: busca, mode: "insensitive" as const } },
              { sku: { contains: busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, sku: true, price: true, sizes: true, imageUrls: true },
    orderBy: { name: "asc" },
    take: 50,
  })

  const disponibilidade = await disponibilidadeDoBling(loja, produtos)

  return NextResponse.json({
    loja: { id: loja.id, nome: loja.nome },
    /** `false` quando nao deu para consultar o Bling — a tela precisa avisar. */
    estoqueAoVivo: disponibilidade !== null,
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.name,
      sku: p.sku,
      preco: Number(p.price),
      tamanhos: p.sizes,
      imagem: p.imageUrls[0] ?? null,
      ...(disponibilidade?.get(p.id) ?? { saldo: null, reservado: 0, disponivel: null }),
    })),
  })
}

/**
 * Saldo do Bling + reserva local, por produto nosso.
 *
 * Devolve `null` quando nao deu para consultar (Bling desconectado, loja sem
 * deposito, API fora). A tela mostra o catalogo mesmo assim, avisando que o
 * estoque nao esta ao vivo — recusar a venda inteira por causa disso seria
 * pior do que vender com o aviso na tela.
 */
async function disponibilidadeDoBling(
  loja: { id: string; blingDepositoId: string | null },
  produtos: { id: string; sku: string | null }[]
): Promise<Map<string, Disponibilidade> | null> {
  if (!loja.blingDepositoId) return null
  const comSku = produtos.filter((p) => p.sku)
  if (comSku.length === 0) return null

  const integracao = await prisma.storeIntegracao.findFirst({
    where: { provedor: "bling", isDeleted: false, status: "conectado" },
    select: { id: true },
  })
  if (!integracao) return null

  const reservado = await reservadoPorSku(loja.id)

  const semSaldo = (): Map<string, Disponibilidade> =>
    new Map(
      produtos.map((p) => [
        p.id,
        { saldo: null, reservado: (p.sku && reservado.get(p.sku)) || 0, disponivel: null },
      ])
    )

  try {
    // Duas chamadas, nesta ordem obrigatoria: o saldo exige `idsProdutos[]` e
    // nao aceita codigo, entao primeiro descobrimos o id de cada SKU la.
    const doBling = await listarProdutosPorCodigo(
      integracao.id,
      comSku.map((p) => p.sku!)
    )
    if (doBling.length === 0) return semSaldo()

    const saldos = await listarSaldos(
      integracao.id,
      loja.blingDepositoId,
      doBling.map((p) => p.id)
    )

    // codigo do Bling === nosso sku: e o unico campo que existe dos dois lados.
    const codigoPorId = new Map(doBling.map((p) => [String(p.id), p.codigo]))
    const saldoPorCodigo = new Map<string, number | null>()
    for (const s of saldos) {
      const codigo = s.produto?.codigo ?? codigoPorId.get(String(s.produto?.id))
      if (codigo) saldoPorCodigo.set(codigo, saldoNoDeposito(s, loja.blingDepositoId))
    }

    return new Map(
      produtos.map((p) => {
        const res = (p.sku && reservado.get(p.sku)) || 0
        const saldo = p.sku ? (saldoPorCodigo.get(p.sku) ?? null) : null
        return [
          p.id,
          {
            saldo,
            reservado: res,
            // Nao saber nao pode virar zero: a vendedora recusaria peca que existe.
            disponivel: saldo === null ? null : Math.max(0, saldo - res),
          },
        ]
      })
    )
  } catch (e) {
    // Bling fora do ar nao pode derrubar o atendimento.
    console.error("[Disponibilidade] Bling:", e)
    return semSaldo()
  }
}
