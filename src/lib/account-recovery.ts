import bcrypt from 'bcryptjs';
import { authTokenExists, consumeAuthToken, issueAuthToken, validAuthToken, type AuthTokenType } from '../models/AuthToken';
import { findUsuarioByEmail } from '../models/Usuario';
import { inTransaction } from './postgres';
import { sendAuthEmail } from './auth-email';
import { InputError } from './validation';
import { withPasswordBudget } from './security-limits';
import { withAuthEmailBudget } from './auth-email-limits';

export async function requestAuthEmail(email: string, type: AuthTokenType, request: Request) {
  if (!await findUsuarioByEmail(email)) return;
  return withAuthEmailBudget(async () => {
    const issued = await inTransaction(async client => {
      const user = await findUsuarioByEmail(email, client);
      if (!user) return null;
      await client.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE', [user.id]);
      if (type === 'email_verification') {
        const result = await client.query('SELECT id FROM usuarios WHERE id=$1 AND email_verified_at IS NULL', [user.id]);
        if (!result.rowCount) return null;
      }
      return { token: await issueAuthToken(user.id, type, client), email: user.email };
    });
    if (issued) await sendAuthEmail(issued.email, type, issued.token, request);
  });
}

export async function completeAuthToken(token: unknown, type: AuthTokenType, password?: string) {
  if (!validAuthToken(token)) throw new InputError('Link inválido ou expirado. Solicite um novo link.');
  // Reject bogus/expired tokens before spending bcrypt CPU. Consumption still
  // checks expiry and one-time use again inside the write transaction.
  if (!await authTokenExists(token, type)) throw new InputError('Link inválido ou expirado. Solicite um novo link.');
  const hash = type === 'password_reset' && password ? await withPasswordBudget(() => bcrypt.hash(password, 10)) : null;
  if (type === 'password_reset' && !hash) throw new InputError('Informe sua nova senha.');
  await inTransaction(async client => {
    const userId = await consumeAuthToken(token, type, client);
    if (!userId) throw new InputError('Link inválido ou expirado. Solicite um novo link.');
    if (type === 'email_verification') {
      await client.query('UPDATE usuarios SET email_verified_at=COALESCE(email_verified_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1', [userId]);
    } else {
      await client.query('UPDATE usuarios SET senha=$1,updated_at=clock_timestamp() WHERE id=$2', [hash, userId]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id=$1', [userId]);
    }
  });
}
