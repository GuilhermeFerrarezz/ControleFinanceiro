import { createHash, randomBytes } from 'node:crypto';
import { Op, Transaction } from 'sequelize';
import { Invitation } from '../models/Invitation';
import { Membership } from '../models/Membership';
import { Empresa } from '../models/Empresa';
import { Usuario } from '../models/Usuario';
import { sequelize } from './db';

export class InvitationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function validInvitation(token: unknown, transaction?: Transaction) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const invitation = await Invitation.findOne({ where: { tokenHash: digest(token), acceptedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction });
  if (!invitation) return null;
  const empresa = await Empresa.findByPk(invitation.get('empresaId') as string, { transaction });
  if (!empresa?.ativo) return null;
  return { invitation, empresa };
}

export async function joinInvitation(token: unknown, userId: string, email: string, transaction: Transaction) {
  const valid = await validInvitation(token, transaction);
  if (!valid) throw new InvitationError('Este convite expirou ou já foi utilizado.', 410);
  const { invitation } = valid;
  if (invitation.get('email') !== email) throw new InvitationError('Entre com o e-mail que recebeu o convite.', 403);
  const empresaId = invitation.get('empresaId') as string;
  const [changed] = await Invitation.update({ acceptedAt: new Date() }, { where: { id: invitation.get('id'), acceptedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction });
  if (!changed) throw new InvitationError('Este convite não está mais disponível.', 410);
  const existing = await Membership.findOne({ where: { userId, empresaId }, transaction });
  // Existing owners never lose their role when accepting a stale invitation.
  if (!existing) await Membership.create({ userId, empresaId, role: 'employee' }, { transaction });
  return empresaId;
}

export async function createInvitation(ownerId: string, empresaId: string, email: string) {
  const token = randomBytes(32).toString('base64url');
  await sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const owner = await Membership.findOne({ where: { userId: ownerId, empresaId, role: 'owner' }, transaction });
    if (!owner) throw new InvitationError('Apenas o dono pode convidar funcionários.', 403);
    const existingUser = await Usuario.findOne({ where: { email }, transaction });
    if (existingUser && await Membership.findOne({ where: { userId: existingUser.get('id'), empresaId }, transaction })) throw new InvitationError('Esta pessoa já faz parte do restaurante.', 409);
    await Invitation.update({ revokedAt: new Date() }, { where: { empresaId, email, acceptedAt: null, revokedAt: null }, transaction });
    await Invitation.create({ empresaId, invitedBy: ownerId, email, tokenHash: digest(token), expiresAt: new Date(Date.now() + 7 * 86400_000) }, { transaction });
  });
  return token;
}
