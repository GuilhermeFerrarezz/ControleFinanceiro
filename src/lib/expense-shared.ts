export const EXPENSE_CATEGORIES = [
  { id: 'alimentos', label: 'Alimentos', color: '#406a4e', icon: 'leaf' },
  { id: 'funcionarios', label: 'Funcionários', color: '#a1ad6c', icon: 'team' },
  { id: 'produtos', label: 'Produtos e limpeza', color: '#c58b64', icon: 'store' },
  { id: 'bebidas', label: 'Bebidas', color: '#749da0', icon: 'store' },
  { id: 'embalagens', label: 'Embalagens', color: '#b6a076', icon: 'receipt' },
  { id: 'contas', label: 'Contas e aluguel', color: '#8a82a0', icon: 'store' },
  { id: 'manutencao', label: 'Manutenção', color: '#8f9d8a', icon: 'store' },
  { id: 'impostos', label: 'Impostos e taxas', color: '#ad716d', icon: 'receipt' },
  { id: 'outros', label: 'Outros', color: '#939889', icon: 'receipt' },
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]['id'];
export const PAYMENT_METHODS = [
  { id: 'not_informed', label: 'Não informado' }, { id: 'pix', label: 'Pix' },
  { id: 'cash', label: 'Dinheiro' }, { id: 'debit', label: 'Cartão de débito' },
  { id: 'credit', label: 'Cartão de crédito' }, { id: 'transfer', label: 'Transferência' },
  { id: 'boleto', label: 'Boleto' },
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number]['id'];
export type ExpenseStatus = 'paid' | 'pending';
export const MAX_AMOUNT_CENTS = 9_999_999_999;
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function displayDate(date: string) { return date.split('-').reverse().join('/'); }
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400_000) + 1;
}
export function parseMoneyInput(value: string): number | null {
  const input = value.trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.replaceAll('.', '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null;
}
export function monthPeriod(today = todayInSaoPaulo()) { return { start: `${today.slice(0, 7)}-01`, end: today }; }
export function newExpenseRequestId() {
  // getRandomValues works on LAN HTTP too; randomUUID requires a secure context.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type ExpenseInput = { description: string; amountCents: number; date: string; category: ExpenseCategory; merchant: string; status: ExpenseStatus; paymentMethod: PaymentMethod; notes: string };
export type ExpenseRecord = ExpenseInput & { id: string; createdBy: string; authorName: string; version: number; createdAt: string; canManage: boolean };
export type ExpenseFilters = { start: string; end: string; category: string; status: string; q: string; page: number };
export type ExpenseDashboardData = {
  filters: ExpenseFilters; expenses: ExpenseRecord[]; count: number; pages: number; pageSize: number;
  summary: { totalCents: number; paidCents: number; pendingCents: number; count: number; averageDailyCents: number; previousTotalCents: number; changePercent: number | null };
  categories: { category: ExpenseCategory; totalCents: number; count: number }[];
  series: { date: string; totalCents: number }[];
};
