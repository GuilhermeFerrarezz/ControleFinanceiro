import 'server-only';
import bcrypt from 'bcryptjs';
import { inTransaction } from './postgres';
import { seedRestaurantDemo } from './restaurant-demo';
import { createEmpresa } from '../models/Empresa';
import { createUsuario, findUsuarioByEmail } from '../models/Usuario';
import { createMembership } from '../models/Membership';
import { emailValue, passwordValue, InputError } from './validation';
import { dateValue } from './expenses';
import { daysBetween } from './expense-shared';
import { isPlatformOwner } from './platform-owner';

// Operator-only provisioning. This function has no public HTTP endpoint.
export async function createDemoAccount(email: string, password: string, start: string, end: string) {
  email = emailValue(email);
  passwordValue(password, true);
  dateValue(start); dateValue(end);
  if (start > end || daysBetween(start, end) > 100) throw new InputError('A demonstração permite até 100 dias.');
  const hash = await bcrypt.hash(password, 10);
  return inTransaction(async client => {
    if (await findUsuarioByEmail(email, client)) throw new InputError('O e-mail de demonstração já existe. Nenhum dado foi alterado.');
    const restaurant = await createEmpresa('Restaurante Demonstração — DADOS FICTÍCIOS', client);
    const user = await createUsuario({ nome: 'Visitante Demonstração', email, senha: hash, papel: 'admin', empresaId: restaurant.id }, client);
    if (isPlatformOwner(user.id)) throw new InputError('Conta de demonstração não pode administrar a plataforma.');
    await createMembership(user.id, restaurant.id, 'owner', client);
    // A deliberately fictitious identity provisioned by the server operator:
    // no emails are sent and no verification deadline interrupts the demo.
    await client.query('UPDATE usuarios SET email_verified_at=clock_timestamp() WHERE id=$1', [user.id]);
    const seeded = await seedRestaurantDemo({ id: user.id, empresaId: restaurant.id }, start, end, client);
    return { userId: user.id, restaurantId: restaurant.id, ...seeded };
  });
}
