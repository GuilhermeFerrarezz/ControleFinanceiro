import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { acceptInvitation, findValidInvitation, insertInvitation, lockInvitationCreation, revokePendingInvitations } from '../models/Invitation';
import { createMembership, findMembership } from '../models/Membership';
import { findUsuarioByEmail } from '../models/Usuario';
import { db } from './db';
import { inTransaction, type Queryable } from './postgres';

export class InvitationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function validInvitation(token: unknown, client: Queryable = db, lock = false) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const invitation = await findValidInvitation(digest(token), client, lock);
  return invitation ? { invitation, empresa: { id: invitation.empresaId, nome: invitation.empresaNome } } : null;
}
export async function joinInvitation(token: unknown, userId: string, email: string, client: PoolClient) {
  const valid = await validInvitation(token, client, true);
  if (!valid) throw new InvitationError('Este convite expirou ou já foi utilizado.', 410);
  const { invitation } = valid;
  if (invitation.email !== email) throw new InvitationError('Entre com o e-mail que recebeu o convite.', 403);
  if (!await acceptInvitation(invitation.id, client)) throw new InvitationError('Este convite não está mais disponível.', 410);
  await createMembership(userId, invitation.empresaId, 'employee', client);
  return invitation.empresaId;
}
export async function createInvitation(ownerId: string, empresaId: string, email: string) {
  const token = randomBytes(32).toString('base64url');
  await inTransaction(async client => {
    await lockInvitationCreation(empresaId, email, client);
    const owner = await findMembership(ownerId, empresaId, client);
    if (owner?.role !== 'owner') throw new InvitationError('Apenas o dono pode convidar funcionários.', 403);
    const existingUser = await findUsuarioByEmail(email, client);
    if (existingUser && await findMembership(existingUser.id, empresaId, client)) throw new InvitationError('Esta pessoa já faz parte do restaurante.', 409);
    await revokePendingInvitations(empresaId, email, client);
    await insertInvitation(empresaId, ownerId, email, digest(token), new Date(Date.now() + 7 * 86400_000), client);
  });
  return token;
}
