import { NextResponse } from "next/server";
import { sequelize } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { Empresa } from '@/src/models/Empresa';
import { Usuario } from '@/src/models/Usuario';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';


export async function POST(request: Request) {
    try {
        const { email, senha } = await request.json();
        if (!email || !senha) {
           
            return NextResponse.json(
                { erro: 'Preencha todos os campos obrigatórios.' },
                { status: 400 }
            );
        }




        const usuario = await Usuario.findOne({ where: { email } })
        const user = usuario?.dataValues
        console.log(user)
        console.log(user.senha)
        if (!usuario || !(await bcrypt.compare(String(senha), user.senha))) {
            return NextResponse.json({ erro: 'Credenciais inválidas' }, { status: 401 });
        }
        
        const secretKey = new TextEncoder().encode(process.env.JWT_SECRET!);
        const refreshSecretKey = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);
    

        const accessToken = await new jose.SignJWT({ userId: user.id })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('15m')
            .sign(secretKey);

    
        const refreshToken = await new jose.SignJWT({ userId: user.id })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('7d')
            .sign(refreshSecretKey);
        console.log("Token gerado:", accessToken);
        
        console.log("Token gerado:", refreshToken);

    
        const cookieStore = await cookies();
        cookieStore.set('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        })
    
        return NextResponse.json({ accessToken });



    } catch (error) {
        console.log(error)
        return NextResponse.json({ erro: 'Erro interno no servidor.', }, { status: 500 });
        
    }
}