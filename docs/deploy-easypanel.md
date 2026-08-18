# Deploy no EasyPanel

Tudo que o sistema precisa para rodar. As variaveis abaixo foram extraidas do
codigo (`process.env` real), nao do `.env.example` — ele tem sobras de features
que ainda nao existem.

## 1. Servicos a criar no EasyPanel

| Servico | Imagem | Obrigatorio | Observacao |
|---------|--------|:-----------:|------------|
| **App** | build do repo | sim | Next.js 14 |
| **PostgreSQL** | `postgres:16` | sim | o sistema nao sobe sem banco |
| **MinIO** | `minio/minio` | sim | midia; sem ele upload e exibicao de imagem falham |
| ~~Redis~~ | — | **nao** | `REDIS_URL` esta no `.env.example`, mas **nenhuma linha do codigo le Redis**. BullMQ nunca foi instalado. Nao provisione ainda |

## 2. App

**Construcao: Dockerfile.** O repositorio tem um `Dockerfile` na raiz, e e a
opcao certa aqui — `sharp` (miniaturas) e o engine do Prisma usam binario
nativo, e o Dockerfile fixa Debian slim com `openssl`, onde os dois funcionam.
No campo "Arquivo", deixe `Dockerfile`.

O build e multi-estagio e usa `output: standalone` do Next: a imagem final leva
so o servidor tracado (~48 MB de app), sem codigo-fonte nem devDependencies.

**Porta: 3000.** O container escuta em `0.0.0.0:3000`, e a regra de dominio
precisa apontar para essa porta.

> [!WARNING]
> **Porta trocada devolve o 404 do proprio EasyPanel**, que parece "app fora do
> ar" e nao e. Aconteceu aqui: o Dockerfile trazia 3005 (a porta de
> desenvolvimento local), o EasyPanel injetou `PORT=3000` por cima, o container
> subiu em 3000 e a regra de dominio apontava para 3005 — o proxy batia em
> porta fechada.
>
> Hoje o Dockerfile usa 3000 justamente para os dois caminhos concordarem. Se o
> log do container disser outra porta, e a regra de dominio que precisa
> acompanhar, nao o contrario.

> [!CAUTION]
> **Nao passe segredo como build-arg.** O EasyPanel monta o `docker buildx
> build` com cada variavel em `--build-arg`, e isso tem duas consequencias: o
> valor aparece **em texto puro no log de build**, e fica gravado no historico
> da imagem, legivel com `docker history`.
>
> Este Dockerfile **nao declara nenhum `ARG`**, entao os build-args sao
> ignorados. As variaveis precisam estar em **Environment / Runtime**, que e
> onde o app as le de qualquer forma.
>
> Segredo que ja apareceu em log deve ser considerado comprometido e
> **rotacionado**.

**Health check**: `GET /login` responde 200 sem sessao. Nao use `/`, que
redireciona.

## 3. Variaveis de ambiente

### Obrigatorias — o sistema nao funciona sem

| Variavel | Valor | Como gerar |
|----------|-------|------------|
| `DATABASE_URL` | `postgresql://USER:SENHA@HOST:5432/merlostore` | do servico Postgres do EasyPanel |
| `NEXTAUTH_URL` | `https://seu-dominio.com` | a URL publica final, **sem barra no fim** |
| `NEXTAUTH_SECRET` | — | `openssl rand -base64 32` |
| `INTEGRATIONS_KEY` | — | `openssl rand -hex 32` — **exatamente 64 caracteres hex** |
| `S3_ENDPOINT` | `https://minio.seu-dominio.com` | a URL **publica** do MinIO, nao a interna |
| `S3_BUCKET` | `merlostore-midia` | criar o bucket, **privado** |
| `S3_ACCESS_KEY` | — | do MinIO |
| `S3_SECRET_KEY` | — | do MinIO |
| `S3_REGION` | `us-east-1` | qualquer valor; o MinIO ignora |

> [!WARNING]
> **`NEXTAUTH_URL` com `https` exige que o dominio sirva HTTPS de verdade.**
> Com https, o NextAuth so aceita o cookie `__Secure-`, que o navegador recusa
> em http — o login falha sem mensagem clara. Foi exatamente o que travou o
> ambiente local nesta sessao.

> [!WARNING]
> **`INTEGRATIONS_KEY` precisa de 32 BYTES = 64 caracteres hex.** Uma chave de
> 32 caracteres (16 bytes) e recusada: o cofre e AES-256 e responde
> `INTEGRATIONS_KEY tem 16 bytes; precisa de 32`. O sintoma e conectar qualquer
> integracao devolver `503`.

> [!WARNING]
> **`S3_ENDPOINT` tem que ser a URL publica do MinIO.** A URL interna
> (`http://minio:9000`) funciona para gravar, mas quebra o envio de midia: ao
> mandar imagem para a cliente, quem baixa e a Meta/uazapi, e eles recebem uma
> URL assinada montada em cima deste endpoint. Com o endereco interno, a URL
> aponta para um host que so existe dentro da rede do EasyPanel.

> [!CAUTION]
> **`INTEGRATIONS_KEY` nao pode mudar depois.** Ela cifra os tokens de Bling,
> TikTok, Instagram e uazapi no banco. Trocar torna toda credencial ja gravada
> ilegivel, e cada integracao precisa ser reconectada na mao. Use chaves
> **diferentes** em HML e PRD.

### Obrigatorias por funcionalidade

Cada bloco so e necessario se aquele canal for usado. **Sem o segredo, o webhook
responde 403 em vez de aceitar qualquer POST** — e proposital.

| Funcionalidade | Variaveis |
|----------------|-----------|
| WhatsApp oficial (Meta) | `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` |
| Instagram / Facebook | `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_VERIFY_TOKEN`, `FACEBOOK_VERIFY_TOKEN` |
| TikTok (mensagens) | `TIKTOK_VERIFY_TOKEN` |
| TikTok Shop | `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_REDIRECT_URI` |
| WhatsApp uazapi | `UAZAPI_BASE_URL`, `UAZAPI_WEBHOOK_SECRET` |
| Bling | `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI` |
| Crons | `CRON_SECRET` |
| IA (sugestao, resumo) | `ANTHROPIC_API_KEY` |
| Transcricao de audio | `OPENAI_API_KEY` |
| Pagamento | `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_PROVIDER` |

`META_APP_SECRET` merece destaque: ele valida a assinatura dos **tres** webhooks
da Meta. Sem ele, os tres respondem 403 e nenhuma mensagem entra.

As `REDIRECT_URI` do Bling e do TikTok Shop precisam ser **identicas** as
cadastradas no painel de cada um, com o dominio de producao:

```
https://seu-dominio.com/api/integracoes/bling/callback
https://seu-dominio.com/api/integracoes/tiktok/callback
```

### Que estao no `.env.example` mas o codigo NAO le

Nao configure — sao placeholders de features nao construidas: `REDIS_URL`,
`META_APP_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `TIKTOK_CLIENT_KEY`,
`TIKTOK_CLIENT_SECRET`, `MERCADOPAGO_ACCESS_TOKEN`, `ASAAS_API_KEY`.

## 4. MinIO — o bucket precisa ser privado

Depois de subir o servico, crie o bucket e **garanta que ele nao e publico**:

```bash
mc alias set prd http://minio:9000 SEU_ACCESS_KEY SUA_SECRET_KEY
mc mb prd/merlostore-midia
mc anonymous set none prd/merlostore-midia
```

O bucket guarda foto de cliente e conversa. Publico significa que qualquer um
com o link ve o arquivo, sem sessao e sem escopo de loja — anulando o isolamento
entre as duas lojas (ver [ADR 0006](adr/0006-midia-no-minio.md)).

## 5. Banco: primeira subida

Depois do primeiro deploy, no terminal do container do app:

```bash
node scripts/db-bootstrap.mjs && node scripts/db-constraints.mjs
```

O primeiro cria as 26 tabelas; o segundo aplica CHECK constraints que o Prisma
nao expressa (sem elas o banco aceita estados que o sistema considera
impossiveis).

**Nao use `npx prisma db push` aqui — o CLI nao esta na imagem, de proposito.**
No Prisma 7 ele exige `@prisma/dev`, que puxa pglite, hono, effect e mais 14
pacotes; o runtime sairia de 48 MB para mais de 800 MB por causa de um comando
usado duas vezes por ano. Em vez disso, o SQL de criacao e gerado no build
(`prisma migrate diff --from-empty`) e aplicado com `pg`, que ja vem no bundle.

`db-bootstrap.mjs` **so age em banco vazio**. Se ja houver tabelas, ele avisa e
sai sem tocar em nada — reaplicar o SQL de criacao falharia no meio e deixaria
o schema quebrado.

### Alterar o schema depois

O bootstrap cria do zero; ele nao migra. Para mudancas em um banco que ja
existe, rode de uma maquina com o repositorio, apontando para producao:

```bash
DATABASE_URL="postgres://usuario:senha@host:5432/banco" npx prisma db push
```

Isso exige que o Postgres esteja acessivel de fora — no EasyPanel, exponha a
porta do servico de banco, e **feche depois**.

**Nao rode `npm run db:seed` em producao** — ele apaga e recria dados de exemplo.

## 6. Depois de subir: 3 passos que destravam o sistema

Sem eles o sistema sobe mas nao opera.

1. **Criar o primeiro usuario.** Acesse `/register`. O primeiro cadastro do
   sistema nasce `admin`; os seguintes exigem sessao de admin.
2. **Cadastrar as duas lojas** em `/settings` (Centro e Cerro Azul).
3. **Preencher `bling_deposito_id` em cada loja.** Sem o de-para, a leitura de
   saldo responde `409` de proposito — saldo do deposito errado e pior do que
   saldo nenhum. Nao ha tela para isso ainda; e um `UPDATE` no banco.

## 7. Webhooks a cadastrar em cada provedor

Todos com o dominio de producao:

| Provedor | URL |
|----------|-----|
| WhatsApp (Meta) | `https://seu-dominio.com/api/webhooks/whatsapp` |
| Instagram | `https://seu-dominio.com/api/webhooks/instagram` |
| Facebook | `https://seu-dominio.com/api/webhooks/facebook` |
| TikTok | `https://seu-dominio.com/api/webhooks/tiktok` |
| uazapi | `https://seu-dominio.com/api/webhooks/uazapi` + header `x-uazapi-secret` |
| Pagamento | `https://seu-dominio.com/api/webhooks/payments` |

## 8. Crons

Duas rotas precisam de agendador externo (o EasyPanel tem cron por servico):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://seu-dominio.com/api/alerts/check
curl -H "Authorization: Bearer $CRON_SECRET" https://seu-dominio.com/api/transcription
```

Sugestao: alertas a cada 5 min, transcricao a cada 10 min.

## 9. Backup

O `deploy.yml` do repositorio faz backup do Postgres antes de deploy em PRD, mas
ele assume SSH proprio — no EasyPanel o caminho e outro. Configure o backup do
Postgres pelo painel.

**O MinIO tambem precisa de backup**, e isso e novo: a politica atual so cobria
o banco. Midia excluida fica no bucket (soft delete, [ADR 0005](adr/0005-soft-delete.md)),
entao o volume so cresce ate existir rotina de limpeza — que ainda nao existe.

## 10. O que nao esta pronto para producao

Honestidade sobre o estado, para nao virar surpresa:

- **O ciclo de midia nunca rodou contra um MinIO real** (Docker estava fora na
  maquina de dev). Faca um upload pela galeria logo apos subir; e o unico jeito
  de confirmar credencial e round-trip de bytes.
- **Nao ha fila.** Envio, broadcast e transcricao rodam dentro do request. Um
  broadcast grande vai estourar timeout.
- **A trilha de auditoria nao e automatica** — `ActivityLog` existe e nenhuma
  rota escreve nela.
- **Paginas nao tem RBAC**: qualquer usuario logado abre `/settings`. A API esta
  travada, mas o menu mostra o que ele nao consegue usar.
- **`stores.bling_deposito_id` sem tela** (ver passo 6.3).

## Constraints e regras do banco

`node scripts/db-bootstrap.mjs` faz duas coisas, e a segunda roda **sempre**:

1. `prisma/schema.sql` — cria as tabelas, apenas em banco vazio;
2. `prisma/sql/constraints.sql` — em toda execucao.

Ate 18/08/2026 o script aplicava so a etapa 1, e as regras que o Prisma nao
declara (`users_loja_por_papel`, o indice de idempotencia de mensagem) nunca
chegavam ao banco publicado — elas so eram aplicadas por `npm run db:push`, que
exige o CLI e o repositorio, e portanto nunca rodou contra o deploy.

Por isso `constraints.sql` e escrito para ser reaplicavel (`DROP ... IF EXISTS`
+ `ADD`, `CREATE INDEX IF NOT EXISTS`, `DROP NOT NULL`): rodar a cada start e o
canal por onde uma regra nova alcanca um banco que ja existe.

### O que ele NAO faz

Nao altera tabela existente — coluna nova, tipo trocado. Para isso:

```bash
npx prisma db push
```

de uma maquina com o repositorio, com `DATABASE_URL` apontando para producao.

### Se as constraints falharem

O container **sobe assim mesmo** e o log mostra `AVISO: falha ao aplicar as
constraints`. E proposital: banco com dado que viola uma regra nova nao pode
virar container que nao inicia — o operador precisa entrar para arrumar o dado.
Depois de corrigir, rode `node scripts/db-bootstrap.mjs` de novo.
