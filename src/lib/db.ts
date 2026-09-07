import { Sequelize } from 'sequelize';
import sqlite3 from 'sqlite3';

const globalForSequelize = global as unknown as { sequelize: Sequelize };

export const sequelize =
  globalForSequelize.sequelize ||
  new Sequelize({
    dialect: 'sqlite',
    dialectModule: sqlite3,
    storage: './database.sqlite',
    logging: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSequelize.sequelize = sequelize;
}