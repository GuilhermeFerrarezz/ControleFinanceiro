export class InputError extends Error {}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new InputError('Informe os dados da solicitação.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new InputError('Solicitação muito grande.'); }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Envie um objeto JSON válido.');
  } finally { reader.releaseLock(); }
}
export function emailValue(value: unknown) {
  if (typeof value !== 'string') throw new InputError('Informe um e-mail válido.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Informe um e-mail válido.');
  return email;
}
export function textValue(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 120) throw new InputError(`${label} deve ter entre 2 e 120 caracteres.`);
  return value.trim();
}
export function passwordValue(value: unknown, registration = false) {
  if (typeof value !== 'string' || !value.length) throw new InputError('Informe sua senha.');
  if (Buffer.byteLength(value, 'utf8') > 72) throw new InputError('A senha é muito longa. Use uma senha menor.');
  if (registration && value.length < 6) throw new InputError('Use uma senha com pelo menos 6 caracteres.');
  return value;
}
