import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  // Trocas/devolucoes viram dinheiro de volta: sem escopo, um vendedor do
  // Centro aprovava o estorno de uma devolucao do Cerro Azul e assinava a
  // baixa como se fosse dele.
  const alvo = await prisma.return.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Devolucao")

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.trackingCode !== undefined) data.trackingCode = body.trackingCode
  if (body.refundAmount !== undefined) data.refundAmount = body.refundAmount
  if (body.refundMethod !== undefined) data.refundMethod = body.refundMethod
  // Quem resolveu e quem esta logado — o body nao decide isso.
  if (body.status === "completed" || body.status === "denied") {
    data.resolvedBy = usuario.id
    data.resolvedAt = new Date()
  }

  const ret = await prisma.return.update({ where: { id }, data })
  return NextResponse.json(ret)
}
