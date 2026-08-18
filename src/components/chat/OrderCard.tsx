"use client"

import { Badge } from "@/components/ui/badge"
import { Package, Truck, CheckCircle, Clock } from "lucide-react"

interface OrderCardProps {
  orderNumber: string
  status: string
  total: number
  items: { name: string; size: string; quantity: number }[]
  trackingCode?: string | null
  paymentStatus: string
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  confirmed: { label: "Confirmado", icon: <Clock className="h-4 w-4" />, color: "text-blue-600" },
  preparing: { label: "Preparando", icon: <Package className="h-4 w-4" />, color: "text-yellow-600" },
  shipped: { label: "Enviado", icon: <Truck className="h-4 w-4" />, color: "text-purple-600" },
  delivered: { label: "Entregue", icon: <CheckCircle className="h-4 w-4" />, color: "text-green-600" },
}

export function OrderCard({
  orderNumber,
  status,
  total,
  items,
  trackingCode,
  paymentStatus,
}: OrderCardProps) {
  const config = statusConfig[status] || statusConfig.confirmed

  return (
    <div className="bg-white border rounded-lg p-3 max-w-[280px] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-medium">{orderNumber}</span>
        <Badge variant="outline" className={`text-[10px] ${config.color}`}>
          {config.icon}
          <span className="ml-1">{config.label}</span>
        </Badge>
      </div>

      <div className="space-y-0.5">
        {items.slice(0, 3).map((item, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {item.name} ({item.size}) x{item.quantity}
          </p>
        ))}
        {items.length > 3 && (
          <p className="text-xs text-muted-foreground">+{items.length - 3} mais</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t">
        <span className="text-sm font-bold">R$ {total.toFixed(2)}</span>
        <Badge variant={paymentStatus === "paid" ? "default" : "secondary"} className="text-[10px]">
          {paymentStatus === "paid" ? "Pago" : "Aguardando"}
        </Badge>
      </div>

      {trackingCode && (
        <div className="bg-neutral-50 rounded p-2">
          <p className="text-[10px] text-muted-foreground">Rastreio:</p>
          <p className="text-xs font-mono font-medium">{trackingCode}</p>
        </div>
      )}
    </div>
  )
}
