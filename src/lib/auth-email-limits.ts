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
export async function withAuthEmailBudget<T>(work: () => Promise<T>) {
  if (capacity.active >= 2) throw new Error('Envio ocupado.');
  capacity.active++;
  try {
    if (!await consumeLimit('auth-email:second', 2, 1000) ||
      !await consumeLimit('auth-email:minute', 30, 60_000)) throw new Error('Limite de envio atingido.');
    return await work();
  } finally { capacity.active--; }
}
