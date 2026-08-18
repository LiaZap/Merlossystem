import type { PaymentProvider } from "./types"
import { mockPaymentProvider } from "./mock-provider"

export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER || "mock"

  switch (provider) {
    // Future: case "mercadopago": return mercadoPagoProvider
    // Future: case "asaas": return asaasProvider
    default:
      return mockPaymentProvider
  }
}

export type { PaymentProvider, PixPaymentResult, LinkPaymentResult } from "./types"
