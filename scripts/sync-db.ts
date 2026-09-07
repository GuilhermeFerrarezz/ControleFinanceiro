import { sequelize } from '../src/lib/db';
import '../src/models/Empresa';
import '../src/models/Usuario';

async function syncDatabase() {
  try {
    console.log('Conectando e sincronizando banco de dados...');

    await sequelize.sync({ alter: true });

    console.log(' Banco de dados sincronizado com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha ao sincronizar o banco:', error);
    process.exit(1);
  }
}

syncDatabase();