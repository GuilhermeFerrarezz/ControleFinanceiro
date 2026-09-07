import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../lib/db';
import { Empresa } from './Empresa';

export class Usuario extends Model {}

Usuario.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    senha: {
      type: DataTypes.STRING,
      allowNull: false, 
    },
    papel: {
      type: DataTypes.STRING,
      defaultValue: 'colaborador',
    },
    empresaId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Empresa,
        key: 'id',
      },
    },
  },
  {
    sequelize,
    tableName: 'usuarios',
  }
);


Empresa.hasMany(Usuario, { foreignKey: 'empresaId', as: 'usuarios' });
Usuario.belongsTo(Empresa, { foreignKey: 'empresaId', as: 'empresa' });
