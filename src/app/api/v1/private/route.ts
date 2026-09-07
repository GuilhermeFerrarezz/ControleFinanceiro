import { NextResponse } from "next/server";
import { sequelize } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { Empresa } from '@/src/models/Empresa';
import { Usuario } from '@/src/models/Usuario';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';


export async function GET(request: Request) {
    const userId = request.headers.get('user-id');
    
  
    console.log("ID recuperado na API:", userId);

    return NextResponse.json({ userId: Number(userId) })


}