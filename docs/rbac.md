# RBAC - Controle de Acesso Baseado em Roles

Implementado em `src/lib/rbac.ts` e aplicado pelo `src/middleware.ts` em
`/api/**`, antes de a rota rodar. Nao ha checagem espalhada por route handler:
**rota nova ja cai na regra padrao**, sem ninguem precisar lembrar.

Sem permissao a resposta e `403 { "error": "Sem permissao para esta operacao" }`.
Sem sessao, `401` — ver [oauth.md](oauth.md).

## Papeis

| Role | Quem e | Pode |
|------|--------|------|
| `admin` | dono da rede | tudo, inclusive configuracao (integracoes) e usuarios |
| `gerente` | gerencia de loja | **tudo menos configuracao e usuario** (decisao 7): exclui, exporta LGPD e le a trilha de auditoria |
| `vendedor` | atendente | operar o dia a dia: ler, criar e editar. Nao exclui |
| `viewer` | acompanhamento | so leitura |

`vendedor` e o padrao de todo cadastro novo; o primeiro usuario do sistema nasce
`admin`. Um vendedor atende **uma loja** (decisao 1) — o escopo por loja e
separado do papel e esta em `src/lib/loja.ts`.

## Regra padrao (vale sem excecao para 40 das 48 rotas protegidas)

| Metodo | admin | gerente | vendedor | viewer | Racional |
|--------|:-----:|:-------:|:--------:|:------:|----------|
| `GET` | sim | sim | sim | sim | `viewer` existe para isso |
| `POST` | sim | sim | sim | nao | criar e operacao do dia a dia |
| `PUT` / `PATCH` | sim | sim | sim | nao | idem |
| `DELETE` | sim | sim | nao | nao | gestao exclui; atendente nao |

`HEAD` e `OPTIONS` valem como leitura. Metodo fora da tabela: so `admin`.

## Excecoes

| Rota | Metodo | Quem | Por que |
|------|--------|------|---------|
| `/api/scheduled/[id]` | `DELETE` | admin, gerente, vendedor | Aqui `DELETE` e cancelamento logico (grava `status: "cancelled"`), nao exclusao — e trabalho de atendimento |
| `/api/integracoes**` | todos | admin | Credencial de integracao e chave que movimenta dinheiro e dado de cliente. Inclui `/api/integracoes/uazapi/[id]/sessao`, que parea o WhatsApp por QR code |
| `/api/usuarios**` | `POST` `PUT` `PATCH` `DELETE` | admin | Criar/editar usuario e trocar papel escala privilegio. **Ler segue o padrao**, pelo mesmo motivo de `/api/lojas`: o vendedor precisa da lista de colegas para transferir uma conversa, e a rota devolve so nome, papel e avatar, filtrados pela loja de quem pergunta |
| `/api/lojas**` | `POST` `PUT` `PATCH` `DELETE` | admin | Cadastro de loja e configuracao. **Ler segue o padrao**: a propria rota escopa o que cada papel enxerga, e o vendedor precisa da leitura para a interface mostrar em qual loja ele esta |

LGPD e trilha de auditoria **nao** sao configuracao: a tela mora em `/settings`,
mas o recurso e operacao e gestao — `gerente` alcanca os dois, entao seguem o
padrao e nao aparecem aqui.

Rotas fora da protecao de sessao (webhooks, crons, NextAuth e o bootstrap do
`/api/register`) nao passam por RBAC — autenticam por assinatura ou segredo.
Lista em `src/lib/api-publica.ts`.

## Escopo de loja: separado do papel, e por HANDLER

RBAC responde "este papel pode fazer isto?". Escopo responde "sobre QUAL loja?".
Sao coisas diferentes e as duas precisam valer: um `vendedor` pode editar
produto (RBAC), mas so os da loja dele (escopo).

Duas formas validas, e as duas tiram a loja da **sessao**, nunca do corpo:

| Funcao | Quando |
|--------|--------|
| `escopoDaLoja(usuario, lojaAtiva(req))` | ler, alterar ou excluir registro existente |
| `lojaParaGravar(usuario, lojaAtiva(req))` | criar registro novo |

**Registro fora do escopo responde `404`, nao `403`.** "Existe, mas nao e sua"
ja confirma que aquele cliente esta cadastrado na rede.

### Cuidado com id que vem do corpo

O escopo do `where` alcanca o registro principal, **nao** os ids que chegam no
JSON. `templateId` numa campanha, `productId` num arquivo de midia,
`mediaFileIds` num envio: cada um precisa ser conferido contra a loja ja
resolvida. Foi por ai que sobraram furos depois da primeira passada.

### Por que o teste e por handler

`tests/escopo-loja.test.ts` fatia cada rota por `export async function
GET|POST|PUT|PATCH|DELETE` e cobra o escopo em **cada** handler que toca dado de
loja. A versao anterior checava o arquivo inteiro, e um `POST` escopado cobria
um `GET` furado — foi assim que 36 handlers ficaram vazando entre lojas com o
teste verde, incluindo `GET /api/lgpd` (dossie completo do cliente),
`PUT /api/products/[id]` (preco e estoque) e `POST /api/payments/pix` (cobranca
de verdade).

O teste tambem exige um piso de handlers encontrados: um detector que nao acha
nada passa em silencio, e foi o que aconteceu durante o proprio conserto.

## O que os testes travam

`tests/rbac.test.ts` le as 48 rotas protegidas do disco e verifica as
invariantes sobre **todas** elas, nao sobre uma lista escrita a mao:

- `admin` passa em tudo;
- `viewer` nunca escreve;
- `vendedor` nunca exclui — e a lista de excecoes tem que ser exatamente `/api/scheduled/[id]`;
- todo `DELETE` permite `admin`;
- as unicas leituras fechadas para `viewer` sao as de configuracao (integracoes);
- token sem `role`, com role vazia ou com role inventada (`superuser`) nao passa em nada.

Afrouxar uma permissao ou criar rota permissiva nova quebra um desses testes.

## Ainda nao coberto

- **Paginas** nao tem RBAC: qualquer usuario logado abre `/settings`. O dado so
  sai pela API, que esta travada — mas o menu ainda mostra o que o usuario nao
  consegue usar.

Autoria ja esta resolvida: `createdBy`, `senderId` e afins vem de
`usuarioDaSessao()` (`src/lib/sessao.ts`), nao do body — ver [api.md](api.md).

## Roles do modelo-alvo da base

| Role | Descricao | Nivel |
|------|-----------|-------|
| `super_admin` | Conta do time de desenvolvimento (Lucas, Douglas). Ve dashboard de problemas, auditoria completa | 0 |
| `admin` | Administrador do cliente. Gerencia usuarios, ve relatorios | 1 |
| `operador` | Usuario padrao do cliente. Executa lancamentos e operacoes do dia a dia | 2 |
| `visualizador` | Apenas visualiza dados, sem permissao de escrita | 3 |

## Matriz de Permissoes

### Formato
```
C = Criar | R = Ler | U = Atualizar | D = Deletar (logico)
```

| Recurso | super_admin | admin | operador | visualizador |
|---------|------------|-------|----------|--------------|
| Dashboard problemas | CRUD | - | - | - |
| Auditoria completa | R | R | - | - |
| Usuarios | CRUD | CRUD | R | - |
| Lancamentos | CRUD | CRUD | CRU | R |
| Relatorios | CRUD | CR | R | R |
| Configuracoes | CRUD | RU | - | - |
| Contratos | CRUD | CRUD | R | R |
| Categorias | CRUD | CRUD | R | R |

## Implementacao (modelo-alvo da base)

> [!NOTE]
> Neste projeto o RBAC ja existe, com outra forma: a decisao e por
> caminho + metodo HTTP em `src/lib/rbac.ts`, aplicada uma vez no middleware,
> em vez de `temPermissao(role, recurso, acao)` chamado dentro de cada action.
> O modelo abaixo e o da base, para quando as Server Actions chegarem
> ([ADR-0002](adr/0002-orm-transicao-prisma-drizzle.md)).

### Middleware de Verificacao
Toda rota/action deve verificar permissao antes de executar:

```typescript
// src/lib/auth/rbac.ts
type Role = 'super_admin' | 'admin' | 'operador' | 'visualizador';
type Acao = 'criar' | 'ler' | 'atualizar' | 'deletar';

const permissoes: Record<string, Role[]> = {
  'lancamentos:criar': ['super_admin', 'admin', 'operador'],
  'lancamentos:ler': ['super_admin', 'admin', 'operador', 'visualizador'],
  'lancamentos:atualizar': ['super_admin', 'admin', 'operador'],
  'lancamentos:deletar': ['super_admin', 'admin'],
  'auditoria:ler': ['super_admin', 'admin'],
  'dashboard_problemas:ler': ['super_admin'],
  // ... adicionar todas as permissoes
};

export function temPermissao(role: Role, recurso: string, acao: Acao): boolean {
  const chave = `${recurso}:${acao}`;
  return permissoes[chave]?.includes(role) ?? false;
}
```

### Uso em Server Actions
```typescript
// Toda action deve comecar com verificacao
export async function criarLancamento(dados: FormData) {
  const session = await getSession();
  if (!session) throw new Error('Nao autenticado');
  
  if (!temPermissao(session.user.role, 'lancamentos', 'criar')) {
    throw new Error('Sem permissao para criar lancamentos');
  }
  
  // ... logica da action
}
```

## Dashboard Super Admin (Owner)

Visivel apenas para `super_admin`. Mostra:

1. **Alertas de Erro**: lancamentos com categoria incorreta, dados inconsistentes
2. **Erros por Usuario**: volume de erros agrupado por usuario
3. **Detalhes do Erro**: ao clicar, mostra o que foi lancado vs o que deveria ser
4. **Registros Deletados**: quem deletou, quando, qual registro
5. **Historico de Alteracoes**: timeline de todas as modificacoes no sistema

## Regras

- Nenhum usuario pode acessar dados de outro tenant/organizacao
- Super admin ve TODOS os tenants
- Toda tentativa de acesso negado deve ser logada na auditoria
- Sessoes expiram apos periodo de inatividade configuravel
