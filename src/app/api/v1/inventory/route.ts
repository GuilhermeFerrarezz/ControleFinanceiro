import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin, matchesRestaurantContext } from '@/src/lib/auth';
import { InputError, readBody } from '@/src/lib/validation';
import { inventoryData, inventoryCommand } from '@/src/lib/inventory';

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return jsonError('Entre na sua conta para continuar.',401);
    if (!user.empresaId) return jsonError('Selecione um restaurante.',403);
    if (!matchesRestaurantContext(request,user.empresaId)) return jsonError('O restaurante ativo mudou. Atualize a página.',409);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await inventoryData(user.empresaId,params.get('productId') || null,Number(params.get('page') || 1)), { headers: { 'Cache-Control':'no-store' } });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível carregar o estoque.', error instanceof InputError ? 400 : 500); }
}
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.',403);
  try {
    const user = await currentUser();
    if (!user) return jsonError('Entre na sua conta para continuar.',401);
    if (!user.empresaId) return jsonError('Selecione um restaurante.',403);
    const body = await readBody(request);
    if (body.empresaId !== user.empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.',409);
    const result = await inventoryCommand({ id:user.id,empresaId:user.empresaId },body);
    return NextResponse.json(result);
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar a movimentação.', error instanceof InputError ? 400 : 500); }
}
