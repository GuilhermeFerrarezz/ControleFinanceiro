// Shared by form hints and server validation. Existing passwords remain valid
// for login; this minimum applies only when choosing a new password.
export const MIN_PASSWORD_LENGTH = 8;

export function passwordRequirements(password: string) {
  return {
    length: Array.from(password).length >= MIN_PASSWORD_LENGTH,
    uppercase: /\p{Lu}/u.test(password),
    symbol: /[\p{P}\p{S}]/u.test(password),
  };
}

export function newPasswordError(password: string) {
  const checks = passwordRequirements(password);
  if (!checks.length) return `Use uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!checks.uppercase) return 'Inclua pelo menos uma letra maiúscula na senha.';
  if (!checks.symbol) return 'Inclua pelo menos um símbolo na senha, como !, @ ou #.';
  return '';
}
