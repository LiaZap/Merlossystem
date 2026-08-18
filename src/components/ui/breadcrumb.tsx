"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Navegação" className={cn("flex items-center gap-1.5 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
            {isLast || !item.href ? (
              <span className={cn(isLast ? "font-medium text-neutral-900" : "text-neutral-500")}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
