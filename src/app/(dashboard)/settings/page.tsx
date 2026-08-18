import Link from "next/link"
import {
  Store,
  Plug,
  Users,
  Settings as Cog,
  MessageSquare,
  Timer,
  Zap,
  ShieldCheck,
} from "lucide-react"

/**
 * Indice das configuracoes.
 *
 * Existe porque `/settings` respondia 404: so havia as subpaginas, e o link da
 * barra lateral levava a lugar nenhum.
 *
 * Server Component: e so navegacao, nao tem estado. O RBAC de verdade esta na
 * API — aqui as areas de admin ficam marcadas para o usuario saber o que vai
 * encontrar, nao para esconder dado (o dado nunca vem sem permissao).
 */

const AREAS = [
  {
    href: "/settings/lojas",
    icone: Store,
    titulo: "Lojas",
    descricao:
      "As unidades da rede e o de-para com o depósito do Bling. Comece por aqui: contatos, pedidos e conversas pertencem a uma loja.",
    soAdmin: true,
    destaque: true,
  },
  {
    href: "/settings/integracoes",
    icone: Plug,
    titulo: "Integrações",
    descricao: "Bling, TikTok Shop, Instagram e WhatsApp. As credenciais ficam cifradas.",
    soAdmin: true,
  },
  {
    href: "/settings/team",
    icone: Users,
    titulo: "Equipe",
    descricao: "Quem acessa o sistema, o papel de cada um e a loja a que pertence.",
    soAdmin: true,
  },
  {
    href: "/settings/general",
    icone: Cog,
    titulo: "Geral",
    descricao: "Nome, logo e horário de funcionamento.",
  },
  {
    href: "/settings/channels",
    icone: MessageSquare,
    titulo: "Canais",
    descricao: "Como cada canal de atendimento se comporta.",
  },
  {
    href: "/settings/sla",
    icone: Timer,
    titulo: "SLA",
    descricao: "Prazos de resposta e o que dispara alerta.",
  },
  {
    href: "/settings/automations",
    icone: Zap,
    titulo: "Automações",
    descricao: "Respostas e ações automáticas.",
  },
  {
    href: "/settings/lgpd",
    icone: ShieldCheck,
    titulo: "LGPD",
    descricao:
      "Exportar e apagar dados de um cliente. O apagamento é definitivo e não tem volta.",
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Ajustes da rede e das integrações.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((area) => (
          <li key={area.href}>
            <Link
              href={area.href}
              className={`flex h-full gap-3 rounded-lg border bg-white p-4 transition-colors hover:bg-neutral-50 ${
                area.destaque ? "border-neutral-900" : ""
              }`}
            >
              <area.icone className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{area.titulo}</span>
                  {area.soAdmin && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-600">
                      admin
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{area.descricao}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
