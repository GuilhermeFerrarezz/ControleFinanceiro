import 'server-only';
import type { Queryable } from './postgres';
import { InputError } from './validation';

export type Reauthentication = { userId: string; sessionHash: string; passwordHash: string };
export class ReauthenticationError extends InputError {}

// Only pass the password snapshot obtained after bcrypt, never client fields.
// Keep the identity/session locks until the destructive transaction commits.
export async function requireCurrentCredentials(proof: Reauthentication, client: Queryable) {
  const user = (await client.query<{ senha: string }>('SELECT senha FROM usuarios WHERE id=$1 AND ativo AND deleted_at IS NULL FOR SHARE', [proof.userId])).rows[0];
  if (!user || user.senha !== proof.passwordHash) throw new ReauthenticationError('Credenciais alteradas. Entre novamente para continuar.');
  const session = await client.query('SELECT id FROM refresh_tokens WHERE user_id=$1 AND token=$2 AND expires_at>clock_timestamp() FOR SHARE', [proof.userId, proof.sessionHash]);
  if (!session.rowCount) throw new ReauthenticationError('Sessão inválida ou expirada. Entre novamente.');
}
