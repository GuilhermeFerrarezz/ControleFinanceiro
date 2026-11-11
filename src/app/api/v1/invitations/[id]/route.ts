import { NextResponse } from 'next/server';
import { matchesRestaurantContext, currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { cancelInvitation, InvitationError } from '@/src/lib/invitations';
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (user.role !== 'owner' || !user.empresaId) return jsonError('Apenas o dono pode revogar convites.', 403);
  if (!matchesRestaurantContext(request, user.empresaId)) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return jsonError('Convite não encontrado.', 404);
  try {
    await cancelInvitation(user.id, user.empresaId, id);
    return NextResponse.json({ message: 'Convite revogado.' });
  } catch (error) { return jsonError(error instanceof InvitationError ? error.message : 'Não foi possível revogar o convite.', error instanceof InvitationError ? error.status : 500); }
}
