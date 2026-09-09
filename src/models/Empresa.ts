import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../lib/db'
import { UUID } from 'crypto';

export class Empresa extends Model {
    public id!: UUID;
    public nome!: string;
    public cnpj!: string;
    public ativo!: boolean;
}
Empresa.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        nome: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        cnpj: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        ativo: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        sequelize,
        tableName: 'empresas',
    }
);