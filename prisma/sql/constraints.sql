-- Constraints que o Prisma nao consegue declarar no schema.
-- Aplicadas por `npm run db:push` (scripts/db-constraints.mjs).
-- Idempotente: pode rodar quantas vezes precisar.

-- Papel de gestao (admin, gerente) alcanca as duas lojas e por isso tem
-- store_id nulo. Vendedor e viewer sao presos a uma loja.
-- A regra mora no banco porque "so gestao fica sem loja" nao pode depender de
-- a aplicacao lembrar: um insert direto no banco tambem tem que respeitar.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_loja_por_papel;
ALTER TABLE users ADD CONSTRAINT users_loja_por_papel CHECK (
  (role IN ('admin', 'gerente') AND store_id IS NULL)
  OR
  (role IN ('vendedor', 'viewer') AND store_id IS NOT NULL)
);

-- Idempotencia de mensagem: o mesmo evento entregue duas vezes nao vira duas
-- bolhas na conversa.
--
-- A Meta e o uazapi REENTREGAM o webhook quando nao recebem 200 no prazo — um
-- pico de latencia nosso ja basta. Sem este indice, `processIncomingMessage`
-- criava a mensagem de novo e a cliente aparecia perguntando a mesma coisa
-- duas vezes, sem erro nenhum no log.
--
-- Por loja, nao global: `external_id` e id do provedor, e duas lojas com
-- contas diferentes no mesmo provedor podem, em tese, receber o mesmo id.
--
-- Indice PARCIAL (`where external_id is not null`): mensagem interna e nota
-- nascem sem external_id, e no Postgres varios NULL nao conflitam entre si —
-- mas o indice parcial deixa a intencao explicita e e menor.
CREATE UNIQUE INDEX IF NOT EXISTS messages_store_external_id
  ON messages (store_id, external_id)
  WHERE external_id IS NOT NULL;

-- Trilha de auditoria de acao de REDE.
--
-- `activity_logs.store_id` nascia NOT NULL, e acao que nao pertence a loja
-- nenhuma (cadastrar admin, conectar o Bling) simplesmente nao cabia na
-- tabela — as acoes mais sensiveis eram as que ficavam de fora da trilha.
--
-- Reaplicavel: soltar um NOT NULL que ja foi solto nao da erro.
ALTER TABLE activity_logs ALTER COLUMN store_id DROP NOT NULL;
