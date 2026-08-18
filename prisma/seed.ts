import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { hash } from "bcryptjs"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const agora = Date.now()
const min = (n: number) => new Date(agora - n * 60_000)
const dias = (n: number) => new Date(agora - n * 86_400_000)

/**
 * Dados de demonstracao das DUAS lojas (Centro e Cerro Azul).
 *
 * Limpa tudo antes de semear: os dados sao mock (decisao 4 de
 * docs/integracoes.md), nao ha historico a preservar.
 *
 * O seed prova de proposito tres regras da etapa 1:
 *   - a mesma cliente existe nas duas lojas como DOIS contatos (decisao 5);
 *   - SKU e atalho de resposta rapida repetem entre lojas (unique por loja);
 *   - gestao (admin, gerente) nao tem loja; vendedor tem.
 */
async function limpar() {
  // Ordem inversa das FKs.
  await prisma.messageMedia.deleteMany()
  await prisma.message.deleteMany()
  await prisma.satisfactionSurvey.deleteMany()
  await prisma.consentLog.deleteMany()
  await prisma.broadcastRecipient.deleteMany()
  await prisma.broadcast.deleteMany()
  await prisma.scheduledMessage.deleteMany()
  await prisma.alert.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderEvent.deleteMany()
  await prisma.return.deleteMany()
  await prisma.order.deleteMany()
  await prisma.dealEvent.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.mediaFile.deleteMany()
  await prisma.lookbook.deleteMany()
  await prisma.product.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.activityLog.deleteMany()
  await prisma.knowledgeArticle.deleteMany()
  await prisma.quickReply.deleteMany()
  await prisma.whatsappTemplate.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
  console.log("Base limpa")
}

const PRODUTOS = [
  { name: "Vestido Lua Cheia", sku: "VLC-001", category: "vestidos", sizeType: "both",
    sizes: ["P", "M", "G", "GG", "46", "48", "50", "52"], price: 189.9, compareAtPrice: 249.9,
    stock: { P: 5, M: 8, G: 6, GG: 3, "46": 4, "48": 3, "50": 2, "52": 1 },
    description: "Vestido midi em viscolycra com fenda lateral.", featured: true },
  { name: "Blusa Renda Romantica", sku: "BRR-002", category: "blusas", sizeType: "slim",
    sizes: ["P", "M", "G", "GG"], price: 89.9, stock: { P: 4, M: 7, G: 5, GG: 2 },
    description: "Blusa de renda com forro em cetim.", featured: false },
  { name: "Conjunto Rosa Quartzo", sku: "CRQ-003", category: "conjuntos", sizeType: "plussize",
    sizes: ["46", "48", "50", "52", "54"], price: 219.9, stock: { "46": 3, "48": 5, "50": 4, "52": 2, "54": 1 },
    description: "Conjunto de blazer e calca em alfaiataria.", featured: true },
  { name: "Jaqueta Couro Eco", sku: "JCE-004", category: "jaquetas", sizeType: "both",
    sizes: ["P", "M", "G", "46", "48"], price: 199.9, stock: { P: 2, M: 3, G: 2, "46": 2, "48": 1 },
    description: "Jaqueta em couro ecologico com forro.", featured: false },
]

const RESPOSTAS_RAPIDAS = [
  { title: "Informacoes de Frete", shortcut: "/frete", category: "frete",
    content: "Enviamos para todo o Brasil! Frete gratis acima de R$ 299." },
  { title: "Tabela de Medidas", shortcut: "/medidas", category: "medidas",
    content: "Slim: PP ao GG (34-44) | Plus Size: 46 ao 58." },
  { title: "Politica de Troca", shortcut: "/troca", category: "troca",
    content: "Trocas em ate 7 dias, peca com etiqueta." },
  { title: "Pagamento Pix", shortcut: "/pix", category: "pagamento",
    content: "Pix com 5% de desconto, confirmado na hora." },
]

type Loja = { id: string; nome: string }
type Equipe = { adminId: string; gerenteId: string; vendedorId: string }

/** Cria o conjunto operacional de uma loja. */
async function semearLoja(loja: Loja, equipe: Equipe, variacao: number) {
  const storeId = loja.id

  await prisma.product.createMany({
    data: PRODUTOS.map((p) => ({ ...p, storeId, active: true })),
  })

  await prisma.quickReply.createMany({
    data: RESPOSTAS_RAPIDAS.map((r) => ({ ...r, storeId, isActive: true })),
  })

  await prisma.knowledgeArticle.create({
    data: {
      storeId,
      title: "Politica de Troca e Devolucao",
      category: "troca",
      tags: ["troca", "devolucao"],
      content: "Prazo: 7 dias. Peca com etiqueta. Frete por nossa conta.",
      createdBy: equipe.adminId,
    },
  })

  // A MESMA cliente (5511999001001) e semeada nas duas lojas de proposito:
  // carteira isolada (decisao 5). Sao dois contatos, e isso e o esperado.
  const maria = await prisma.contact.create({
    data: {
      storeId, name: "Maria Silva", phone: "5511999001001", whatsappId: "5511999001001",
      preferredSize: "plussize", tags: ["vip", "recorrente"],
      totalOrders: 5 - variacao, totalSpent: 890.5, lastContactAt: min(2),
      notes: `Cliente fiel da loja ${loja.nome}.`,
    },
  })

  const ana = await prisma.contact.create({
    data: {
      storeId, name: `Ana Souza (${loja.nome})`, phone: `551199900${variacao}002`,
      instagramId: `ana.souza.${variacao}`, preferredSize: "slim", tags: ["nova"],
      lastContactAt: min(60),
    },
  })

  const conversaWhats = await prisma.conversation.create({
    data: {
      storeId, contactId: maria.id, channel: "whatsapp", status: "open",
      assignedTo: equipe.vendedorId, lastMessageAt: min(5),
      lastMessagePreview: "E o frete pra capital?", unreadCount: 2, priority: "high",
    },
  })
  await prisma.message.createMany({
    data: [
      { storeId, conversationId: conversaWhats.id, senderType: "customer",
        content: "Oi! Tudo bem?", createdAt: min(60) },
      { storeId, conversationId: conversaWhats.id, senderType: "agent", senderId: equipe.vendedorId,
        content: "Oi Maria! Tudo otimo! Como posso ajudar?", createdAt: min(58) },
      { storeId, conversationId: conversaWhats.id, senderType: "customer",
        content: "Voces tem o vestido no 48?", createdAt: min(50) },
      { storeId, conversationId: conversaWhats.id, senderType: "customer",
        content: "E o frete pra capital?", createdAt: min(5) },
    ],
  })

  const conversaInsta = await prisma.conversation.create({
    data: {
      storeId, contactId: ana.id, channel: "instagram", status: "pending",
      lastMessageAt: min(30), lastMessagePreview: "Qual o preco da blusa de renda?",
      unreadCount: 1, priority: "medium",
    },
  })
  await prisma.message.create({
    data: {
      storeId, conversationId: conversaInsta.id, senderType: "customer",
      content: "Oi! Qual o preco da blusa de renda?", createdAt: min(30),
    },
  })

  await prisma.deal.createMany({
    data: [
      { storeId, contactId: maria.id, conversationId: conversaWhats.id,
        assignedTo: equipe.vendedorId, stage: "negotiating", value: 189.9,
        products: [{ name: "Vestido Lua Cheia", size: "48", qty: 1 }],
        notes: "Perguntou frete" },
      { storeId, contactId: ana.id, conversationId: conversaInsta.id, stage: "lead",
        value: 89.9, products: [{ name: "Blusa Renda Romantica", size: "M", qty: 1 }] },
    ],
  })

  // orderNumber tambem e unico por loja: o mesmo numero existe nas duas.
  const pedido = await prisma.order.create({
    data: {
      storeId, contactId: maria.id, orderNumber: "MS2608-0001", status: "shipped",
      items: [{ name: "Jaqueta Couro Eco", size: "M", quantity: 1, unitPrice: 199.9 }],
      subtotal: 199.9, shippingCost: 18.9, total: 218.8,
      paymentMethod: "pix", paymentStatus: "paid", shippingMethod: "correios_sedex",
      trackingCode: `BR00000000${variacao}BR`, createdBy: equipe.vendedorId,
    },
  })
  await prisma.orderEvent.createMany({
    data: [
      { orderId: pedido.id, status: "confirmed", description: "Pedido criado", createdAt: dias(3) },
      { orderId: pedido.id, status: "shipped", description: "Enviado", createdAt: dias(1) },
    ],
  })

  await prisma.alert.createMany({
    data: [
      { storeId, type: "hot_lead", severity: "medium", conversationId: conversaWhats.id,
        contactId: maria.id, message: `Lead quente em ${loja.nome}: Maria perguntou preco` },
      { storeId, type: "first_contact", severity: "medium", contactId: ana.id,
        message: `Nova cliente em ${loja.nome}: Ana Souza` },
    ],
  })

  console.log(`  ${loja.nome}: 4 produtos, 2 contatos, 2 conversas, 2 deals, 1 pedido`)
}

async function main() {
  console.log("Semeando as duas lojas...")
  await limpar()

  const centro = await prisma.store.create({
    data: { nome: "Centro", slug: "centro", blingDepositoId: null },
  })
  const cerroAzul = await prisma.store.create({
    data: { nome: "Cerro Azul", slug: "cerro-azul", blingDepositoId: null },
  })
  console.log("2 lojas criadas: Centro, Cerro Azul")

  const senha = await hash("admin123", 12)

  // Gestao: storeId NULO — alcanca as duas lojas (constraint users_loja_por_papel).
  const admin = await prisma.user.create({
    data: { name: "Camila Santos", email: "admin@merlosstore.com", passwordHash: senha,
      role: "admin", storeId: null },
  })
  const gerente = await prisma.user.create({
    data: { name: "Renata Dias", email: "gerente@merlosstore.com", passwordHash: senha,
      role: "gerente", storeId: null },
  })

  // Vendedoras: uma loja cada, obrigatoriamente.
  const vendedoraCentro = await prisma.user.create({
    data: { name: "Jessica Oliveira", email: "jessica@merlosstore.com", passwordHash: senha,
      role: "vendedor", storeId: centro.id },
  })
  const vendedoraCerro = await prisma.user.create({
    data: { name: "Bruna Lima", email: "bruna@merlosstore.com", passwordHash: senha,
      role: "vendedor", storeId: cerroAzul.id },
  })
  const viewerCentro = await prisma.user.create({
    data: { name: "Paula Reis", email: "paula@merlosstore.com", passwordHash: senha,
      role: "viewer", storeId: centro.id },
  })
  console.log("5 usuarios: 1 admin, 1 gerente (sem loja) + 2 vendedoras e 1 viewer (com loja)")

  await semearLoja(centro, { adminId: admin.id, gerenteId: gerente.id, vendedorId: vendedoraCentro.id }, 1)
  await semearLoja(cerroAzul, { adminId: admin.id, gerenteId: gerente.id, vendedorId: vendedoraCerro.id }, 2)

  console.log(`
Seed concluido.

Logins (senha: admin123)
  admin@merlosstore.com     admin    — as duas lojas, tudo
  gerente@merlosstore.com   gerente  — as duas lojas, menos config e usuario
  jessica@merlosstore.com   vendedor — so Centro
  bruna@merlosstore.com     vendedor — so Cerro Azul
  paula@merlosstore.com     viewer   — so Centro, leitura

Voluntariamente repetido entre as lojas, para provar o isolamento:
  telefone 5511999001001, SKU VLC-001, pedido MS2608-0001, atalho /frete`)
  console.log(`  ${viewerCentro.email} criado`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
