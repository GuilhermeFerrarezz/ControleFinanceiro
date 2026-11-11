import { money, type ExpenseInput } from '@/src/lib/expense-shared';
import styles from './finance.module.css';
export default function ExpenseItemDetails({ expense }: { expense: ExpenseInput }) {
  if (!expense.items?.length) return null;
  const remainder = expense.amountCents - expense.items.reduce((sum, item) => sum + item.amountCents, 0);
  return <details className={styles.rowNotes}><summary>{expense.items.length} produto(s) · Ver compra</summary><ul>{expense.items.map((item, index) => <li key={index}>{item.name} · {item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unit} · {money(item.amountCents)}</li>)}</ul>{remainder > 0 && <p>Sem detalhamento: {money(remainder)}</p>}</details>;
}
