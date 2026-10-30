import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { Invitation } from '@/src/models/Invitation';
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (user.role !== 'owner' || !user.empresaId) return jsonError('Apenas o dono pode revogar convites.', 403);
  const { id } = await params;
  const [updated] = await Invitation.update({ revokedAt: new Date() }, { where: { id, empresaId: user.empresaId, acceptedAt: null, revokedAt: null } });
  if (!updated) return jsonError('Convite não encontrado.', 404);
  return NextResponse.json({ message: 'Convite revogado.' });
}
