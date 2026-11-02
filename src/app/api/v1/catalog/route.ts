import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody, textValue } from '@/src/lib/validation';
import { inTransaction } from '@/src/lib/postgres';
import { findMembership } from '@/src/models/Membership';
import { insertCatalogEntry, listCategories, listMerchants } from '@/src/models/Catalog';
export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  return NextResponse.json({ empresaId: user.empresaId, categories: await listCategories(user.empresaId), merchants: await listMerchants(user.empresaId) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante.', 403);
  const empresaId = user.empresaId;
  try {
    const body = await readBody(request);
    if (body.empresaId !== empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    if (body.kind !== 'category' && body.kind !== 'merchant') throw new InputError('Escolha categoria ou local.');
    const kind = body.kind;
    const name = textValue(body.name, 'O nome').replace(/\s+/g, ' ');
    return await inTransaction(async client => {
      if (!await findMembership(user.id, empresaId, client, true)) return jsonError('Você não tem mais acesso a este restaurante.', 403);
      return NextResponse.json(await insertCatalogEntry(empresaId, kind, name, client));
    });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar o cadastro.', error instanceof InputError ? 400 : 500); }
}
