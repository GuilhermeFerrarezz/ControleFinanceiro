import { isIP } from 'node:net';
import { consumeLimit } from './rate-limit';
import { InputError } from './validation';

export class SecurityLimitError extends InputError {
  readonly status = 429;
}

export function honeypotResponse(body: Record<string, unknown>) {
  if (body.website === undefined || body.website === '') return null;
  return Response.json({ message: 'Solicitação recebida.' }, { headers: { 'Cache-Control': 'no-store' } });
}

// Only enable after the ingress overwrites this header and blocks direct access.
// Never infer trust from a client-supplied X-Forwarded-For header.
export function trustedClientAddress(request: Request, header = process.env.VERCEL === '1'
  ? 'x-vercel-forwarded-for' : process.env.TRUSTED_CLIENT_IP_HEADER) {
  if (!header) return null;
  const address = request.headers.get(header)?.trim() ?? '';
  const family = isIP(address);
  if (!family || address.includes('%')) throw new InputError('Endereço de origem indisponível. Confira a configuração do proxy.');
  return family === 6 ? new URL(`http://[${address}]/`).hostname : address;
}

export async function limitAuthSource(request: Request, operation: 'login' | 'register') {
  // A distributed fallback is mandatory even without a trusted IP header.
  if (!await consumeLimit(`${operation}:global`, operation === 'login' ? 300 : 30, 60_000)) throw new SecurityLimitError('Muitas tentativas. Tente novamente em instantes.');
  const address = trustedClientAddress(request);
  if (address && !await consumeLimit(`${operation}:source:${address}`, operation === 'login' ? 100 : 20,
    operation === 'login' ? 60_000 : 3600_000)) throw new SecurityLimitError('Muitas tentativas desta origem. Tente mais tarde.');
}

// Share capacity across route bundles and development reloads in this process.
const runtime = globalThis as unknown as { financeSecurityLimits?: { passwords: number; exports: number } };
const capacity = runtime.financeSecurityLimits ??= { passwords: 0, exports: 0 };
export async function withPasswordBudget<T>(work: () => Promise<T>) {
  if (capacity.passwords >= 8) throw new SecurityLimitError('Autenticação ocupada. Tente novamente em instantes.');
  capacity.passwords++;
  try { return await work(); } finally { capacity.passwords--; }
}

export async function withExportBudget<T>(userId: string, work: () => Promise<T>) {
  if (capacity.exports >= 2) throw new SecurityLimitError('Exportações ocupadas. Tente novamente em instantes.');
  if (!await consumeLimit(`exports:${userId}`, 60, 60_000)) throw new SecurityLimitError('Muitas exportações. Aguarde um minuto.');
  // Check again after the asynchronous distributed rate-limit operation.
  if (capacity.exports >= 2) throw new SecurityLimitError('Exportações ocupadas. Tente novamente em instantes.');
  capacity.exports++;
  try { return await work(); } finally { capacity.exports--; }
}
