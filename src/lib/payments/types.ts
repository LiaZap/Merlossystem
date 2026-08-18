/**
 * Payment Provider Interface — Generic for Mercado Pago, Asaas, PagBank, etc.
 */

export interface PixPaymentResult {
  externalId: string
  qrcodeBase64: string
  copyPaste: string
  expiresAt: Date
}

export interface LinkPaymentResult {
  externalId: string
  paymentUrl: string
  expiresAt: Date
}

export interface PaymentStatusResult {
  externalId: string
  status: "pending" | "approved" | "rejected" | "refunded" | "expired"
  paidAt?: Date
}

export interface PaymentProvider {
  name: string

  generatePix(opts: {
    amount: number
    description: string
    expirationMinutes?: number
  }): Promise<PixPaymentResult>

  generatePaymentLink(opts: {
    amount: number
    description: string
    items?: { name: string; quantity: number; unitPrice: number }[]
  }): Promise<LinkPaymentResult>

  getPaymentStatus(externalId: string): Promise<PaymentStatusResult>

  refund(externalId: string, amount?: number): Promise<{ success: boolean }>
}
