"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Copy, Check } from "lucide-react"

interface PaymentCardProps {
  orderNumber: string
  total: number
  method: string
  status: string
  pixCopyPaste?: string | null
  pixQrcodeBase64?: string | null
  paymentLink?: string | null
  expiresAt?: string | null
}

export function PaymentCard({
  orderNumber,
  total,
  method,
  status,
  pixCopyPaste,
  pixQrcodeBase64,
  paymentLink,
  expiresAt,
}: PaymentCardProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (pixCopyPaste) {
      navigator.clipboard.writeText(pixCopyPaste)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isPaid = status === "approved" || status === "paid"

  return (
    <div className="bg-white border rounded-lg p-3 max-w-[280px] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Pagamento #{orderNumber}
        </span>
        <Badge variant={isPaid ? "default" : "outline"} className="text-[10px]">
          {isPaid ? "Pago" : "Pendente"}
        </Badge>
      </div>

      <p className="text-xl font-bold text-center">
        R$ {total.toFixed(2)}
      </p>

      {method === "pix" && pixQrcodeBase64 && !isPaid && (
        <div className="flex justify-center">
          <img
            src={pixQrcodeBase64}
            alt="QR Code Pix"
            className="w-40 h-40 rounded"
          />
        </div>
      )}

      {method === "pix" && pixCopyPaste && !isPaid && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Copia e cola:</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[10px] bg-neutral-100 p-1.5 rounded truncate">
              {pixCopyPaste}
            </code>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      )}

      {paymentLink && !isPaid && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-sm text-primary hover:underline"
        >
          Abrir link de pagamento
        </a>
      )}

      {expiresAt && !isPaid && (
        <p className="text-[10px] text-center text-muted-foreground">
          Válido até {new Date(expiresAt).toLocaleString("pt-BR")}
        </p>
      )}

      {isPaid && (
        <p className="text-center text-green-600 font-medium text-sm">
          Pagamento confirmado!
        </p>
      )}
    </div>
  )
}
