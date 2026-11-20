import { NextResponse } from 'next/server';
import { jsonError, trustedOrigin } from '@/src/lib/auth';
import { changePlatform, PlatformError, requirePlatformAdmin } from '@/src/lib/platform-admin';
import { platformOverview, platformRestaurantMembers } from '@/src/models/Platform';
import { z } from 'zod';
import { InputError, readBody } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';
import { SecurityLimitError } from '@/src/lib/security-limits';
import { AccountDeletionError } from '@/src/models/Platform';

function failure(error: unknown) {
  return jsonError(error instanceof InputError ? error.message : 'Não foi possível concluir a operação.',error instanceof PlatformError || error instanceof AccountDeletionError ? error.status : error instanceof SecurityLimitError ? 429 : error instanceof InputError ? 400 : 500);
}
export async function GET(request: Request) {
  try {
    const user = await requirePlatformAdmin();
    if (!await consumeLimit(`platform-admin:read:${user.id}`,60,60_000)) throw new PlatformError('Aguarde antes de atualizar novamente.',429);
    const params = new URL(request.url).searchParams;
    const q = (params.get('q') || '').trim(); const page = Number(params.get('page') || 1);
    if (q.length>120 || q.includes('\0') || !Number.isSafeInteger(page) || page<1 || page>1000000) throw new InputError('Busca ou página inválida.');
    const restaurantId = params.get('restaurantId');
    if (restaurantId !== null) {
      const parsed = z.uuid().safeParse(restaurantId);
      if (!parsed.success) throw new InputError('Restaurante inválido.');
      const result = await platformRestaurantMembers(parsed.data, page);
      if (!result) throw new PlatformError('Restaurante não encontrado.', 404);
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(await platformOverview(q,page),{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return failure(error); }
}
export async function PATCH(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.',403);
  try {
    await requirePlatformAdmin();
    const result = await changePlatform(await readBody(request));
    return NextResponse.json({message:result && 'restaurantDeleted' in result ? 'Restaurante e seus dados excluídos definitivamente. As contas dos usuários foram preservadas.' : result?.deletionMode==='anonymized' ? 'Conta excluída. Os dados de identificação foram removidos e o histórico foi preservado.' : result?.deletionMode==='removed' ? 'Conta excluída definitivamente.' : 'Alteração salva com sucesso.',...result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return failure(error); }
}
