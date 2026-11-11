import { ITEM_UNITS } from '@/src/lib/expense-shared';
import { NextResponse } from 'next/server';
import { matchesRestaurantContext, currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody, textValue } from '@/src/lib/validation';
import { inTransaction, isUniqueViolation } from '@/src/lib/postgres';
import { findMembership } from '@/src/models/Membership';
import { changeCatalogEntry, insertCatalogEntry, listProducts, listCategories, listMerchants } from '@/src/models/Catalog';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  if (!matchesRestaurantContext(request, user.empresaId)) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
  return NextResponse.json({ empresaId: user.empresaId, categories: await listCategories(user.empresaId), merchants: await listMerchants(user.empresaId), products: await listProducts(user.empresaId) }, { headers: { 'Cache-Control': 'no-store' } });
}
async function mutate(request: Request, remove: boolean) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  const empresaId = user.empresaId;
  try {
    const body = await readBody(request);
    if (body.empresaId !== empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    if (body.kind !== 'category' && body.kind !== 'merchant' && body.kind !== 'product') throw new InputError('Escolha categoria, local ou produto.');
    const kind = body.kind;
    if (typeof body.id !== 'string' || body.id.length > 50) throw new InputError('Cadastro inválido.');
    const id = body.id;
    const previousName = textValue(body.previousName, 'O nome anterior');
    if (remove && body.confirm !== true) throw new InputError('Confirme a exclusão.');
    const name = remove ? null : textValue(body.name, 'O nome').replace(/\s+/g, ' ');
    await inTransaction(async client => {
      if (!await findMembership(user.id, empresaId, client, true)) throw new InputError('Você não tem mais acesso a este restaurante.');
      await changeCatalogEntry(empresaId, kind, id, previousName, name, client);
    });
    return NextResponse.json({ message: remove ? 'Cadastro excluído.' : 'Cadastro atualizado.' });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError('Este nome já pertence a outro cadastro, inclusive excluído. Use outro nome ou cadastre novamente o nome anterior para reativá-lo.', 409);
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível alterar o cadastro.', error instanceof InputError ? 400 : 500);
  }
}
export async function PATCH(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  const empresaId = user.empresaId;
  try {
    const body = await readBody(request);
    if (body.empresaId !== empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    if (body.kind !== 'category' && body.kind !== 'merchant' && body.kind !== 'product') throw new InputError('Escolha categoria, local ou produto.');
    const kind = body.kind;
    const name = textValue(body.name, 'O nome').replace(/\s+/g, ' ');
    const defaultUnit = body.defaultUnit ?? 'un';
    if (!ITEM_UNITS.includes(defaultUnit as typeof ITEM_UNITS[number])) throw new InputError('Escolha uma unidade válida.');
    return await inTransaction(async client => {
      if (!await findMembership(user.id, empresaId, client, true)) return jsonError('Você não tem mais acesso a este restaurante.', 403);
      return NextResponse.json(await insertCatalogEntry(empresaId, kind, name, client, defaultUnit as typeof ITEM_UNITS[number]));
    });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar o cadastro.', error instanceof InputError ? 400 : 500); }
}
