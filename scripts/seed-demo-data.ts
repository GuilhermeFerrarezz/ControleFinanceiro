import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';
import { inTransaction } from '../src/lib/postgres';
import { insertCatalogEntry, listCategories, listProducts, lockCatalog } from '../src/models/Catalog';
import { insertExpense, insertExpenseAudit } from '../src/models/Expense';
import { addDays, todayInSaoPaulo, type ExpenseInput, type ExpenseItem } from '../src/lib/expense-shared';
import { normalizeCatalogName } from '../src/lib/catalog-shared';
import { sumCents } from '../src/lib/financial-math';

// Explicit account selection, repeatable keys and audit records keep examples identifiable.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Informe o e-mail da conta como primeiro argumento.');
  const today = todayInSaoPaulo();
  const result = await inTransaction(async client => {
    const user = (await client.query<{ id: string; empresaId: string | null }>('SELECT id,empresa_id AS "empresaId" FROM usuarios WHERE lower(btrim(email))=$1', [email])).rows[0];
    if (!user) throw new Error('Conta não encontrada com o e-mail informado.');
    const restaurants = (await client.query<{ id: string; nome: string }>(`SELECT e.id,e.nome FROM restaurant_members m JOIN empresas e ON e.id=m.empresa_id WHERE m.user_id=$1 AND m.role='owner' AND e.ativo=TRUE ORDER BY m.created_at`, [user.id])).rows;
    const recent = (await client.query<{ empresaId: string }>(`SELECT empresa_id AS "empresaId" FROM refresh_tokens WHERE user_id=$1 AND expires_at>CURRENT_TIMESTAMP ORDER BY updated_at DESC LIMIT 1`, [user.id])).rows[0];
    const restaurant = restaurants.find(item => item.id === recent?.empresaId) || restaurants.find(item => item.id === user.empresaId) || (restaurants.length === 1 ? restaurants[0] : undefined);
    if (!restaurant) throw new Error('Não foi possível identificar um restaurante administrado pela conta.');
    await lockCatalog(restaurant.id, client);
    const categories = (await listCategories(restaurant.id, client)).filter(item => !item.archived);
    if (!categories.length) throw new Error('O restaurante precisa ter uma categoria ativa.');
    const products = (await listProducts(restaurant.id, client)).filter(item => !item.archived);
    const product = (name: string) => products.find(item => normalizeCatalogName(item.name) === normalizeCatalogName(name));
    const recipes: { merchant: string; category: string; items: [string, number, ExpenseItem['unit'], number][]; total?: number }[] = [
      { merchant: 'Mercado BH', category: 'alimentos', items: [['Arroz', 25, 'kg', 12990], ['Feijão', 10, 'kg', 8490], ['Óleo de soja', 5, 'L', 3990], ['Molho de tomate', 12, 'pacote', 3588]] },
      { merchant: 'Açougue da Praça', category: 'alimentos', items: [['Carne bovina', 12.5, 'kg', 46250], ['Frango', 8, 'kg', 11120]] },
      { merchant: 'Hortifruti da Vila', category: 'alimentos', items: [['Tomate', 8, 'kg', 4792], ['Cebola', 5, 'kg', 2245], ['Alface', 10, 'un', 2990], ['Batata', 12, 'kg', 5988]] },
      { merchant: 'Atacado da Cozinha', category: 'alimentos', items: [['Batata frita congelada', 10, 'kg', 14990], ['Queijo', 4, 'kg', 13560], ['Ovos', 60, 'un', 4200]] },
      { merchant: 'Limpeza Fácil', category: 'produtos', items: [['Detergente', 5, 'L', 2990], ['Água sanitária', 5, 'L', 2450]] },
      { merchant: 'Casa das Embalagens', category: 'embalagens', items: [['Embalagem para marmita', 200, 'un', 9200]] },
      { merchant: 'Mercado BH', category: 'alimentos', items: [['Arroz', 15, 'kg', 7490], ['Feijão', 5, 'kg', 4290], ['Macarrão', 20, 'pacote', 7980]] },
      { merchant: 'Açougue da Praça', category: 'alimentos', items: [['Carne bovina', 7, 'kg', 26530], ['Carne suína', 6, 'kg', 14340], ['Frango', 5, 'kg', 6950]] },
      { merchant: 'Mercado BH', category: 'alimentos', items: [['Café', 2, 'kg', 6990], ['Leite', 12, 'L', 5988], ['Açúcar', 5, 'kg', 2245]] },
      { merchant: 'Fornecedor de bebidas', category: 'bebidas', items: [], total: 28650 },
      { merchant: 'Serviços da cozinha', category: 'funcionarios', items: [], total: 18000 },
      { merchant: 'Hortifruti da Vila', category: 'alimentos', items: [['Tomate', 6, 'kg', 3294], ['Cenoura', 5, 'kg', 1995], ['Alho', 1.5, 'kg', 4185]] },
      { merchant: 'Atacado da Cozinha', category: 'alimentos', items: [['Batata frita congelada', 15, 'kg', 20985], ['Óleo de soja', 8, 'L', 6392]] },
      { merchant: 'Contas do restaurante', category: 'contas', items: [], total: 54890 },
      { merchant: 'Mercado BH', category: 'alimentos', items: [['Arroz', 20, 'kg', 10780], ['Feijão', 10, 'kg', 8790], ['Sal', 3, 'kg', 597]] },
      { merchant: 'Açougue da Praça', category: 'alimentos', items: [['Carne bovina', 10, 'kg', 37900], ['Frango', 10, 'kg', 13900]] },
    ];
    const offsets = [0, 1, 2, 3, 3, 4, 5, 6, 7, 7, 8, 9, 10, 10, 16, 23];
    let inserted = 0, skipped = 0;
    for (const [index, recipe] of recipes.entries()) {
      const key = `restaurant-preview-v2:${today.slice(0, 7)}:${index}`;
      if ((await client.query('SELECT id FROM expenses WHERE empresa_id=$1 AND demo_key=$2', [restaurant.id, key])).rows.length) { skipped++; continue; }
      const items = recipe.items.flatMap(([name, quantity, unit, amountCents]) => {
        const registered = product(name);
        return registered ? [{ productId: registered.id, name: registered.name, quantity, unit, amountCents }] : [];
      });
      if (!recipe.total && !items.length) { skipped++; continue; }
      const merchant = await insertCatalogEntry(restaurant.id, 'merchant', `${recipe.merchant} (exemplo)`, client);
      const input: ExpenseInput = {
        description: `${items.length ? 'Compra' : 'Gasto'} de exemplo — ${recipe.merchant}`,
        date: addDays(today, -offsets[index]), category: categories.find(item => item.id === recipe.category)?.id || categories[0].id,
        amountCents: recipe.total || sumCents(items.map(item => item.amountCents)) + (index % 3 === 0 ? 1500 : 0),
        items, merchant: merchant.name, status: index % 5 === 1 ? 'pending' : 'paid', paymentMethod: index % 2 ? 'pix' : 'debit',
        notes: 'DADOS FICTÍCIOS para demonstração dos gráficos, quantidades e filtros. Não representa uma compra real.',
      };
      const bytes = createHash('sha256').update(`${restaurant.id}:${key}`).digest().subarray(0, 16);
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.toString('hex');
      const requestId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      const saved = await insertExpense(restaurant.id, user.id, requestId, input, client);
      if (saved.created) {
        await client.query('UPDATE expenses SET demo_key=$2 WHERE id=$1', [saved.expense.id, key]);
        await insertExpenseAudit(saved.expense, user.id, 'created', null, { ...input, source: 'demo-data', demoKey: key }, client);
        inserted++;
      } else skipped++;
    }
    return { restaurante: restaurant.nome, adicionados: inserted, jaExistentesOuIndisponiveis: skipped, periodo: { inicio: addDays(today, -23), fim: today } };
  });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof Error && !('code' in error) ? error.message : 'Não foi possível adicionar os dados de exemplo.'); process.exitCode = 1; }).finally(() => db.end());
