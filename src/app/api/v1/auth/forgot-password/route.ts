import { requestEmailRoute } from '@/src/lib/auth-token-routes';
export async function POST(request: Request) { return requestEmailRoute(request, 'password_reset'); }
