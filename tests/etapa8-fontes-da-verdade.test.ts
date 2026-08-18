/**
 * Etapa 8 — fontes da verdade (ADR 0004).
 *
 * A decisao 8 fechou: o Masc e o dono da VENDA, o Bling e a autoridade de
 * ESTOQUE (alimentado pelo vinculo Masc->Bling), e este sistema NAO escreve em
 * ERP nenhum. Estes testes travam as tres consequencias:
 *
 *   1. nenhuma escrita no Bling, nem por descuido;
 *   2. o saldo mostrado e o do DEPOSITO da loja, nunca a soma da rede;
 *   3. o pedido do canal nao some: fica pendente ate alguem lancar no Masc.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { saldoNoDeposito, type SaldoBling } from "@/lib/bling/cliente"
import { urlSaldosDoDeposito } from "@/lib/bling/config"
import { siglaDaLoja, prefixoDoMes, montarNumero } from "@/lib/pedidos/numero"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")

// ---------------------------------------------------------------------------
// 1. Nao escrevemos no ERP — e a decisao esta registrada
// ---------------------------------------------------------------------------

describe("este sistema nao escreve no ERP", () => {
  it("o ADR 0004 registra quem e dono de que", () => {
    // Sem o ADR, daqui a seis meses alguem liga a escrita achando que o
    // read-only era cautela provisoria. Era arquitetura.
    const adr = ler("docs", "adr", "0004-fontes-da-verdade.md")
    expect(adr).toMatch(/Masc/)
    expect(adr).toMatch(/dono da venda/i)
    expect(adr).toMatch(/estoque/i)
  })

  it("a rota do catalogo aponta para o ADR, nao para uma decisao pendente", () => {
    const src = ler("src", "app", "api", "integracoes", "bling", "catalogo", "route.ts")
    expect(src).toContain("0004")
    // A frase antiga dizia que a fonte da verdade "nao estiver definida".
    // Esta definida.
    expect(src).not.toMatch(/nao estiver definida/)
  })

  it("nenhuma rota de pedido chama o cliente do Bling", () => {
    // O caminho mais provavel de acidente: alguem "so avisa o Bling" ao criar
    // o pedido, e a peca sai duas vezes do estoque.
    for (const rota of [
      ["src", "app", "api", "orders", "route.ts"],
      ["src", "app", "api", "orders", "[id]", "route.ts"],
      ["src", "app", "api", "orders", "[id]", "masc", "route.ts"],
    ]) {
      expect(ler(...rota), rota.join("/")).not.toMatch(/@\/lib\/bling/)
    }
  })

  it("a ponte com o Masc nao finge integracao que nao existe", () => {
    const src = ler("src", "app", "api", "orders", "[id]", "masc", "route.ts")
    // Nao ha API publica conhecida do Masc. Nenhum fetch para fora aqui.
    expect(src).not.toMatch(/fetch\(/)
  })
})

// ---------------------------------------------------------------------------
// 2. Saldo por deposito, nunca o total da rede
// ---------------------------------------------------------------------------

describe("saldo e por deposito", () => {
  const CENTRO = "111"
  const CERRO = "222"
  const saldo: SaldoBling = {
    produto: { id: 9 },
    // O total da REDE. Mostrar isto seria dizer que o Centro tem 30.
    saldoFisicoTotal: 30,
    saldoVirtualTotal: 30,
    depositos: [
      { id: CENTRO, saldoFisico: 12 },
      { id: CERRO, saldoFisico: 18 },
    ],
  }

  it("le o saldo daquele deposito, nao a soma das duas lojas", () => {
    expect(saldoNoDeposito(saldo, CENTRO)).toBe(12)
    expect(saldoNoDeposito(saldo, CERRO)).toBe(18)
    expect(saldoNoDeposito(saldo, CENTRO)).not.toBe(saldo.saldoFisicoTotal)
  })

  it("deposito ausente vira null, nao zero", () => {
    // Zero diz "acabou" e trava a venda. Nao saber tem que aparecer como nao
    // saber, senao a vendedora recusa peca que existe.
    expect(saldoNoDeposito(saldo, "999")).toBeNull()
    expect(saldoNoDeposito({ produto: { id: 1 }, saldoFisicoTotal: 5 }, CENTRO)).toBeNull()
  })

  it("cai para o saldo virtual quando o fisico nao vem", () => {
    const s: SaldoBling = { depositos: [{ id: CENTRO, saldoVirtual: 7 }] }
    expect(saldoNoDeposito(s, CENTRO)).toBe(7)
  })

  it("o deposito vai no CAMINHO da URL — a API nao aceita por query", () => {
    expect(urlSaldosDoDeposito(CENTRO)).toMatch(/\/estoques\/saldos\/111$/)
  })

  it("a rota do catalogo usa o saldo do deposito, e nao o total", () => {
    const src = ler("src", "app", "api", "integracoes", "bling", "catalogo", "route.ts")
    expect(src).toContain("saldoNoDeposito")
    // Se `saldoFisicoTotal` aparecer aqui, alguem trocou o saldo da loja pela
    // soma da rede — que e exatamente o que a decisao 6 proibe.
    expect(src).not.toContain("saldoFisicoTotal")
  })

  it("o saldo so e pedido para produtos concretos — idsProdutos e obrigatorio", () => {
    const cliente = ler("src", "lib", "bling", "cliente.ts")
    expect(cliente).toContain("idsProdutos[]")
    // Lista vazia nao pode virar chamada: a API responde 400.
    expect(cliente).toMatch(/idsProdutos\.length === 0/)
  })
})

// ---------------------------------------------------------------------------
// 2b. A janela de oversell: o que prometemos e ainda nao chegou ao Bling
// ---------------------------------------------------------------------------

describe("disponivel para prometer = saldo do Bling - pendente de lancamento", () => {
  const rota = ler("src", "app", "api", "integracoes", "bling", "catalogo", "route.ts")

  it("o catalogo desconta o que ja foi prometido", () => {
    // O vinculo Masc->Bling e em tempo real, entao o saldo do Bling ja tem a
    // venda da loja fisica. A UNICA coisa que ele nao sabe e o pedido do canal
    // ainda pendente de lancamento — e essa e a janela de oversell.
    expect(rota).toContain("reservadoPorSku")
    expect(rota).toMatch(/disponivel:/)
    expect(rota).toMatch(/reservado:/)
  })

  it("saldo desconhecido continua desconhecido depois do desconto", () => {
    // Se `null` virasse 0, a vendedora recusaria peca que existe.
    expect(rota).toMatch(/if \(saldo === null\) return null/)
  })

  it("nunca desconta de produto que nao casou por SKU", () => {
    // Descontar do produto errado e pior do que nao descontar.
    expect(rota).toMatch(/if \(!codigo\) return saldo/)
  })

  it("desconto nao produz numero negativo", () => {
    expect(rota).toMatch(/Math\.max\(0,/)
  })

  it("pedido ja lancado ou cancelado nao reserva mais nada", () => {
    const src = ler("src", "lib", "pedidos", "reservado.ts")
    // Lancado ja chegou ao Bling pelo Masc; cancelado devolveu a peca.
    expect(src).toContain('mascStatus: "pendente"')
    expect(src).toMatch(/notIn: \["cancelled", "returned"\]/)
  })

  it("o calculo da reserva nao escreve nada", () => {
    const src = ler("src", "lib", "pedidos", "reservado.ts")
    expect(src).not.toMatch(/\.(create|update|delete|upsert)\(/)
  })
})

// ---------------------------------------------------------------------------
// 3. Numero do pedido: sequencial, sem colisao e sem buraco invisivel
// ---------------------------------------------------------------------------

describe("numero do pedido", () => {
  const agora = new Date("2026-08-17T12:00:00Z")

  it("separa as lojas pela sigla", () => {
    expect(siglaDaLoja("Merlos Centro")).toBe("MER")
    expect(siglaDaLoja("Cerro Azul")).toBe("CER")
  })

  it("acento e pontuacao nao viram lixo na sigla", () => {
    expect(siglaDaLoja("São Paulo")).toBe("SAO")
    expect(siglaDaLoja("A&B")).toBe("ABX")
    expect(siglaDaLoja("")).toBe("LOJ")
  })

  it("o prefixo carrega mes e loja", () => {
    expect(prefixoDoMes("Merlos Centro", agora)).toBe("MS2608-MER-")
  })

  it("o padding cobre 4 digitos e nao trunca acima disso", () => {
    expect(montarNumero("MS2608-MER-", 1)).toBe("MS2608-MER-0001")
    expect(montarNumero("MS2608-MER-", 9999)).toBe("MS2608-MER-9999")
    // O 10000 passa a ter 5 digitos — e por isso que o maior nao pode ser
    // buscado por ordem alfabetica: "10000" vem ANTES de "9999" no texto.
    expect(montarNumero("MS2608-MER-", 10000)).toBe("MS2608-MER-10000")
    expect(["MS2608-MER-10000", "MS2608-MER-9999"].sort()[0]).toBe("MS2608-MER-10000")
  })

  it("o maior numero e buscado como NUMERO no banco, nao como texto", () => {
    // Ordenar por texto travava a criacao de pedidos a partir do 10.001 ate
    // virar o mes: o maior lido seria sempre 9999.
    const src = ler("src", "lib", "pedidos", "numero.ts")
    expect(src).toMatch(/max\(substr\(order_number/)
    expect(src).not.toMatch(/orderBy: \{ orderNumber: "desc" \}/)
  })

  it("usa substr(x, N) e nao substring(x from N)", () => {
    // Com o offset como parametro, `substring(x from $1)` cai na variante de
    // REGEX do Postgres e devolve null em toda linha — o maior viraria 0 e
    // todo pedido tentaria o numero 1.
    const src = ler("src", "lib", "pedidos", "numero.ts")
    expect(src).not.toMatch(/substring\(order_number from/)
  })

  it("sufixo fora do padrao e descartado, nao vira 1", () => {
    // O fallback antigo chutava 1 — justamente um numero que costuma existir.
    const src = ler("src", "lib", "pedidos", "numero.ts")
    expect(src).toMatch(/\^\[0-9\]\+\$/)
  })

  it("nao ha mais numero aleatorio", () => {
    // Math.random de 4 digitos colide em ~120 pedidos/mes (aniversario), e a
    // colisao batia no unique e virava 500 na cara da vendedora.
    const src = ler("src", "app", "api", "orders", "route.ts")
    expect(src).not.toContain("Math.random")
    expect(src).toContain("proximoNumero")
  })

  it("a criacao do pedido e uma transacao so", () => {
    // Eram 4 escritas soltas: falhar no meio deixava totalOrders do contato
    // maior que o numero real de pedidos, sem nada que reconciliasse.
    const src = ler("src", "app", "api", "orders", "route.ts")
    expect(src).toContain("prisma.$transaction")
    expect(src).not.toMatch(/await prisma\.orderEvent\.create/)
    expect(src).not.toMatch(/await prisma\.contact\.update/)
  })

  it("colisao de numero e retentada, nao devolvida como erro", () => {
    const src = ler("src", "app", "api", "orders", "route.ts")
    expect(src).toContain("P2002")
  })
})

// ---------------------------------------------------------------------------
// 4. A ponte com o Masc
// ---------------------------------------------------------------------------

describe("ponte com o Masc", () => {
  const src = ler("src", "app", "api", "orders", "[id]", "masc", "route.ts")

  it("o pedido nasce pendente de lancamento", () => {
    expect(ler("src", "app", "api", "orders", "route.ts")).toContain('mascStatus: "pendente"')
    expect(ler("prisma", "schema.prisma")).toMatch(/mascStatus\s+String\s+@default\("pendente"\)/)
  })

  it("marcar como lancado exige o numero da venda no Masc", () => {
    // Sem o numero nao ha chave que cruze os dois sistemas — e na primeira
    // divergencia nao da para saber qual venda e qual.
    expect(src).toMatch(/status !== "lancado" \|\| !!d\.vendaId/)
  })

  it("dispensar exige justificativa escrita", () => {
    expect(src).toMatch(/status !== "dispensado" \|\| !!d\.observacao/)
  })

  it("relancar com outro numero de venda e barrado com 409", () => {
    // Duas vendas no Masc para o mesmo pedido = estoque baixado duas vezes.
    // E o unico jeito de isso acontecer, ja que nao escrevemos no Bling.
    expect(src).toMatch(/status: 409/)
    expect(src).toMatch(/mascVendaId !== data\.vendaId/)
  })

  it("o guard nao pode depender de mascStatus — dava para contornar em 2 passos", () => {
    // Antes: voltar para "pendente" zerava o numero, e o segundo lancamento
    // passava limpo com outro numero.
    const guard = src.slice(src.indexOf("data.status === \"lancado\""))
    expect(guard.slice(0, 200)).not.toContain("alvo.mascStatus")
  })

  it("voltar para a fila preserva o numero ja registrado", () => {
    // O numero e o rastro. Apagar reabria exatamente o furo acima.
    expect(src).toMatch(/mascVendaId: lancou \? data\.vendaId! : alvo\.mascVendaId/)
  })

  it("o lancamento passa pelo modal com bloqueio de 3s, nao por window.prompt", () => {
    // Dizer "lancado" solta a reserva e a peca volta a ser oferecida. Alem
    // disso, navegador que suprime dialogo transformava o prompt em no-op.
    const tela = ler("src", "app", "(dashboard)", "orders", "page.tsx")
    expect(tela).toContain("ModalConfirmacaoBlock")
    // A CHAMADA, nao a palavra: o comentario do codigo cita o prompt para
    // explicar por que ele saiu.
    expect(tela).not.toMatch(/window\.prompt\(/)
  })

  it("a fila 'falta lancar' e consultavel e indexada", () => {
    expect(ler("src", "app", "api", "orders", "route.ts")).toContain("mascStatus")
    expect(ler("prisma", "schema.prisma")).toContain("@@index([storeId, mascStatus])")
  })

  it("o lancamento entra na linha do tempo do pedido", () => {
    expect(src).toContain("orderEvent.create")
  })
})

// ---------------------------------------------------------------------------
// 5. Escopo de loja no pedido individual (furo encontrado no levantamento)
// ---------------------------------------------------------------------------

describe("pedido individual respeita a loja", () => {
  it("GET e PUT filtram por loja, nao so por id", () => {
    // O id do pedido circula em link e em tela. Sem escopo, um vendedor do
    // Centro lia e alterava pedido do Cerro Azul.
    const src = ler("src", "app", "api", "orders", "[id]", "route.ts")
    const usos = src.match(/escopoDaLoja/g) ?? []
    expect(usos.length).toBeGreaterThanOrEqual(2)
    expect(src).not.toMatch(/prisma\.order\.findUnique\(\{\s*where: \{ id \}/)
  })

  it("a rota do Masc tambem", () => {
    expect(src2()).toContain("escopoDaLoja")
  })
})

function src2() {
  return ler("src", "app", "api", "orders", "[id]", "masc", "route.ts")
}

// ---------------------------------------------------------------------------
// 6. A tela de venda no atendimento
// ---------------------------------------------------------------------------

describe("tela de venda no atendimento", () => {
  const painel = ler("src", "app", "(dashboard)", "inbox", "_components", "painel-venda.tsx")

  it("usa a rota que a vendedora alcanca, nao a de integracoes", () => {
    // /api/integracoes/** e so de admin no RBAC: usar aquela rota daria 403
    // justamente para quem precisa vender.
    expect(painel).toContain("/api/products/disponibilidade")
    expect(painel).not.toContain("/api/integracoes/")
  })

  it("mostra o disponivel, nao o saldo cru do Bling", () => {
    // O saldo cru superestima durante a janela de lancamento no Masc.
    expect(painel).toContain("disponivel")
  })

  it("fechar a venda passa pelo modal com bloqueio de 3s", () => {
    expect(painel).toContain("ModalConfirmacaoBlock")
  })

  it("nao chama ERP nenhum", () => {
    // "Masc" aparece no texto da tela, e deve mesmo. O que nao pode existir e
    // chamada para fora: quem grava no ERP nao e este sistema (ADR 0004).
    const chamadas = painel.match(/fetch\(\s*[`"'][^`"']+/g) ?? []
    expect(chamadas.length).toBeGreaterThan(0)
    for (const c of chamadas) {
      expect(c).toMatch(/fetch\(\s*[`"']\/api\//)
      expect(c).not.toMatch(/bling|tiktok|uazapi/i)
    }
  })

  it("a rota de disponibilidade nao escreve nada", () => {
    const rota = ler("src", "app", "api", "products", "disponibilidade", "route.ts")
    expect(rota).not.toMatch(/prisma\.\w+\.(create|update|delete|upsert)/)
  })

  it("a rota degrada quando o Bling nao responde, em vez de travar a venda", () => {
    const rota = ler("src", "app", "api", "products", "disponibilidade", "route.ts")
    expect(rota).toContain("estoqueAoVivo")
    expect(rota).toMatch(/catch/)
  })

  it("a tela avisa quando o estoque nao esta ao vivo", () => {
    expect(painel).toContain("estoqueAoVivo")
  })
})

describe("entrada da rota do catalogo", () => {
  it("pagina invalida nao vai crua para o Bling", () => {
    // `?pagina=abc` voltava 400 do Bling e marcava a integracao como "erro".
    const rota = ler("src", "app", "api", "integracoes", "bling", "catalogo", "route.ts")
    expect(rota).toMatch(/Number\.isInteger/)
    expect(rota).not.toMatch(/parseInt\(new URL/)
  })
})
