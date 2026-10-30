import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../lib/db';
export class Expense extends Model {}
Expense.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  empresaId: { type: DataTypes.UUID, allowNull: false },
  createdBy: { type: DataTypes.UUID, allowNull: false },
  updatedBy: { type: DataTypes.UUID, allowNull: false },
  requestId: { type: DataTypes.UUID, allowNull: false },
  description: { type: DataTypes.STRING(120), allowNull: false },
  amountCents: { type: DataTypes.BIGINT, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  merchant: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'paid' },
  paymentMethod: { type: DataTypes.STRING, allowNull: false, defaultValue: 'not_informed' },
  notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, { sequelize, tableName: 'expenses', paranoid: true });
export class ExpenseAudit extends Model {}
ExpenseAudit.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  expenseId: { type: DataTypes.UUID, allowNull: false },
  empresaId: { type: DataTypes.UUID, allowNull: false },
  actorId: { type: DataTypes.UUID, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false },
  before: { type: DataTypes.TEXT, allowNull: true },
  after: { type: DataTypes.TEXT, allowNull: true },
}, { sequelize, tableName: 'expense_audit', updatedAt: false });
