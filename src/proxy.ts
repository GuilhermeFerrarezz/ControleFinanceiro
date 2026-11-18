import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, findSession, SESSION_COOKIE } from './lib/auth';

export async function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === 'development';
  const nonce = randomBytes(18).toString('base64');
  const policy = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    // Charts and progress indicators set dynamic dimensions via React style attributes.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'",
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', policy);
  headers.delete('content-security-policy-report-only');
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);

  const path = request.nextUrl.pathname;
  const authPage = path === '/login' || path === '/register';
  if (!authPage && !/^\/(home|dashboard)(\/|$)/.test(path)) return response;
  const user = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (user && authPage) {
    const next = request.nextUrl.searchParams.get('next');
    return NextResponse.redirect(new URL(next && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : user.empresaId ? '/dashboard' : '/home', request.url));
  }
  if (!user && !authPage) return clearSession(NextResponse.redirect(new URL('/login', request.url)));
  return user ? response : clearSession(response);
}

export const config = {
  matcher: ['/((?!api/|_next/|branding/|fonts/|favicon\\.ico$|[^/]+\\.svg$).*)'],
};
