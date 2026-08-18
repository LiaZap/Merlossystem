/**
 * Alert rules configuration.
 * Each rule defines: type, condition check, severity, message template.
 */

// SLA limits per channel (in minutes)
export const SLA_LIMITS: Record<string, number> = {
  whatsapp: 5,
  instagram: 15,
  facebook: 30,
  tiktok: 60,
}

export interface AlertRule {
  type: string
  severity: "low" | "medium" | "high" | "critical"
  description: string
}

export const ALERT_RULES: AlertRule[] = [
  {
    type: "sla_breach",
    severity: "high",
    description: "Cliente sem resposta além do SLA do canal",
  },
  {
    type: "review_risk",
    severity: "critical",
    description: "Sem resposta há 2h+ no Instagram ou Facebook",
  },
  {
    type: "hot_lead",
    severity: "medium",
    description: "Cliente mencionou preço, disponibilidade ou intenção de compra",
  },
  {
    type: "deal_stale",
    severity: "high",
    description: "Deal nos estágios negociando/fechando sem atividade há 3+ dias",
  },
  {
    type: "low_stock",
    severity: "low",
    description: "Produto mencionado com estoque < 3 unidades",
  },
  {
    type: "first_contact",
    severity: "medium",
    description: "Nova cliente, primeiro contato",
  },
  {
    type: "returning_customer",
    severity: "medium",
    description: "Cliente voltou após 30+ dias sem contato",
  },
  {
    type: "payment_pending",
    severity: "medium",
    description: "Pix gerado há 20+ minutos sem confirmação",
  },
  {
    type: "follow_up_due",
    severity: "high",
    description: "Mensagem agendada não enviada no prazo",
  },
]

// Keywords that indicate purchase intent (for hot_lead detection)
export const PURCHASE_INTENT_KEYWORDS = [
  "quanto custa",
  "qual o valor",
  "qual o preço",
  "preço",
  "valor",
  "quero",
  "quero comprar",
  "vou querer",
  "tem no tamanho",
  "tem disponível",
  "disponibilidade",
  "reserva pra mim",
  "como faço pra comprar",
  "aceita pix",
  "pix",
  "parcela",
  "frete",
  "entrega",
]
