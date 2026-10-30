import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, findSession, SESSION_COOKIE } from './lib/auth';
export async function proxy(request: NextRequest) {
  const user = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
  const publicPage = ['/login', '/register'].includes(request.nextUrl.pathname);
  if (user && publicPage) return NextResponse.redirect(new URL(user.empresaId ? '/dashboard' : '/home', request.url));
  if (!user && !publicPage) return clearSession(NextResponse.redirect(new URL('/login', request.url)));
  if (!user) return clearSession(NextResponse.next());
  return NextResponse.next();
}
export const config = { matcher: ['/', '/login', '/register', '/home/:path*', '/dashboard/:path*'] };
