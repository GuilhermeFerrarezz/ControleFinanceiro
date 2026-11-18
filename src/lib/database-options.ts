import type { PoolConfig } from 'pg';

export function databaseOptions(connectionString: string | undefined): PoolConfig {
  let safeConnection = connectionString;
  if (connectionString) {
    let url: URL;
    try { url = new URL(connectionString); }
    catch { throw new Error('DATABASE_URL inválida.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL deve usar PostgreSQL.');
    // Neon uses public CA certificates. Enforce both encryption and hostname
    // validation, including when a copied URL requests a weaker SSL mode.
    if (url.hostname.endsWith('.neon.tech') || url.hostname.endsWith('.neon.build')) {
      url.searchParams.delete('ssl');
      url.searchParams.delete('uselibpqcompat');
      url.searchParams.set('sslmode', 'verify-full');
      safeConnection = url.toString();
    }
  }
  return { connectionString: safeConnection, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true, enableChannelBinding: true };
}
