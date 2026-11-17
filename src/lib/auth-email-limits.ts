import { consumeLimit } from './rate-limit';
import type { AuthTokenType } from '../models/AuthToken';

export const AUTH_EMAIL_COOLDOWN_SECONDS = 60;
export async function allowAuthEmail(email: string, type: AuthTokenType) {
  if (!await consumeLimit(`${type}:cooldown:${email}`, 1, AUTH_EMAIL_COOLDOWN_SECONDS * 1000)) return false;
  return consumeLimit(`${type}:email:${email}`, 3, 15 * 60_000);
}

// Shared across route bundles. Distributed quotas also protect multiple instances.
const runtime = globalThis as unknown as { financeEmailCapacity?: { active: number } };
const capacity = runtime.financeEmailCapacity ??= { active: 0 };
const recoveryRuntime=globalThis as unknown as {financeRecoveryCapacity?:{active:number}};
const recoveryCapacity=recoveryRuntime.financeRecoveryCapacity??={active:0};
// No unbounded in-memory queue after sending the generic HTTP response.
export async function withRecoveryRequestBudget<T>(work:()=>Promise<T>) {
  if (recoveryCapacity.active>=4) return;
  recoveryCapacity.active++;
  try {
    if (!await consumeLimit('auth-email:requests',60,60_000)) return;
    return await work();
  } finally {recoveryCapacity.active--;}
}
export async function withAuthEmailBudget<T>(work: () => Promise<T>) {
  if (capacity.active >= 2) throw new Error('Envio ocupado.');
  capacity.active++;
  try {
    if (!await consumeLimit('auth-email:second', 2, 1000) ||
      !await consumeLimit('auth-email:minute', 30, 60_000)) throw new Error('Limite de envio atingido.');
    return await work();
  } finally { capacity.active--; }
}
