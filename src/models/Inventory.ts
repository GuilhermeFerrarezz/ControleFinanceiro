import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import type { InventoryProduct, InventoryMovement } from '../lib/inventory-shared';

export async function inventoryProducts(empresaId: string, client: Queryable = db): Promise<InventoryProduct[]> {
  return (await client.query<InventoryProduct>(`WITH purchases AS MATERIALIZED (
    SELECT l.* FROM inventory_purchase_lines l
    JOIN inventory_products s ON s.empresa_id=l.empresa_id AND s.product_id::text=l.product_id AND s.unit=l.unit
    WHERE l.empresa_id=$1
  ), purchase_totals AS (
    SELECT l.product_id,sum(l.quantity) AS quantity,sum(l.amount_cents) AS cents,max(l.date) AS last_date,
      coalesce(sum(l.quantity) FILTER (WHERE l.stocked),0) AS received
    FROM purchases l GROUP BY l.product_id
  ), movements AS (
    SELECT product_id,sum(quantity) AS quantity FROM inventory_movements WHERE empresa_id=$1 GROUP BY product_id
  ), vendors AS (
    SELECT l.product_id,lower(btrim(l.merchant)) AS merchant,min(btrim(l.merchant)) AS name,sum(l.quantity) AS quantity,sum(l.amount_cents) AS cents
    FROM purchases l WHERE btrim(l.merchant)<>'' GROUP BY l.product_id,lower(btrim(l.merchant))
  ), vendor_totals AS (
    SELECT product_id,jsonb_agg(jsonb_build_object('name',name,'quantity',quantity::text,'amountCents',cents::text) ORDER BY cents DESC,name) AS items
    FROM vendors GROUP BY product_id
  ) SELECT p.id,p.name,s.unit,s.minimum::text,s.location,s.suppliers,(p.deleted_at IS NOT NULL) AS archived,
    (coalesce(b.received,0)+coalesce(m.quantity,0))::text AS balance,
    CASE WHEN b.quantity>0 THEN round(b.cents/b.quantity)::text END AS "averageCents",
    CASE WHEN b.quantity>0 THEN round((coalesce(b.received,0)+coalesce(m.quantity,0))*b.cents/b.quantity)::text END AS "valueCents",
    coalesce(b.quantity,0)::text AS "purchaseQuantity",to_char(b.last_date,'YYYY-MM-DD') AS "lastPurchase",
    coalesce(v.items,'[]'::jsonb) AS "purchasedFrom"
  FROM inventory_products s JOIN restaurant_catalog p ON p.id=s.product_id AND p.empresa_id=s.empresa_id
  LEFT JOIN purchase_totals b ON b.product_id=p.id::text LEFT JOIN movements m ON m.product_id=p.id
  LEFT JOIN vendor_totals v ON v.product_id=p.id::text
  WHERE s.empresa_id=$1 ORDER BY p.name,p.id`, [empresaId])).rows;
}

export async function inventoryHistory(empresaId: string, productId: string | null, page: number, client: Queryable = db): Promise<InventoryMovement[]> {
  return (await client.query<InventoryMovement>(`WITH history AS MATERIALIZED (
    SELECT m.id::text,m.product_id,m.quantity,m.date,m.created_at,m.reason,m.source,m.actor_id,NULL::uuid AS expense_id
    FROM inventory_movements m WHERE m.empresa_id=$1 AND ($2::uuid IS NULL OR m.product_id=$2::uuid)
    UNION ALL
    SELECT l.expense_id::text||':'||l.position,l.product_id::uuid,l.quantity,l.date,l.created_at,
      CASE WHEN l.merchant='' THEN 'Compra recebida' ELSE 'Compra: '||l.merchant END,'purchase',l.created_by,l.expense_id
    FROM inventory_purchase_lines l JOIN inventory_products s ON s.empresa_id=l.empresa_id AND s.product_id::text=l.product_id AND s.unit=l.unit
    WHERE l.empresa_id=$1 AND l.stocked AND ($2::uuid IS NULL OR l.product_id=$2::text)
  ), page AS MATERIALIZED (
    SELECT * FROM history ORDER BY date DESC,created_at DESC,id DESC LIMIT 31 OFFSET $3
  ) SELECT h.id,h.product_id AS "productId",p.name AS "productName",s.unit,h.quantity::text,to_char(h.date,'YYYY-MM-DD') AS date,
    h.reason,h.source,u.nome AS author,h.expense_id AS "expenseId"
    FROM page h JOIN restaurant_catalog p ON p.id=h.product_id AND p.empresa_id=$1
    JOIN inventory_products s ON s.empresa_id=$1 AND s.product_id=h.product_id
    JOIN usuarios u ON u.id=h.actor_id
    ORDER BY h.date DESC,h.created_at DESC,h.id DESC`, [empresaId, productId, (page - 1) * 30])).rows;
}

export async function ensureInventoryProduct(empresaId: string, productId: string, unit: string, client: Queryable) {
  await client.query(`INSERT INTO inventory_products(empresa_id,product_id,unit) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [empresaId, productId, unit]);
}
