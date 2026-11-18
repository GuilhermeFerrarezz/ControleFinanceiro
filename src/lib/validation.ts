import { z } from 'zod';

export class InputError extends Error {}
const jsonObject = z.record(z.string(), z.unknown());
const emailSchema = z.string().trim().toLowerCase().max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  .refine(email => !/[\u0000-\u001f\u007f]/.test(email));
const nameSchema = z.string().trim().min(2).max(120).refine(name => !name.includes('\0'));
const passwordSchema = z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72);

export async function readBody(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!request.body) throw new InputError('Informe os dados da solicitação.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new InputError('Solicitação muito grande.'); }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = jsonObject.safeParse(body);
    if (!result.success) throw new InputError('Envie um objeto JSON válido.');
    return result.data;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Envie um objeto JSON válido.');
  } finally { reader.releaseLock(); }
}
export function emailValue(value: unknown) {
  const result = emailSchema.safeParse(value);
  if (!result.success) throw new InputError('Informe um e-mail válido.');
  return result.data;
}
export function textValue(value: unknown, label: string) {
  const result = nameSchema.safeParse(value);
  if (!result.success) throw new InputError(`${label} deve ter entre 2 e 120 caracteres, sem caracteres nulos.`);
  return result.data;
}
export function passwordValue(value: unknown, registration = false) {
  if (typeof value !== 'string' || !value.length) throw new InputError('Informe sua senha.');
  if (!passwordSchema.safeParse(value).success) throw new InputError('A senha é muito longa. Use uma senha menor.');
  if (registration && value.length < 6) throw new InputError('Use uma senha com pelo menos 6 caracteres.');
  return value;
}
