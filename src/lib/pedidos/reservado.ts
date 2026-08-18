import { prisma } from "@/lib/db/prisma"

/**
 * Quanto ja foi prometido e ainda nao chegou ao Bling.
 *
 * O vinculo Masc -> Bling e em tempo real, entao o saldo do Bling ja reflete a
 * venda da loja fisica no instante em que ela acontece. Sobra UMA janela em que
 * o Bling nao sabe: o pedido do canal que ainda esta `pendente` de lancamento
 * no Masc (ADR 0004).
 *
 * Enquanto esse pedido espera, a peca ja foi prometida a uma cliente mas o Bling
 * continua contando ela como disponivel. Mostrar o saldo cru do Bling nessa
 * janela e prometer duas vezes a mesma peca.
 *
 * Aqui NAO se escreve nada em lugar nenhum: e uma soma sobre pedidos nossos.
 */

/** Item do pedido, como fica gravado em `orders.items` (Json). */
type ItemGravado = {
  productId?: string
  quantity?: number
}

/**
 * Soma, por SKU, a quantidade em pedidos pendentes de lancamento no Masc.
 *
 * A chave e o SKU e nao o id porque e o unico campo que existe dos dois lados:
 * `products.sku` aqui e `codigo` no Bling. Produto local sem SKU fica de fora —
 * nao ha como saber a qual produto do Bling ele corresponde, e chutar
 * descontaria do produto errado.
 */
export async function reservadoPorSku(storeId: string): Promise<Map<string, number>> {
  const pendentes = await prisma.order.findMany({
    where: {
      storeId,
      mascStatus: "pendente",
      // Pedido cancelado nao reserva nada — a peca voltou para a prateleira.
      status: { notIn: ["cancelled", "returned"] },
    },
    select: { items: true },
  })

  const porProduto = new Map<string, number>()
  for (const pedido of pendentes) {
    const itens = Array.isArray(pedido.items) ? (pedido.items as ItemGravado[]) : []
    for (const item of itens) {
      if (!item?.productId) continue
      const qtd = Number(item.quantity)
      if (!Number.isFinite(qtd) || qtd <= 0) continue
      porProduto.set(item.productId, (porProduto.get(item.productId) ?? 0) + qtd)
    }
  }
  if (porProduto.size === 0) return new Map()

  const produtos = await prisma.product.findMany({
    where: { id: { in: Array.from(porProduto.keys()) }, sku: { not: null } },
    select: { id: true, sku: true },
  })

  const porSku = new Map<string, number>()
  for (const p of produtos) {
    const qtd = porProduto.get(p.id) ?? 0
    if (qtd > 0 && p.sku) porSku.set(p.sku, (porSku.get(p.sku) ?? 0) + qtd)
  }
  return porSku
}
