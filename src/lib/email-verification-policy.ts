import 'server-only';

export const EMAIL_VERIFICATION_GRACE_DAYS = 7;
// Only use with the internally defined usuarios alias `u`. Database time keeps
// the deadline consistent across instances and existing browser sessions.
export const EMAIL_ACCESS_SQL = `(u.email_verified_at IS NOT NULL OR u.created_at > clock_timestamp() - interval '${EMAIL_VERIFICATION_GRACE_DAYS * 24} hours')`;
