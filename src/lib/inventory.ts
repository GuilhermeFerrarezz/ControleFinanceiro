import { isDeepStrictEqual } from 'node:util';
import type { Queryable } from './postgres';
import { inTransaction } from './postgres';
import { InputError } from './validation';
import { lockCatalog, listProducts } from '../models/Catalog';
import { findMembership } from '../models/Membership';
import { inventoryProducts, inventoryHistory, ensureInventoryProduct } from '../models/Inventory';
import { stockBalance, stockQuantity, stockUnit, STOCK_UNITS, type InventoryData } from './inventory-shared';
import type { ExpenseInput } from './expense-shared';

const uuid = (value: unknown) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InputError('Identificador inválido.');
  return value.toLowerCase();
};
function limitedText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new InputError(`${label}: use até ${max} caracteres.`);
  return value.trim();
}
export async function validateStockItems(empresaId: string, input: ExpenseInput, client: Queryable) {
  for (const item of input.items || []) if (item.stock) {
    if (!item.productId) throw new InputError('Selecione um produto cadastrado para adicionar ao estoque.');
    const unit = stockUnit(item);
    await ensureInventoryProduct(empresaId, item.productId, unit, client);
    const settings = (await client.query<{ unit: string }>('SELECT unit FROM inventory_products WHERE empresa_id=$1 AND product_id=$2', [empresaId, item.productId])).rows[0];
    if (settings.unit !== unit) throw new InputError(`“${item.name}” é controlado em ${settings.unit}. Confira a unidade e o conteúdo da embalagem, ou desmarque a entrada no estoque.`);
  }
}
export async function assertStockBalances(empresaId: string, client: Queryable) {
  const negative = (await inventoryProducts(empresaId, client)).find(item => Number(item.balance) < 0);
  if (negative) throw new InputError(`Esta operação deixaria “${negative.name}” com estoque negativo. Corrija as saídas ou registre uma entrada antes de alterar a compra.`);
}
export async function inventoryData(empresaId: string, productId: string | null = null, page = 1, client?: Queryable): Promise<InventoryData> {
  if (productId) productId = uuid(productId);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new InputError('Página inválida.');
  const read = async (connection: Queryable) => {
    const products = await inventoryProducts(empresaId, connection);
    const history = await inventoryHistory(empresaId, productId, page, connection);
    return { products, movements: history.slice(0,30), hasNext: history.length > 30, page };
  };
  return client ? read(client) : inTransaction(read, true);
}
export async function configureInventory(empresaId: string, productId: string, body: Record<string, unknown>, client: Queryable) {
  productId = uuid(productId);
  const product = (await listProducts(empresaId, client)).find(item => item.id === productId);
  if (!product || product.archived) throw new InputError('Selecione um produto ativo deste restaurante.');
  const unit = body.unit ?? stockUnit({ unit: product.defaultUnit, packageContent: product.packageContent || undefined });
  if (!STOCK_UNITS.includes(unit as typeof STOCK_UNITS[number])) throw new InputError('Unidade de estoque inválida.');
  const minimum = stockQuantity(body.minimum ?? 0);
  const location = limitedText(body.location ?? '', 'Local de armazenamento',120);
  if (body.suppliers !== undefined && (!Array.isArray(body.suppliers) || body.suppliers.length > 10)) throw new InputError('Informe até 10 fornecedores principais.');
  const suppliers = [...new Set(((body.suppliers ?? []) as unknown[]).map(value => limitedText(value,'Fornecedor',120)).filter(Boolean))];
  await ensureInventoryProduct(empresaId, productId, String(unit), client);
  const current = (await client.query<{ unit: string }>('SELECT unit FROM inventory_products WHERE empresa_id=$1 AND product_id=$2', [empresaId,productId])).rows[0];
  if (current.unit !== unit) throw new InputError(`O estoque deste produto já é controlado em ${current.unit}. A unidade não pode ser alterada para preservar os saldos.`);
  await client.query('UPDATE inventory_products SET minimum=$3,location=$4,suppliers=$5::jsonb WHERE empresa_id=$1 AND product_id=$2', [empresaId,productId,minimum,location,JSON.stringify(suppliers)]);
}

export async function inventoryCommand(actor: { id: string; empresaId: string }, body: Record<string, unknown>) {
  return inTransaction(async client => {
    if (!await findMembership(actor.id, actor.empresaId, client, true)) throw new InputError('Você não tem mais acesso a este restaurante.');
    await lockCatalog(actor.empresaId, client);
    const productId = uuid(body.productId);
    if (body.action === 'configure') {
      await configureInventory(actor.empresaId,productId,body,client);
      return { replayed: false };
    }
    return recordInventoryMovement(actor, productId, body, client);
  });
}
export async function recordInventoryMovement(actor: { id: string; empresaId: string }, productId: string, body: Record<string, unknown>, client: Queryable) {
  const requestId = uuid(body.requestId);
  const sources = ['opening','entry','consumption','waste','count','correction'];
  if (typeof body.action !== 'string' || !sources.includes(body.action)) throw new InputError('Escolha entrada, consumo, perda ou contagem.');
  const source = body.action;
  const reason = limitedText(body.reason ?? '', 'Motivo', 300);
  const date = limitedText(body.date,'Data',10);
  if (!/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date) throw new InputError('Informe uma data válida.');
  const quantity = stockQuantity(body.quantity, source === 'count');
  const existing = (await client.query<{ product_id: string; actor_id: string; source: string; reason: string; date: string; input: unknown }>(`SELECT product_id,actor_id,source,reason,to_char(date,'YYYY-MM-DD') AS date,input FROM inventory_movements WHERE empresa_id=$1 AND request_id=$2`, [actor.empresaId,requestId])).rows[0];
  const input = { quantity: Number(quantity), expectedBalance: body.expectedBalance ?? null };
  if (existing) {
    if (existing.product_id !== productId || existing.actor_id !== actor.id || existing.source !== source || existing.reason !== reason || existing.date !== date || !isDeepStrictEqual(existing.input,input)) throw new InputError('Este envio já foi utilizado. Atualize a página.');
    return { replayed: true };
  }
  const product = (await inventoryProducts(actor.empresaId,client)).find(item => item.id === productId);
  if (!product) throw new InputError('Ative o controle de estoque para este produto primeiro.');
  if (product.archived) throw new InputError('Reative o produto em Cadastros antes de movimentar seu estoque.');
  let delta = quantity;
  if (source === 'consumption' || source === 'waste' || source === 'correction') delta = '-'+quantity;
  if (source === 'count') {
    const expected = stockBalance(body.expectedBalance);
    if (expected !== stockBalance(product.balance)) throw new InputError('O estoque mudou enquanto você fazia a contagem. Atualize a página e confira o saldo.');
    delta = (await client.query<{ delta: string }>('SELECT ($1::numeric-$2::numeric)::text AS delta',[quantity,product.balance])).rows[0].delta;
    if (Number(delta) === 0) throw new InputError('A contagem já corresponde ao saldo atual. Nenhum ajuste necessário.');
  }
  await client.query(`INSERT INTO inventory_movements(empresa_id,product_id,actor_id,request_id,quantity,date,reason,source,input) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [actor.empresaId,productId,actor.id,requestId,delta,date,reason,source,JSON.stringify(input)]);
  await assertStockBalances(actor.empresaId,client);
  return { replayed: false };
}
