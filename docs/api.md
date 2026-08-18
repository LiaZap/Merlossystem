# API — Referencia das Rotas

Referencia das 50 rotas de `src/app/api/**/route.ts`. Documenta o que o codigo
**faz hoje**, nao o que deveria fazer. Onde o comportamento atual contraria as
regras do `CLAUDE.md`, ha um aviso explicito — nao copie esses padroes.

Gerado a partir da leitura dos arquivos-fonte em 17/08/2026. Ao alterar uma
rota, atualize a linha correspondente aqui (`npm run docs:check` cobra).

---

## Autenticacao

Toda rota `/api/**` exige sessao NextAuth. Quem barra e o `src/middleware.ts`,
cujo matcher cobre `/api/:path*` — **rota nova nasce protegida**, sem precisar
lembrar de nada no handler. Sem cookie de sessao a resposta e:

```
401  { "error": "Nao autenticado" }
```

As 9 rotas fora dessa regra sao as que ninguem chama com sessao. A lista fica em
`src/lib/api-publica.ts` e **cada uma tem a propria verificacao**:

| Rota | Como autentica | Sem o segredo configurado |
|------|----------------|---------------------------|
| `/api/auth/*` | o proprio fluxo do NextAuth | — |
| `/api/register` | banco vazio (bootstrap) ou sessao de admin | — |
| `/api/alerts/check` | `Authorization: Bearer $CRON_SECRET` | `403` |
| `/api/transcription` | `Authorization: Bearer $CRON_SECRET` | `403` |
| `/api/webhooks/whatsapp` | HMAC `X-Hub-Signature-256` (`META_APP_SECRET`) | `403` |
| `/api/webhooks/instagram` | idem | `403` |
| `/api/webhooks/facebook` | idem | `403` |
| `/api/webhooks/tiktok` | header `x-webhook-secret` (`TIKTOK_VERIFY_TOKEN`) | `403` |
| `/api/webhooks/uazapi` | header `x-uazapi-secret` ou `?segredo=` (`UAZAPI_WEBHOOK_SECRET`) | `403` |
| `/api/webhooks/payments` | `x-webhook-secret` / `asaas-access-token` (`PAYMENT_WEBHOOK_SECRET`) | `403` |

Sem o segredo no ambiente a rota **recusa** (403), nunca aceita. Um webhook que
passa a aceitar qualquer POST quando a variavel some no deploy e uma falha que
nao aparece no monitoramento.

Variaveis novas em `.env.example`: `CRON_SECRET`, `META_APP_SECRET`,
`INSTAGRAM_VERIFY_TOKEN`, `FACEBOOK_VERIFY_TOKEN`, `TIKTOK_VERIFY_TOKEN`,
`PAYMENT_WEBHOOK_SECRET`. Implementacao em `src/lib/webhook-auth.ts`,
coberta por `tests/webhook-auth.test.ts` e `tests/api-publica.test.ts`.

## Autorizacao (RBAC)

Passada a sessao, o mesmo middleware aplica o papel do usuario. Sem permissao:

```
403  { "error": "Sem permissao para esta operacao" }
```

Regra padrao, em `src/lib/rbac.ts`:

| Metodo | admin | agent | viewer |
|--------|:-----:|:-----:|:------:|
| `GET` | sim | sim | sim |
| `POST` / `PUT` / `PATCH` | sim | sim | nao |
| `DELETE` | sim | nao | nao |

Excecoes: `DELETE /api/scheduled/[id]` tambem para `agent` (e cancelamento
logico, nao exclusao); `GET /api/lgpd` e `GET /api/activity-logs` so `admin`;
`POST` nessas duas continua com `admin`+`agent`.

Matriz completa, racional e o que os testes travam: [rbac.md](rbac.md).

## Autoria

Quem executou a acao vem **sempre da sessao**, nunca do corpo da requisicao.
Os campos abaixo sairam dos schemas Zod e do `formData` — mandar um deles no
body nao muda nada, o servidor sobrescreve:

| Campo | Rotas |
|-------|-------|
| `senderId` | `/api/messages`, `/api/media/send` |
| `createdBy` | `/api/orders`, `/api/orders/[id]`, `/api/broadcasts`, `/api/scheduled`, `/api/knowledge` |
| `changedBy` | `/api/deals/[id]` |
| `acknowledgedBy` | `/api/alerts/[id]` |
| `uploadedBy` | `/api/media/upload` |
| `resolvedBy` | `/api/returns/[id]` |
| `userId` + `ipAddress` | `/api/activity-logs` (IP vem de `x-forwarded-for`) |

Helper em `src/lib/sessao.ts` (`usuarioDaSessao()`). `assignedTo` **nao** entra
nessa lista: e atribuicao (a quem o registro pertence), nao autoria, e continua
vindo do body de propósito.

Travado por `tests/autoria.test.ts`, que varre o fonte das 50 rotas e reprova
qualquer leitura de autoria vinda do cliente.

> [!NOTE]
> O `GET` de verificacao dos webhooks Meta agora usa um token por canal.
> Instagram e Facebook compartilhavam `WHATSAPP_VERIFY_TOKEN` — quem tivesse o
> token do WhatsApp registrava webhook nos outros dois. Configure
> `INSTAGRAM_VERIFY_TOKEN` e `FACEBOOK_VERIFY_TOKEN` antes de religar os canais.

## Pendencias de seguranca (ainda abertas)

| # | Achado | Onde |
|---|--------|------|
| 1 | Paginas nao tem RBAC: qualquer usuario logado abre `/settings`. O dado so sai pela API (travada), mas o menu mostra o que ele nao consegue usar | `(dashboard)/**` |
| 2 | `limit` de paginacao sem teto: `?limit=999999` e aceito | contacts, conversations, orders, products, alerts, media, activity-logs |
| 3 | `POST /api/media/upload` sem limite de tamanho nem allowlist de MIME | media/upload |
| 4 | `DELETE /api/lgpd` roda ~20 exclusoes fora de transacao | lgpd |
| 5 | Nenhuma mutacao grava sozinha em `ActivityLog` — a trilha so existe se o front chamar `POST /api/activity-logs` | todas |

## Convencoes observadas

| Aspecto | Como esta hoje |
|---------|----------------|
| Formato | Route Handlers (`src/app/api/**/route.ts`), nao Server Actions |
| Autenticacao | sessao NextAuth exigida pelo middleware; 9 excecoes com gate proprio (acima) |
| Autorizacao | RBAC por caminho + metodo no middleware (`src/lib/rbac.ts`) |
| Nao autenticado | `401` com `{ error: "Nao autenticado" }` |
| Sem permissao | `403` com `{ error: "Sem permissao para esta operacao" }` |
| Validacao | Zod em 24 dos 50 arquivos de rota; os outros 26 montam o objeto direto do `body` |
| Erro de validacao | `400` com `{ error: ZodIssue[] }` (em `/api/register`, `{ error: string }`) |
| Nao encontrado | `404` com `{ error: "<Entidade> nao encontrada" }` |
| Erro interno | `500` com `{ error: "<mensagem PT-BR>" }` |
| Criacao | `201` com o registro criado |
| Paginacao | `?page` + `?limit`; resposta `{ <itens>, total, page, limit }` |
| Exclusao | **delete fisico** em 10 rotas; so `DELETE /api/scheduled/[id]` faz soft delete |
| Locking | nenhum. Nenhuma rota usa optimistic locking (`CLAUDE.md` exige) |
| Auditoria | `ActivityLog` so grava se alguem chamar `POST /api/activity-logs` na mao; nenhuma mutacao registra sozinha |

`[id]` sempre vem como `Promise<{ id: string }>` (Next 15+): `const { id } = await params`.

---

## Autenticacao

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/auth/[...nextauth]` | GET, POST | Handler do NextAuth. Provider Credentials, sessao JWT, login em `/login`. Config em `src/lib/auth.ts`; grava `lastLoginAt` e recusa usuario com `isActive: false` |
| `/api/register` | POST | Cria usuario. Zod: `name` (min 2), `email`, `password` (min 6), `role` opcional. Hash bcrypt custo 12. `409` se o email existe. **Com o banco vazio** funciona sem sessao e cria o primeiro `admin` (bootstrap); **depois disso** exige sessao de admin (`401` sem sessao, `403` sem ser admin) e o padrao passa a ser `agent` |

## Integracoes (cofre de credenciais)

Configuracao: **so `admin`**, em qualquer metodo. Nem `gerente` entra.

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/integracoes` | GET | Contas conectadas. Com `?loja=` (ou cookie do seletor) traz as da loja **mais as da rede** — o Bling e conta unica para as duas. O segredo nunca sai: `credenciais` vem como mapa de chave → valor mascarado (`••••9xKp`) |
| | POST | Conecta uma conta. Zod: `provedor` (`bling`/`tiktok_shop`/`instagram`/`uazapi`), `rotulo`, `referenciaExterna`, `credenciais` (pares chave/valor), `expiraEm`. `bling` nasce sem loja (conta da rede); os outros exigem loja. `409` se a mesma conta ja estiver conectada — inclusive em outra loja |
| `/api/integracoes/[id]` | GET | Uma conta, no mesmo formato mascarado |
| | PUT | Renomeia, troca status ou substitui a credencial (reconectar). Trocar credencial limpa `ultimoErro` |
| | DELETE | Desconecta: **apaga a credencial de verdade** (`credenciaisCifradas = null`) e marca `isDeleted`. O registro fica na trilha — quem conectou, quando, quando saiu; o token, nao |

### Bling — OAuth e leitura

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/integracoes/bling/autorizar` | GET | Devolve `{ url }` para o admin ser levado ao consentimento do Bling. Devolve JSON em vez de redirecionar porque quem chama e um `fetch` da tela |
| `/api/integracoes/bling/callback` | GET | Volta do Bling. **Fora da protecao de sessao** (`src/lib/api-publica.ts`): quem autoriza aqui e o `state` assinado, nao o cookie. Troca o code por tokens, cifra e grava. Reconectar atualiza a linha existente |
| `/api/integracoes/bling/catalogo` | GET | Catalogo + saldo **do deposito da loja ativa**. `409` se o Bling nao estiver conectado ou a loja nao tiver `bling_deposito_id`; `400` se a gestao nao escolheu loja no seletor |

**Somente leitura.** Nao ha rota de escrita para o Bling, e o cliente
(`src/lib/bling/cliente.ts`) nao tem metodo de escrita — os unicos `POST` sao os
dois do OAuth. Isso e definitivo, nao provisorio: o Masc e o
dono da venda e o Bling e a autoridade de estoque, alimentado pelo vinculo
Masc -> Bling (decisao 8, [adr/0004-fontes-da-verdade.md](adr/0004-fontes-da-verdade.md)).
A peca na prateleira e uma so — escrever daqui a faria sair duas vezes do saldo.

A resposta traz **tres numeros por produto**, e a diferenca entre eles importa:

| Campo | O que e |
|-------|---------|
| `saldo` | o que o Bling responde agora para aquele deposito |
| `reservado` | o que ja prometemos em pedido nosso **ainda nao lancado no Masc** |
| `disponivel` | `saldo - reservado` — o que da para prometer com seguranca |

O vinculo Masc -> Bling e **em tempo real**, entao `saldo` ja inclui a venda da
loja fisica no instante em que ela acontece. A unica coisa que o Bling **nao**
sabe e o pedido do canal que ainda espera lancamento — por isso `reservado`
existe. Sem ele, duas atendentes prometem a mesma peca.

`disponivel` e `null` quando o Bling nao informou saldo: nao saber nao pode
virar zero, senao a vendedora recusa peca que existe. O desconto casa por SKU
(`products.sku` aqui, `codigo` la); produto sem SKU nao desconta nada, porque
descontar do produto errado e pior do que nao descontar.

O saldo sai **por deposito**: a conta do Bling e unica da rede e o deposito e o
que separa Centro de Cerro Azul (decisao 6). O deposito e **path param**
(`GET /estoques/saldos/{idDeposito}`) e `idsProdutos[]` e obrigatorio: a rota
busca a pagina de produtos primeiro e pergunta o saldo daqueles ids. O que se
mostra e `depositos[].saldoFisico` — nunca `saldoFisicoTotal`, que e a soma da
rede inteira.

### Midia

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/media/[id]/raw` | GET | Serve o binario. Exige sessao **e** escopo de loja. `?thumb=1` devolve a miniatura |

O bucket do MinIO e **privado** (ADR 0006): nao ha URL publica de midia.
`media_files.file_url` guarda esta rota, nao a URL do bucket — o arquivo herda
a mesma protecao da API, e o link de uma foto nao alcanca a outra loja.

Quem baixa de FORA (a Meta e o uazapi, ao enviar midia para a cliente) nao passa
por aqui: recebe **URL assinada com validade de 10 minutos**, gerada no momento
do envio e nunca persistida.

### Disponibilidade para a tela de venda

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/products/disponibilidade` | GET | Catalogo da loja com `saldo`, `reservado` e `disponivel` por produto. Aceita `?busca=` (nome ou SKU) |

Existe separada de `/api/integracoes/bling/catalogo` por dois motivos:

1. **quem usa e a vendedora** — a rota de integracoes e so de admin no RBAC, e
   vendedor tomaria `403` justamente na tela em que precisa vender;
2. **o pedido referencia o produto DAQUI** — `orders.items[].productId` e o id
   do nosso `products`, que e o que `reservadoPorSku` usa para saber o que ja
   foi prometido. Montar a venda a partir do id do Bling quebraria a conta.

Responde `estoqueAoVivo: false` quando nao deu para consultar o Bling (nao
conectado, loja sem deposito, API fora). A tela mostra o catalogo mesmo assim,
avisando — recusar a venda inteira por causa disso seria pior.

Para casar SKU com o Bling sao **duas** chamadas, nesta ordem: `GET /produtos`
filtrando por `codigos[]` (para descobrir o id de cada SKU) e so entao
`GET /estoques/saldos/{idDeposito}` com `idsProdutos[]`, que e obrigatorio e nao
aceita codigo.

### Lancamento no Masc

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/orders/[id]/masc` | PUT | Registra que a venda foi lancada no Masc. Corpo: `{ status: "lancado" \| "dispensado" \| "pendente", vendaId?, observacao? }` |

`lancado` **exige** `vendaId` (o numero da venda no Masc) — e a unica chave que
cruza os dois sistemas. `dispensado` exige `observacao`. Relancar com um numero
diferente de um pedido ja lancado responde `409`: duas vendas no Masc para o
mesmo pedido significam estoque baixado duas vezes.

**Nao ha chamada a API do Masc.** Nao ha evidencia de que exista uma publica; o
lancamento e feito por uma pessoa e esta rota so registra que aconteceu. A fila
do que falta lancar e `GET /api/orders?masc=pendente`. Por isso a gestao precisa escolher
a loja no seletor — sem escolha, o numero seria a soma das duas.

> [!IMPORTANT]
> As URLs dos endpoints do Bling estao concentradas em `src/lib/bling/config.ts`
> e marcadas com `CONFERIR`. A mecanica do OAuth foi confirmada na documentacao
> oficial (Basic auth, code de 1 minuto, refresh de 30 dias); os **caminhos**
> nao — a doc e renderizada por JavaScript e a collection OpenAPI responde 404.
> Confira contra a collection oficial antes de ligar em producao. Um teste
> garante que nenhuma URL do Bling vaze para fora desse arquivo.

### TikTok Shop — OAuth e leitura

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/integracoes/tiktok/autorizar` | GET | Devolve `{ url }` para o consentimento no TikTok. Reusa o `state` assinado do Bling |
| `/api/integracoes/tiktok/callback` | GET | Fora da protecao de sessao, como o do Bling. A conta nasce **sem loja**: o TikTok Shop e por loja e chutar uma seria pior. Escolher a loja e passo seguinte, na tela |

**Somente leitura**, mesma regra do Bling: o cliente
(`src/lib/tiktok/cliente.ts`) nao tem `POST`/`PUT`/`DELETE` de dado.

### WhatsApp uazapi — sessao da instancia

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/integracoes/uazapi/[id]/sessao` | GET | Estado da instancia (`conectado`/`conectando`/`desconectado`) e alinha o `status` no banco — senao a tela mostra "conectado" para um numero que caiu ontem |
| | POST | Inicia o pareamento e devolve o QR code. O QR expira em segundos; a tela gera outro sob demanda |

So admin (excecao `/api/integracoes` do RBAC). Nao ha equivalente na API oficial
da Meta: la o numero e permanente, aqui a sessao do WhatsApp Web cai e alguem
precisa ler o QR no celular da loja.

O canal `whatsapp` tem **dois provedores** — `whatsapp_oficial` (Meta) e
`uazapi` — e os dois implementam a mesma interface `ChannelAdapter`. Excecao:
`sendTemplate` no uazapi **falha de proposito**, porque nao existe template
aprovado ali; `WhatsappTemplate` vale so para numeros `whatsapp_oficial`.

#### Assinatura

Cada chamada leva `sign` calculado assim (`src/lib/tiktok/assinatura.ts`):

1. parametros da query, **menos** `sign` e `access_token`;
2. ordenados por chave, concatenados como `{chave}{valor}`, sem separador;
3. envolvidos pelo app_secret: `secret + [caminho] + concatenado + secret`;
4. HMAC-SHA256 com o app_secret como chave, hex **maiusculo**.

`access_token` fica de fora porque muda a cada renovacao — assinar sobre ele
quebraria toda chamada logo apos um refresh. O token viaja no header
`x-tts-access-token`, nao na query.

O **webhook** usa outra conta: HMAC-SHA256 de `app_key + corpo cru`, chave
app_secret, hex **minusculo**, no header `Authorization`. Substituiu o segredo
compartilhado provisorio que existia antes.

> [!IMPORTANT]
> Um ponto da assinatura nao foi possivel confirmar: **se o caminho da rota
> entra na string assinada**. A documentacao oficial e truncada no fetch e as
> implementacoes da comunidade divergem. Esta na constante
> `ASSINATURA_INCLUI_CAMINHO` (`src/lib/tiktok/config.ts`), hoje `true`.
>
> Errar isso faz **toda** chamada voltar com erro de assinatura — sintoma
> imediato e inconfundivel. Se acontecer, inverta a constante antes de procurar
> em qualquer outro lugar.

### Como o segredo e guardado

AES-256-GCM em `src/lib/cofre.ts`, chave em `INTEGRATIONS_KEY`. Formato gravado:
`v1:<iv>:<tag>:<cifrado>` — o prefixo de versao existe para permitir troca de
chave depois. GCM e nao CBC porque GCM **autentica**: registro editado direto no
banco falha a decifra em vez de devolver lixo.

> [!IMPORTANT]
> Sem `INTEGRATIONS_KEY` configurada, conectar responde **`503`** e nao grava
> nada. O sistema nunca cai para texto plano. Trocar a chave torna as
> credenciais existentes ilegiveis — a tela mostra `erro: ilegivel` naquela
> conta e e preciso reconectar.

## Lojas

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/lojas` | GET | Lojas que o usuario alcanca. Gestao (`admin`, `gerente`) recebe as duas e `podeTrocar: true` — e o que alimenta o seletor no cabecalho. `vendedor` e `viewer` recebem so a propria, com `podeTrocar: false`, para a interface mostrar em qual loja ele esta sem sugerir escolha. Cadastrar/editar loja e configuracao e fica so com `admin` |

### Loja ativa

Gestao escolhe a loja no seletor do cabecalho; a escolha vai no cookie
`loja_ativa`. Toda rota le esse cookie (ou `?loja=` na URL, que tem prioridade)
por `lojaAtiva()` e passa para `escopoDaLoja()`.

**O cookie so vale para gestao.** Vendedor e viewer sempre operam na loja do
proprio cadastro — cookie e parametro vindos do cliente sao ignorados, do mesmo
jeito que a autoria. Cookie e query valem o mesmo: quem decide se contam e o
servidor.

## Contatos

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/contacts` | GET | Filtros `search` (nome/telefone/email), `tag`, `preferredSize`, `page`, `limit` (30 padrao 20). Ordena por `lastContactAt` desc, nulos por ultimo |
| | POST | Zod: nome, telefone, email, IDs dos canais, `preferredSize`, `tags[]`, `notes`, `birthday` |
| `/api/contacts/[id]` | GET | `404` se nao existir |
| | PUT | Mesmos campos do POST, todos opcionais |
| | DELETE | **Delete fisico** do contato |
| `/api/contacts/[id]/tags` | PUT | Sem Zod. `{ tags: [] }` substitui tudo, `{ add: "x" }` acrescenta se nao houver, `{ remove: "x" }` retira |

## Conversas e mensagens

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/conversations` | GET | Filtros `channel`, `status` (padrao `open` + `pending`), `assignedTo`, `priority`, `search` (dados do contato), `page`, `limit` (30). Inclui contato e agente |
| `/api/conversations/[id]` | GET | Conversa + contato completo + agente |
| | PUT | Sem Zod. Aceita `status`, `assignedTo`, `priority` e `markRead` (zera `unreadCount`) |
| `/api/messages` | GET | Exige `?conversationId` (senao `400`). Paginacao por cursor `?before` (ISO), `limit` 50. Busca desc e devolve em ordem cronologica |
| | POST | Zod: `conversationId`, `content`, `contentType`, `mediaFileId`, `mediaCaption`, `isInternalNote` (o remetente vem da sessao). Nota interna e gravada e **nao** vai para o canal. Resolve o destinatario pelo canal (`whatsappId`/`phone`, `instagramId`, `facebookId`, `tiktokId`) e envia pelo adapter de `src/lib/channels`; persiste com `saveOutgoingMessage` |

## CRM — funil de vendas

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/deals` | GET | Filtros `stage`, `assignedTo`. Devolve `{ deals, pipeline }` — o pipeline agrupa os 6 estagios (`lead`, `interested`, `negotiating`, `closing`, `won`, `lost`) com `count` e `totalValue` |
| | POST | Zod: `contactId`, `conversationId`, `assignedTo`, `stage` (padrao `lead`), `value`, `products[]`, `notes`, `expectedCloseDate`. Cria `DealEvent` "Deal criado" |
| `/api/deals/[id]` | GET | Deal + contato + conversa + responsavel + ultimos 20 eventos |
| | PUT | Zod. Toda alteracao atualiza `lastActivityAt`. Mudanca de estagio grava `DealEvent` com `fromStage`/`toStage`; estagio `lost` exige `lossReason`/`lossNotes` |
| | DELETE | **Delete fisico**: apaga os `DealEvent` e depois o deal |

## Pedidos

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/orders` | GET | Filtros `status`, `contactId`, `search` (numero do pedido ou nome do contato), `page`, `limit` (20). Inclui contato e pagamentos |
| | POST | Zod com `items[]` (min 1: `productId`, `name`, `size`, `quantity`, `unitPrice`). Calcula `subtotal` e `total = subtotal + frete - desconto`. Gera `orderNumber` no formato `MS{AAMM}-{4 digitos}`. Cria `OrderEvent`, incrementa `totalOrders`/`totalSpent` do contato e, se veio de um deal, marca o deal como `won` |
| `/api/orders/[id]` | GET | Pedido + contato + pagamentos + eventos |
| | PUT | Sem Zod. `status`, `paymentStatus`, `trackingCode` (+`trackingUrl`), `shippingMethod`, `notes`. Mudanca de `status` cria `OrderEvent` |

> [!WARNING]
> `generateOrderNumber()` usa `Math.random()` com 4 digitos e nao consulta o
> banco. Em volume, colisao de `orderNumber` e questao de tempo — a unicidade
> depende da constraint no schema, e o erro chega ao usuario como `500`.

## Produtos

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/products` | GET | Filtros `search` (nome/SKU), `category`, `sizeType`, `page`, `limit` (20) |
| | POST | Zod: `name`, `sku`, `description`, `category`, `sizeType` (padrao `both`), `sizes[]`, `price`, `compareAtPrice`, `costPrice`, `stock` (mapa tamanho→qtd), `weightGrams`, `imageUrls[]`, `active`, `featured` |
| `/api/products/[id]` | GET / PUT | PUT valida com Zod (todos os campos opcionais) |
| | DELETE | **Delete fisico** — remove produto que pode estar referenciado em pedidos |

## Trocas e devolucoes

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/returns` | GET | Filtro `status`. Inclui contato e pedido |
| | POST | Zod: `orderId`, `contactId`, `type` (`exchange`/`return`/`refund`), `reason` (`wrong_size`/`defect`/`not_as_expected`/`changed_mind`/`other`), `reasonDetail`, `items[]`, `mediaIds[]`. Nasce com `status: "requested"` |
| `/api/returns/[id]` | PUT | Sem Zod. `status`, `trackingCode`, `refundAmount`, `refundMethod`, `resolvedBy`. Status `completed` ou `denied` grava `resolvedAt` |

## Midia

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/media/upload` | POST | `multipart/form-data`: `file` (obrigatorio), `folder` (padrao `general`), `productId`, `tags` (CSV), `uploadedBy`. Envia ao Cloudinary em `merlos-store/{folder}` e grava `MediaFile` com dimensoes/duracao |
| `/api/media/gallery` | GET | Filtros `folder`, `fileType`, `tag`, `productId`, `search`, `page`, `limit` (30) |
| `/api/media/send` | POST | Zod: `conversationId`, `mediaFileIds[]` (min 1), `caption` (o remetente vem da sessao). Envia cada arquivo pelo adapter do canal conforme o `fileType`; arquivo inexistente e pulado em silencio. Devolve `{ sent, messages }` |
| `/api/media/[id]` | GET / PUT | PUT altera `folder`, `tags`, `productId` |
| | DELETE | **Delete fisico**: remove do Cloudinary (falha e apenas logada) e depois do banco |

> [!WARNING]
> `POST /api/media/upload` nao limita tamanho nem valida o MIME contra uma
> allowlist. Sem autenticacao (achado #1), e um upload aberto para o Cloudinary
> da conta.

## Lookbooks

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/lookbooks` | GET | Lista completa, sem filtro nem paginacao |
| | POST | Zod: `name`, `description`, `coverMediaId`, `productIds[]`, `mediaIds[]`, `active` |
| `/api/lookbooks/[id]` | GET | `404` se nao existir |
| | PUT | Sem Zod — grava os campos do body direto |
| | DELETE | **Delete fisico** |

## Campanhas, agendamentos e templates

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/broadcasts` | GET | Filtro `status` |
| | POST | Zod: `name`, `templateId`, `channel` (padrao `whatsapp`), `segmentFilter`, `content`, `mediaIds[]`, `scheduledFor`. O `segmentFilter` aceita `tags` (`hasEvery`), `preferred_size`, `min_spent` e `max_days_since_purchase`; conta os destinatarios sempre com `optOut: false`. Status vira `scheduled` se houver data, senao `draft` |
| `/api/broadcasts/[id]` | GET | Campanha + template + ate 50 destinatarios |
| | PUT | `status` (`sending` grava `startedAt`, `completed` grava `completedAt`), `name`, `scheduledFor` |
| | DELETE | **Delete fisico**: apaga `BroadcastRecipient` e depois a campanha |
| `/api/scheduled` | GET | Filtros `status`, `triggerType`, `contactId`. Ordena por `scheduledFor` asc, teto de 50 |
| | POST | Zod: `contactId`, `content`, `scheduledFor` (ISO), `triggerType` (`manual`, `follow_up`, `post_sale`, `abandoned`, `reactivation`, `birthday`, `promotion`), `templateId`, `templateVars[]`, `mediaIds[]` |
| `/api/scheduled/[id]` | PUT | `status`, `scheduledFor`, `content`, `sentAt`, `errorMessage` |
| | DELETE | **Unico soft delete da API**: grava `status: "cancelled"` |
| `/api/templates` | GET | Templates WhatsApp. Filtros `status`, `category` |
| | POST | Zod: `name`, `category` (`marketing`/`utility`/`authentication`), `language` (padrao `pt_BR`), `headerType`, `headerContent`, `body`, `footer`, `buttons[]` |
| `/api/templates/[id]` | GET / PUT | PUT sem Zod. `status: "pending"` grava `submittedAt`; `approved` grava `approvedAt`; `rejected` grava `rejectionReason`. Aceita `metaTemplateId` |
| | DELETE | **Delete fisico** |
| `/api/quick-replies` | GET | Filtros `search` (titulo/atalho/conteudo) e `category` |
| | POST | Zod: `title`, `content`, `category`, `shortcut`, `isActive` |
| `/api/quick-replies/[id]` | PUT | Zod, campos opcionais |
| | DELETE | **Delete fisico** |

## Base de conhecimento

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/knowledge` | GET | Filtros `search` (titulo/conteudo/tags) e `category`. Ordena por `updatedAt` desc |
| | POST | Zod: `title`, `content`, `category`, `tags[]`, `isPublic`, `createdBy` |
| `/api/knowledge/[id]` | GET | `404` se nao existir |
| | PUT | Sem Zod. **Sobrescreve todos os campos** — omitir um campo grava `undefined` nele |
| | DELETE | **Delete fisico** |

## IA (Anthropic)

Implementacao em `src/lib/ai/`. Todas as rotas exigem `ANTHROPIC_API_KEY`.

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/ai/classify` | POST | Zod `{ messageId }`. Classifica a mensagem com contexto do contato (nome, tamanho, tags), grava em `message.aiClassification` e **acrescenta ao contato as tags sugeridas** pelo modelo |
| `/api/ai/suggest` | POST | Zod `{ conversationId }`. Gera sugestao de resposta com nome e tamanho preferido do contato. Nao persiste |
| `/api/ai/summarize` | POST | Zod `{ conversationId }`. Resume a conversa e grava em `conversation.aiSummary` |

> [!NOTE]
> Em `/api/ai/classify` o modelo escreve direto no cadastro do contato, sem
> revisao humana. Uma classificacao ruim vira tag permanente — e tag alimenta
> segmentacao de broadcast.

## Pagamentos

Provider resolvido por `getPaymentProvider()` (`src/lib/payments/index.ts`),
conforme `PAYMENT_PROVIDER` no `.env`.

> [!IMPORTANT]
> Hoje `getPaymentProvider()` devolve **sempre** o `mockPaymentProvider`. Os
> cases de Mercado Pago e Asaas estao comentados como "Future". As duas rotas
> abaixo geram cobranca falsa e gravam `Payment` real no banco — util para
> demo, invalido para producao.

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/payments/link` | POST | Zod `{ orderId }`. Gera link de pagamento com os itens do pedido, cria `Payment` (`method: "link"`, `status: "pending"`) e marca `paymentMethod: "link"` no pedido |
| `/api/payments/pix` | POST | Zod `{ orderId, expirationMinutes }` (padrao 30). Gera QR Code + copia-e-cola, cria `Payment` (`method: "pix"`) e marca o pedido |

## Alertas, metricas e auditoria

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/alerts` | GET | Filtros `type`, `severity`, `acknowledged` (`true`/`false`), `page`, `limit` (30). Devolve tambem `unacknowledgedCount` |
| `/api/alerts/[id]` | PUT | Reconhece o alerta: grava `acknowledgedBy` (do body) e `acknowledgedAt` |
| `/api/alerts/check` | POST | Dispara `checkAlerts()` (`src/lib/alerts/engine.ts`). Cron a cada 1 minuto, com `Authorization: Bearer $CRON_SECRET` |
| `/api/analytics` | GET | `?days` (padrao 7). Devolve `kpis` (conversas abertas, conversas e mensagens no periodo, contatos, valor do pipeline, deals ganhos, receita paga, taxa de conversao) e `charts` (`channelData`, `volumeData`, `pipelineByStage`, `slaData`) |
| `/api/activity-logs` | GET | Filtros `userId`, `action`, `entityType`, `page`, `limit` (50) |
| | POST | Grava um registro na trilha. `userId` vem da sessao e `ipAddress` de `x-forwarded-for`/`x-real-ip` — o body so escolhe `action`, `entityType`, `entityId` e `details` (sem Zod) |
| `/api/surveys` | GET | Filtro `contactId`, teto de 50. Calcula `avgScore` (CSAT) e `totalResponses` sobre as respondidas |
| | POST | Zod: `contactId`, `conversationId`, `orderId`, `triggerType`. Grava `sentAt` |
| `/api/transcription` | POST | Processa ate 5 transcricoes pendentes (`src/lib/transcription/whisper`). Cron, com `Authorization: Bearer $CRON_SECRET` |

> [!WARNING]
> A trilha de auditoria exigida pelo `CLAUDE.md` (quem, o que, quando em toda
> mutacao) ainda **nao e automatica**: nenhuma rota de escrita grava em
> `ActivityLog` sozinha. O registro so acontece se o front chamar `POST
> /api/activity-logs`. O "quem" ja e confiavel (vem da sessao); falta o "toda
> mutacao".

## LGPD

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/lgpd` | GET | `?contactId`. Direito de acesso: exporta contato, conversas com mensagens, pedidos e consentimentos, com `exportedAt` |
| | POST | Registra consentimento (`type`: `data_processing`/`marketing`/`opt_out`, `granted`, `channel`, `ipAddress`). `opt_out` concedido marca `contact.optOut = true`, o que retira o contato de todo broadcast |
| | DELETE | `?contactId`. Direito ao esquecimento: apaga em cascata consentimentos, pesquisas, destinatarios de broadcast, agendamentos, alertas, pagamentos, eventos de pedido, devolucoes, pedidos, eventos de deal, deals, midia de mensagem, mensagens, conversas e o contato |

O delete fisico aqui e **exigido por lei** (LGPD art. 18, VI) — soft delete nao
cumpre o direito ao esquecimento. E a unica excecao permitida a regra de soft
delete, registrada no [ADR-0002](adr/0002-orm-transicao-prisma-drizzle.md).

> [!CAUTION]
> `DELETE /api/lgpd` apaga os dados de um cliente inteiro a partir de um unico
> parametro de query. Hoje exige sessao **de admin**, mas ainda **sem
> confirmacao**, e as ~20 exclusoes rodam **fora de transacao**: uma falha no
> meio deixa o contato parcialmente apagado, sem rollback. Continua sendo a
> rota mais perigosa do sistema.

## Webhooks

Recebem eventos externos. Depois de autenticados, sempre respondem `200`,
inclusive em erro de processamento, para o provedor nao reenviar em loop — o
erro fica no log do servidor. Falha de **autenticacao** responde `401`/`403`.

### Roteamento por conta

Autenticado o evento, o handler descobre **qual conta** o recebeu — nao so qual
loja. Com dois numeros na mesma loja, saber a loja nao diz por onde responder.

| Canal | De onde sai a conta |
|-------|---------------------|
| WhatsApp | `metadata.phone_number_id` do payload |
| Instagram / Facebook | `entry.id` do payload (perfil ou pagina) |
| TikTok | `?conta=<shop id>` na URL — o payload nao traz identificador que saibamos ler |

A conta e resolvida por `(provedor, referencia_externa)` em
`stores_integracoes` (`src/lib/roteamento.ts`), e dela sai a loja. **Conta
desconhecida: responde `200` e descarta**, registrando no log — criar conversa
numa loja chutada e pior do que perder o evento.

A conversa guarda `store_integracao_id`, e o envio (`/api/messages`,
`/api/media/send`) resolve essa conta para responder **pelo mesmo numero em que
a mensagem entrou**. A cliente que escreve para o SAC nao recebe resposta pelo
numero de vendas.

### Credencial por conta

`getAdapterDaConta` (`src/lib/channels/index.ts`) monta o adapter com a
credencial da conta por onde a conversa entrou. Chaves esperadas, declaradas em
`CHAVES_ESPERADAS` (`src/lib/integracoes.ts`):

| Provedor | Chaves | Opcional |
|----------|--------|----------|
| `uazapi` (WhatsApp) | `phone_id`, `access_token` | — |
| `instagram` | `page_access_token` | `instagram_account_id` |
| `facebook` | `page_access_token` | — |
| `bling` | preenchido pelo OAuth, nao a mao | — |
| `tiktok_shop` | ainda sem credencial por conta | — |

Conectar com chave faltando responde `400` dizendo qual falta — credencial
errada gravada cifrada so falharia no primeiro envio, longe de quem digitou.

Credencial ausente ou incompleta cai no adapter do ambiente: melhor do que
montar um adapter que falha em toda chamada.

> [!NOTE]
> TikTok ainda usa so o ambiente — o adapter dele nao tem configuracao nenhuma
> hoje, entao nao ha o que injetar.

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/webhooks/whatsapp` | GET | Verificacao Meta: devolve `hub.challenge` quando `hub.verify_token` bate com `WHATSAPP_VERIFY_TOKEN` |
| | POST | Exige HMAC valido em `X-Hub-Signature-256` (`META_APP_SECRET`), calculado sobre o corpo cru. Processa mensagens e status de entrega; midia e baixada pelo `mediaId` e convertida em data URL base64 antes de subir para o Cloudinary |
| `/api/webhooks/instagram` | GET | Verificacao Meta com `INSTAGRAM_VERIFY_TOKEN` (token proprio do canal) |
| | POST | Assinatura Meta → `parseInstagramMessages` → `processIncomingMessage` |
| `/api/webhooks/facebook` | GET | Verificacao Meta com `FACEBOOK_VERIFY_TOKEN` |
| | POST | Assinatura Meta → `parseFacebookMessages` → `processIncomingMessage` |
| `/api/webhooks/tiktok` | GET | Challenge com `TIKTOK_VERIFY_TOKEN` |
| | POST | Exige header `x-webhook-secret` igual a `TIKTOK_VERIFY_TOKEN` → `parseTikTokEvents` → `processIncomingMessage` |
| `/api/webhooks/uazapi` | POST | WhatsApp **nao-oficial**. Exige `x-uazapi-secret` (ou `?segredo=`) igual a `UAZAPI_WEBHOOK_SECRET` → `parseUazapiMessages` → `processIncomingMessage`. Sem GET: o uazapi nao faz challenge. Resolve a conta pelo provedor `uazapi`; a rota `/whatsapp` acima resolve por `whatsapp_oficial` — sao provedores diferentes do mesmo canal |
| `/api/webhooks/payments` | POST | Exige `x-webhook-secret` (ou `asaas-access-token`) igual a `PAYMENT_WEBHOOK_SECRET`. Localiza o `Payment` por `externalId` (aceita `data.id`, `payment.id` ou `id`). Mapeia o evento para `approved`/`rejected`/`refunded` por substring (`approved`, `payment.confirmed`, `PAYMENT_RECEIVED`, `cancelled`, `refund`). Se aprovado, marca `paymentStatus: "paid"` e cria `OrderEvent` |

> [!NOTE]
> O HMAC da Meta e sobre os **bytes originais** do corpo. Por isso as rotas
> fazem `await req.text()` e so depois `JSON.parse` — um `req.json()` seguido de
> `JSON.stringify` nao reproduz o payload byte a byte e derruba a assinatura.
>
> A checagem do webhook de pagamento e segredo compartilhado, nao HMAC. Trocar
> pela assinatura do provedor real (Mercado Pago manda `x-signature` com ts+v1)
> quando `getPaymentProvider()` deixar de devolver o mock.

## Baixar mensagem de midia (fluxo completo)

Como referencia de leitura, o caminho de uma mensagem recebida:

```
Meta/TikTok  ──POST──>  /api/webhooks/<canal>
                            │  parse<Canal>Messages()      src/lib/channels/<canal>.ts
                            ▼
                        processIncomingMessage()           src/lib/channels/gateway.ts
                            │  cria/atualiza Contact + Conversation + Message
                            ▼
                        (opcional) POST /api/ai/classify   tags e classificacao
```

E o de envio:

```
UI  ──POST──>  /api/messages  ──getAdapter(canal).sendText/Image/...──>  API do canal
                     │                                                        │
                     └──saveOutgoingMessage()──> Message (externalId) <────────┘
```
