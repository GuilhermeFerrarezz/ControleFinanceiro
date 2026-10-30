import axios from 'axios';
export const api = axios.create({ baseURL: '/api/v1', timeout: 10000, withCredentials: true });
export function clearLegacyAuth() {
  try { for (const key of ['accessToken', 'token', 'user', 'userId']) localStorage.removeItem(key); }
  catch { /* Storage can be unavailable in private browsing; sessions use cookies. */ }
}
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return error.response?.data?.erro || 'Não foi possível comunicar com o servidor.';
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
