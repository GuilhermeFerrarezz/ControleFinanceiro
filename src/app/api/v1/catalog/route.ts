import { configureInventory, recordInventoryMovement } from '@/src/lib/inventory';
import { todayInSaoPaulo } from '@/src/lib/expense-shared';
import { validatePackageContent } from '@/src/lib/expense-items';
import { ITEM_UNITS } from '@/src/lib/expense-shared';
import { NextResponse } from 'next/server';
import { matchesRestaurantContext, currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody, textValue } from '@/src/lib/validation';
import { inTransaction, isUniqueViolation } from '@/src/lib/postgres';
import { findMembership } from '@/src/models/Membership';
import { changeCatalogEntry, insertCatalogEntry, listProducts, listCategories, listMerchants, listStorageLocations } from '@/src/models/Catalog';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  if (!matchesRestaurantContext(request, user.empresaId)) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
  return NextResponse.json({ empresaId: user.empresaId, categories: await listCategories(user.empresaId), merchants: await listMerchants(user.empresaId), storageLocations: await listStorageLocations(user.empresaId), products: await listProducts(user.empresaId) }, { headers: { 'Cache-Control': 'no-store' } });
}
function productDetails(body: Record<string, unknown>) {
  const defaultUnit = body.defaultUnit ?? 'un';
  if (!ITEM_UNITS.includes(defaultUnit as typeof ITEM_UNITS[number])) throw new InputError('Escolha uma unidade válida.');
  const packageContent = validatePackageContent(body.packageContent);
  if (packageContent && defaultUnit !== 'pacote' && defaultUnit !== 'caixa') throw new InputError('Conteúdo por embalagem só se aplica a pacotes ou caixas.');
  return { defaultUnit: defaultUnit as typeof ITEM_UNITS[number], packageContent };
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
    if (body.kind !== 'category' && body.kind !== 'merchant' && body.kind !== 'product' && body.kind !== 'storage') throw new InputError('Escolha categoria, local de compra, armazenamento ou produto.');
    const kind = body.kind;
    if (typeof body.id !== 'string' || body.id.length > 50) throw new InputError('Cadastro inválido.');
    const id = body.id;
    const previousName = textValue(body.previousName, 'O nome anterior');
    if (remove && body.confirm !== true) throw new InputError('Confirme a exclusão.');
    const name = remove ? null : textValue(body.name, 'O nome').replace(/\s+/g, ' ');
    const details = !remove && kind === 'product' && body.defaultUnit !== undefined ? productDetails(body) : undefined;
    const previous = body.previousProduct && typeof body.previousProduct === 'object' ? productDetails(body.previousProduct as Record<string, unknown>) : undefined;
    await inTransaction(async client => {
      if (!await findMembership(user.id, empresaId, client, true)) throw new InputError('Você não tem mais acesso a este restaurante.');
      await changeCatalogEntry(empresaId, kind, id, previousName, name, client, details ? { ...details, previous } : undefined);
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
    if (body.kind !== 'category' && body.kind !== 'merchant' && body.kind !== 'product' && body.kind !== 'storage') throw new InputError('Escolha categoria, local de compra, armazenamento ou produto.');
    const kind = body.kind;
    const name = textValue(body.name, 'O nome').replace(/\s+/g, ' ');
    const details = productDetails(body);
    return await inTransaction(async client => {
      if (!await findMembership(user.id, empresaId, client, true)) return jsonError('Você não tem mais acesso a este restaurante.', 403);
      const product = await insertCatalogEntry(empresaId, kind, name, client, details.defaultUnit, details.packageContent);
      if (kind === 'product' && body.trackStock === true) {
        await configureInventory(empresaId,product.id,body,client);
        if (body.initialQuantity !== undefined && String(body.initialQuantity).trim() && Number(String(body.initialQuantity).replace(',','.')) !== 0) {
          await recordInventoryMovement({ id:user.id,empresaId },product.id,{ action:'opening', quantity:body.initialQuantity, date:todayInSaoPaulo(), reason:'Saldo inicial no cadastro do produto', requestId:body.requestId },client);
        }
      }
      return NextResponse.json(product);
    });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar o cadastro.', error instanceof InputError ? 400 : 500); }
}
