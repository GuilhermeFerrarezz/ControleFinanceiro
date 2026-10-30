import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../lib/db';
export class Membership extends Model {}
Membership.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  empresaId: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.ENUM('owner', 'employee'), allowNull: false },
}, { sequelize, tableName: 'restaurant_members', indexes: [{ unique: true, fields: ['userId', 'empresaId'] }] });
