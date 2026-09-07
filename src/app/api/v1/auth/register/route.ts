import { NextResponse } from "next/server";
import { sequelize } from '@/src/lib/db';
import { Empresa } from '@/src/models/Empresa';
import { Usuario } from '@/src/models/Usuario';
import bcrypt from 'bcryptjs';
interface DadosRegistro {
            nomeUsuario: string;
            email: string;
            senha: string;
}

export async function POST(request: Request) {

    try {
        
        const body = (await request.json()) as DadosRegistro
        const {nomeUsuario, email, senha } = body;

        if (!nomeUsuario || !email || !senha) {
           
            return NextResponse.json(
                { erro: 'Preencha todos os campos obrigatórios.' },
                { status: 400 }
            );
        }
       

        try {

            const senhaHash = await bcrypt.hash(senha, 10)

            await Usuario.create(
                {
                    nome: nomeUsuario,
                    email: email,
                    senha: senhaHash,
                    papel: 'admin',
                },
          
            );
            return NextResponse.json(
            
                {
                    message: 'Conta criada com sucesso!',
                    
                },
                {
                    status: 201
                }
            )
            
        } catch (dbError) {
            throw dbError; 
    }

    } catch (error) {
        console.error('Erro no registro:', error);
    return NextResponse.json(
      { erro: 'Erro interno no servidor ao criar conta.' },
      { status: 500 }
    )}
}