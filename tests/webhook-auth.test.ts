/**
 * Travas de autenticacao das rotas sem sessao (webhooks e crons).
 *
 * O caso que mais importa aqui e o "segredo vazio": se a variavel de ambiente
 * some no deploy, a rota tem que RECUSAR. Falhar aberto e o modo de falha que
 * ninguem percebe.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"
import {
  verificarAssinaturaMeta,
  verificarChallenge,
  verificarWebhookPagamento,
  verificarSegredoCron,
} from "@/lib/webhook-auth"

const ENV_ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ENV_ORIGINAL }
})

const assinar = (corpo: string, segredo: string) =>
  "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")

describe("assinatura Meta (X-Hub-Signature-256)", () => {
  const CORPO = '{"entry":[{"id":"123"}]}'

  beforeEach(() => {
    process.env.META_APP_SECRET = "segredo-do-app"
  })

  it("aceita assinatura correta", () => {
    const r = verificarAssinaturaMeta(CORPO, assinar(CORPO, "segredo-do-app"))
    expect(r.ok).toBe(true)
  })

  it("recusa assinatura de outro segredo", () => {
    const r = verificarAssinaturaMeta(CORPO, assinar(CORPO, "segredo-errado"))
    expect(r).toMatchObject({ ok: false, status: 401 })
  })

  it("recusa quando o corpo foi adulterado", () => {
    const assinatura = assinar(CORPO, "segredo-do-app")
    const r = verificarAssinaturaMeta('{"entry":[{"id":"999"}]}', assinatura)
    expect(r.ok).toBe(false)
  })

  it("recusa header ausente", () => {
    expect(verificarAssinaturaMeta(CORPO, null).ok).toBe(false)
  })

  it("recusa header sem o prefixo sha256=", () => {
    const cru = assinar(CORPO, "segredo-do-app").replace("sha256=", "")
    expect(verificarAssinaturaMeta(CORPO, cru).ok).toBe(false)
  })

  it("recusa (403) quando META_APP_SECRET nao esta configurado", () => {
    delete process.env.META_APP_SECRET
    const r = verificarAssinaturaMeta(CORPO, assinar(CORPO, "qualquer"))
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})

describe("challenge de verificacao do webhook", () => {
  const url = (token: string) =>
    `https://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc123`

  it("devolve o challenge com o token do proprio canal", () => {
    process.env.INSTAGRAM_VERIFY_TOKEN = "token-instagram"
    const r = verificarChallenge("instagram", url("token-instagram"))
    expect(r).toEqual({ ok: true, challenge: "abc123" })
  })

  it("NAO aceita o token do WhatsApp no Instagram (regressao)", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "token-whatsapp"
    process.env.INSTAGRAM_VERIFY_TOKEN = "token-instagram"
    expect(verificarChallenge("instagram", url("token-whatsapp")).ok).toBe(false)
  })

  it("recusa quando o token do canal nao esta configurado", () => {
    delete process.env.TIKTOK_VERIFY_TOKEN
    const r = verificarChallenge("tiktok", url("qualquer"))
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it("recusa hub.mode diferente de subscribe", () => {
    process.env.FACEBOOK_VERIFY_TOKEN = "t"
    const r = verificarChallenge(
      "facebook",
      "https://x/api/webhooks/facebook?hub.mode=unsubscribe&hub.verify_token=t&hub.challenge=abc"
    )
    expect(r.ok).toBe(false)
  })
})

describe("webhook de pagamento", () => {
  const headers = (h: Record<string, string>) => new Headers(h)

  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = "segredo-gateway"
  })

  it("aceita x-webhook-secret correto", () => {
    expect(verificarWebhookPagamento(headers({ "x-webhook-secret": "segredo-gateway" })).ok).toBe(true)
  })

  it("aceita o header do Asaas", () => {
    expect(verificarWebhookPagamento(headers({ "asaas-access-token": "segredo-gateway" })).ok).toBe(true)
  })

  it("recusa POST sem segredo — o caso que quitava pedido de graca", () => {
    expect(verificarWebhookPagamento(headers({})).ok).toBe(false)
  })

  it("recusa (403) quando PAYMENT_WEBHOOK_SECRET nao esta configurado", () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET
    const r = verificarWebhookPagamento(headers({ "x-webhook-secret": "x" }))
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})

describe("segredo de cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "segredo-cron"
  })

  it("aceita Bearer correto", () => {
    const h = new Headers({ authorization: "Bearer segredo-cron" })
    expect(verificarSegredoCron(h).ok).toBe(true)
  })

  it("recusa Bearer errado", () => {
    const h = new Headers({ authorization: "Bearer outro" })
    expect(verificarSegredoCron(h).ok).toBe(false)
  })

  it("recusa sem header", () => {
    expect(verificarSegredoCron(new Headers()).ok).toBe(false)
  })

  it("recusa (403) quando CRON_SECRET nao esta configurado", () => {
    delete process.env.CRON_SECRET
    const r = verificarSegredoCron(new Headers({ authorization: "Bearer x" }))
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})
