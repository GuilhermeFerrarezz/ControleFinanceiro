import { NextResponse } from 'next/server';
import { currentUser,jsonError,trustedOrigin } from '@/src/lib/auth';
import { InputError,readBody } from '@/src/lib/validation';
import { csvTemplate,importExpenseCsv,previewExpenseCsv } from '@/src/lib/expense-csv';
export const runtime='nodejs';
export async function GET() {
  const user=await currentUser();if(!user)return jsonError('Entre na sua conta para continuar.',401);
  if(!user.empresaId)return jsonError('Selecione um restaurante.',403);
  return new Response(csvTemplate(),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="modelo-lancamentos.csv"','Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
  if(!trustedOrigin(request))return jsonError('Origem não permitida.',403);
  const user=await currentUser();if(!user)return jsonError('Entre na sua conta para continuar.',401);
  if(!user.empresaId)return jsonError('Selecione um restaurante.',403);
  try {
    const {csv,mode}=await readBody(request,4*1024*1024);
    if(mode!=='preview'&&mode!=='import')throw new InputError('Escolha visualizar ou importar o CSV.');
    const actor={...user,empresaId:user.empresaId};
    return NextResponse.json(mode==='preview'?await previewExpenseCsv(actor,csv):await importExpenseCsv(actor,csv),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return jsonError(error instanceof InputError?error.message:'Não foi possível importar o CSV. Nenhum novo lançamento foi salvo.',error instanceof InputError?400:500);}
}
