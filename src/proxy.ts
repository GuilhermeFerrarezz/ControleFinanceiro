import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, findSession, SESSION_COOKIE } from './lib/auth';
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/') return NextResponse.next();
  const user = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
  const publicPage = ['/login', '/register'].includes(request.nextUrl.pathname);
  if (user && publicPage) {
    const next = request.nextUrl.searchParams.get('next');
    return NextResponse.redirect(new URL(next && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : user.empresaId ? '/dashboard' : '/home', request.url));
  }
  if (!user && !publicPage) return clearSession(NextResponse.redirect(new URL('/login', request.url)));
  if (!user) return clearSession(NextResponse.next());
  return NextResponse.next();
}
export const config = { matcher: ['/', '/login', '/register', '/home/:path*', '/dashboard/:path*'] };
