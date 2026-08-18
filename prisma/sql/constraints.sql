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
