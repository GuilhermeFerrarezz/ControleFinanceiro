import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const oldRefreshToken = cookieStore.get('refreshToken')?.value;

    if (!oldRefreshToken) {
      return NextResponse.json({ erro: 'Refresh token não encontrado' }, { status: 401 });
    }


    const refreshSecretKey = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

    const { payload } = await jose.jwtVerify(oldRefreshToken, refreshSecretKey);
    const userId = payload.userId as number;

    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET!);

    const newAccessToken = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(secretKey);

   
    const newRefreshToken = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(refreshSecretKey);

    cookieStore.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });
    return NextResponse.json({ accessToken: newAccessToken });

  } catch (error) {
    return NextResponse.json({ erro: 'Sessão expirada. Faça login novamente.' }, { status: 401 });
  }
}