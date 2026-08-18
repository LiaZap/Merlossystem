# Frontend - Documentacao

## Stack

- **Framework**: Next.js (App Router)
- **Linguagem**: TypeScript strict
- **Estilizacao**: Tailwind CSS
- **Componentes**: Reutilizaveis em `src/components/`
- **Validacao de Forms**: Zod + React Hook Form
- **Estado**: Server Components por padrao, Client Components apenas quando necessario

## Estrutura de Pastas (real neste projeto)

```
src/
  app/
    (auth)/                  # Rotas publicas de acesso
      layout.tsx
      login/page.tsx
      register/page.tsx
    (dashboard)/             # Rotas protegidas pelo middleware
      layout.tsx             # Sidebar + header
      inbox/page.tsx         # Atendimento multicanal
      contacts/page.tsx      pipeline/page.tsx      orders/page.tsx
      products/page.tsx      returns/page.tsx       gallery/page.tsx
      gallery/lookbooks/page.tsx                    broadcasts/page.tsx
      broadcasts/new/page.tsx                       templates/page.tsx
      quick-replies/page.tsx knowledge-base/page.tsx
      analytics/page.tsx     alerts/page.tsx
      settings/{general,team,channels,automations,sla,lgpd}/page.tsx
    api/                     # 50 route handlers — ver docs/api.md
    layout.tsx               # Root layout

  components/
    ui/                      # Primitivos shadcn/ui
    chat/  inbox/  crm/  orders/  gallery/  layout/
    providers.tsx
```

O modal de confirmacao com block de 3s exigido pelo `CLAUDE.md` **ainda nao
existe** neste projeto — o template esta em `templates/component.tsx`.

## Padroes Obrigatorios

### 1. Server Components por Padrao
Usar `'use client'` APENAS quando o componente precisa de:
- useState, useEffect, useRef
- Event handlers (onClick, onChange)
- Browser APIs

### 2. Server Actions para Mutacoes

> [!NOTE]
> Hoje o projeto faz o oposto: todas as telas consomem os 50 route handlers de
> `src/app/api/**` via `fetch` — nao ha nenhuma Server Action. Os webhooks
> precisam mesmo ser HTTP; o CRUD nao. A regra abaixo vale para tela nova.

NAO criar API routes para CRUD. Usar Server Actions:
```typescript
// src/lib/actions/lancamentos.ts
'use server';

export async function criarLancamento(formData: FormData) {
  // validacao, RBAC, logica, auditoria
}
```

### 3. Modal de Confirmacao com Block
Toda acao destrutiva ou critica deve usar o `ModalConfirmacaoBlock`:
- Excluir registros
- Salvar lancamentos financeiros
- Alterar contratos
- Qualquer acao que impacte calculos

### 4. Feedback Visual
- Loading states em todas as acoes assincronas
- Mensagens de erro claras e em portugues
- Toast/notificacao apos sucesso ou erro
- Desabilitar botao de submit durante processamento

### 5. Responsividade
- Mobile-first
- Tabelas com scroll horizontal em mobile
- Menu colapsavel em telas menores

## Regras de Componentes

- Componentes reutilizaveis ficam em `src/components/`
- Componentes especificos de uma pagina ficam junto da pagina
- Nao duplicar componentes — reusar e parametrizar
- Props tipadas com TypeScript (nunca `any`)
- Nomes de componentes em PascalCase
- Nomes de arquivos em kebab-case

## Next.js Server-Side

Aproveitar o server-side nativo do Next.js:
- Autenticacao via middleware + cookies (sem JWT exposto no front)
- Data fetching direto no Server Component (sem useEffect + fetch)
- Server Actions para mutacoes (sem API routes separadas)
- Middleware para protecao de rotas

```typescript
// src/middleware.ts
export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');
  if (!session && request.nextUrl.pathname.startsWith('/(auth)')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```
