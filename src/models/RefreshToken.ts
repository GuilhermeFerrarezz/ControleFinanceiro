import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../lib/db';
import { Usuario } from './Usuario';

export class RefreshToken extends Model { }


RefreshToken.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        token: {
            type: DataTypes.TEXT, 
            allowNull: false,
            unique: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: Usuario,
                key: 'id',
            },
        },


        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        }
},
        {
        sequelize,
        tableName: 'refresh-tokens'
    }
)
Usuario.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(Usuario, { foreignKey: 'userId', as: 'usuario' });
