import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = path.startsWith('/api/v1/private');

  if (isProtectedRoute) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return NextResponse.json(
        { erro: 'Acesso negado. Token não fornecido.' },
        { status: 401 }
      );
    }

    try {
      const secretKey = new TextEncoder().encode(process.env.JWT_SECRET!);
      const { payload } = await jose.jwtVerify(token, secretKey);

    
      const requestHeaders = new Headers(request.headers);
      
 
      requestHeaders.set('user-id', String(payload.userId));

    
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      return NextResponse.json({ erro: 'Sessão inválida ou expirada.' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/v1/:path*',
};