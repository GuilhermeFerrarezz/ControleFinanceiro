import { NextResponse } from "next/server";
import { sequelize } from '@/src/lib/db';
import { cookies } from 'next/headers';

import { RefreshToken } from '@/src/models/RefreshToken';

export async function POST(req: Request) {
    try {
        const cookieStore = await cookies()
        const refreshToken = cookieStore.get('refreshToken')?.value;

        if (refreshToken) {
            await RefreshToken.destroy({ where: { token: refreshToken } });
        }
        cookieStore.delete('refreshToken');



        return NextResponse.json(
            { message: 'Logout realizado' },
            { status: 200 }
        );

    } catch (error) {
        console.error("Erro no logout ", error);
        return NextResponse.json(
            { erro: 'Erro interno no servidor ao realizar logout' },
            { status: 500 }
        )
    }



}


