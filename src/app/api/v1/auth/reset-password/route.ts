import { completeTokenRoute } from '@/src/lib/auth-token-routes';
export async function POST(request: Request) { return completeTokenRoute(request, 'password_reset'); }
