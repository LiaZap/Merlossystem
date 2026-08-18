# Mapa do Projeto

> Gerado por `scripts/project-map.mjs`. Leia este resumo antes de explorar arquivos.

## Resumo

| Metrica | Total |
|---------|-------|
| Arquivos TS/TSX | 165 |
| Tabelas (Drizzle) | 0 |
| Server Actions (arquivos) | 0 |
| Rotas de API | 58 |
| Paginas | 25 |
| Componentes | 40 |

## Arvore (profundidade 3)

```
app/
  (auth)/
    login/
    register/
    layout.tsx
  (dashboard)/
    alerts/
    analytics/
    broadcasts/
    contacts/
    gallery/
    inbox/
    knowledge-base/
    orders/
    pipeline/
    products/
    quick-replies/
    returns/
    settings/
    templates/
    layout.tsx
  api/
    activity-logs/
    ai/
    alerts/
    analytics/
    auth/
    broadcasts/
    contacts/
    conversations/
    deals/
    integracoes/
    knowledge/
    lgpd/
    lojas/
    lookbooks/
    media/
    messages/
    orders/
    payments/
    products/
    quick-replies/
    register/
    returns/
    scheduled/
    surveys/
    templates/
    transcription/
    webhooks/
  fonts/
    GeistMonoVF.woff
    GeistVF.woff
  favicon.ico
  globals.css
  layout.tsx
  page.tsx
components/
  chat/
    AiSuggestion.tsx
    AudioPlayer.tsx
    GalleryModal.tsx
    MediaBar.tsx
    MediaPreview.tsx
    OrderCard.tsx
    PaymentCard.tsx
  crm/
  gallery/
  inbox/
    ChannelBadge.tsx
    ChatWindow.tsx
    ContactPanel.tsx
    ConversationList.tsx
  layout/
    Header.tsx
    SeletorLoja.test.tsx
    SeletorLoja.tsx
    Sidebar.tsx
  orders/
  ui/
    avatar.tsx
    badge.tsx
    breadcrumb.tsx
    button.tsx
    card.tsx
    command.tsx
    dialog.tsx
    dropdown-menu.tsx
    input-group.tsx
    input.tsx
    label.tsx
    logo.tsx
    popover.tsx
    scroll-area.tsx
    select.tsx
    separator.tsx
    sheet.tsx
    skeleton.tsx
    sonner.tsx
    switch.tsx
    table.tsx
    tabs.tsx
    textarea.tsx
    tooltip.tsx
  providers.tsx
lib/
  ai/
    classify.ts
    client.ts
    prompts.ts
    suggest.ts
    summarize.ts
  alerts/
    engine.ts
    rules.ts
  bling/
    cliente.ts
    config.ts
    estado.ts
  channels/
    facebook.ts
    gateway.ts
    index.ts
    instagram.ts
    tiktok.ts
    types.ts
    whatsapp.ts
  db/
    prisma.ts
  media/
    process.ts
    upload.ts
  payments/
    index.ts
    mock-provider.ts
    types.ts
  tiktok/
    assinatura.ts
    cliente.ts
    config.ts
  transcription/
    whisper.ts
  api-publica.ts
  auth.ts
  cofre.ts
  integracoes.ts
  loja.ts
  rbac.ts
  roteamento.ts
  sessao.ts
  utils.ts
  webhook-auth.ts
types/
  next-auth.d.ts
middleware.ts
```

## Rotas de API

| Rota | Metodos |
|------|---------|
| `/api/activity-logs` | GET, POST |
| `/api/ai/classify` | POST |
| `/api/ai/suggest` | POST |
| `/api/ai/summarize` | POST |
| `/api/alerts` | GET |
| `/api/alerts/[id]` | PUT |
| `/api/alerts/check` | POST |
| `/api/analytics` | GET |
| `/api/auth/[...nextauth]` | — |
| `/api/broadcasts` | GET, POST |
| `/api/broadcasts/[id]` | GET, PUT, DELETE |
| `/api/contacts` | GET, POST |
| `/api/contacts/[id]` | GET, PUT, DELETE |
| `/api/contacts/[id]/tags` | PUT |
| `/api/conversations` | GET |
| `/api/conversations/[id]` | GET, PUT |
| `/api/deals` | GET, POST |
| `/api/deals/[id]` | GET, PUT, DELETE |
| `/api/integracoes` | GET, POST |
| `/api/integracoes/[id]` | GET, PUT, DELETE |
| `/api/integracoes/bling/autorizar` | GET |
| `/api/integracoes/bling/callback` | GET |
| `/api/integracoes/bling/catalogo` | GET |
| `/api/integracoes/tiktok/autorizar` | GET |
| `/api/integracoes/tiktok/callback` | GET |
| `/api/knowledge` | GET, POST |
| `/api/knowledge/[id]` | GET, PUT, DELETE |
| `/api/lgpd` | GET, POST, DELETE |
| `/api/lojas` | GET |
| `/api/lookbooks` | GET, POST |
| `/api/lookbooks/[id]` | GET, PUT, DELETE |
| `/api/media/[id]` | GET, PUT, DELETE |
| `/api/media/gallery` | GET |
| `/api/media/send` | POST |
| `/api/media/upload` | POST |
| `/api/messages` | GET, POST |
| `/api/orders` | GET, POST |
| `/api/orders/[id]` | GET, PUT |
| `/api/payments/link` | POST |
| `/api/payments/pix` | POST |
| `/api/products` | GET, POST |
| `/api/products/[id]` | GET, PUT, DELETE |
| `/api/quick-replies` | GET, POST |
| `/api/quick-replies/[id]` | PUT, DELETE |
| `/api/register` | POST |
| `/api/returns` | GET, POST |
| `/api/returns/[id]` | PUT |
| `/api/scheduled` | GET, POST |
| `/api/scheduled/[id]` | PUT, DELETE |
| `/api/surveys` | GET, POST |
| `/api/templates` | GET, POST |
| `/api/templates/[id]` | GET, PUT, DELETE |
| `/api/transcription` | POST |
| `/api/webhooks/facebook` | GET, POST |
| `/api/webhooks/instagram` | GET, POST |
| `/api/webhooks/payments` | POST |
| `/api/webhooks/tiktok` | GET, POST |
| `/api/webhooks/whatsapp` | GET, POST |

## Paginas

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(dashboard)/alerts/page.tsx`
- `src/app/(dashboard)/analytics/page.tsx`
- `src/app/(dashboard)/broadcasts/new/page.tsx`
- `src/app/(dashboard)/broadcasts/page.tsx`
- `src/app/(dashboard)/contacts/page.tsx`
- `src/app/(dashboard)/gallery/lookbooks/page.tsx`
- `src/app/(dashboard)/gallery/page.tsx`
- `src/app/(dashboard)/inbox/page.tsx`
- `src/app/(dashboard)/knowledge-base/page.tsx`
- `src/app/(dashboard)/orders/page.tsx`
- `src/app/(dashboard)/pipeline/page.tsx`
- `src/app/(dashboard)/products/page.tsx`
- `src/app/(dashboard)/quick-replies/page.tsx`
- `src/app/(dashboard)/returns/page.tsx`
- `src/app/(dashboard)/settings/automations/page.tsx`
- `src/app/(dashboard)/settings/channels/page.tsx`
- `src/app/(dashboard)/settings/general/page.tsx`
- `src/app/(dashboard)/settings/integracoes/page.tsx`
- `src/app/(dashboard)/settings/lgpd/page.tsx`
- `src/app/(dashboard)/settings/sla/page.tsx`
- `src/app/(dashboard)/settings/team/page.tsx`
- `src/app/(dashboard)/templates/page.tsx`
- `src/app/page.tsx`
