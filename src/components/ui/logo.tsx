"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  variant?: "dark" | "light"
}

const sizes = {
  sm: { width: 90, height: 36 },
  md: { width: 120, height: 48 },
  lg: { width: 160, height: 64 },
  xl: { width: 200, height: 80 },
}

export function Logo({ className, size = "md", variant = "dark" }: LogoProps) {
  const { width, height } = sizes[size]
  const src = variant === "dark" ? "/logo-dark.png" : "/logo-light.png"

  return (
    <Image
      src={src}
      alt="Merlos Store"
      width={width}
      height={height}
      className={cn("object-contain", className)}
      priority
    />
  )
}
