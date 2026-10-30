import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../lib/db';
export class Invitation extends Model {}
Invitation.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  empresaId: { type: DataTypes.UUID, allowNull: false },
  invitedBy: { type: DataTypes.UUID, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  acceptedAt: { type: DataTypes.DATE, allowNull: true },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
}, { sequelize, tableName: 'restaurant_invitations' });
