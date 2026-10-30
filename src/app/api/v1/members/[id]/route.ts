import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { inTransaction } from '@/src/lib/postgres';
import { removeEmployeeMembership } from '@/src/models/Membership';
import { uuidValue } from '@/src/lib/expenses';
import { InputError } from '@/src/lib/validation';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.',403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.',401);
  if (user.role !== 'owner' || !user.empresaId) return jsonError('Apenas o dono pode remover funcionários.',403);
  try {
    const id = uuidValue((await params).id);
    const result = await inTransaction(client => removeEmployeeMembership(id,user.empresaId!,user.id,client));
    if (result === 'forbidden') return jsonError('Apenas o dono pode remover funcionários.',403);
    if (result === 'missing') return jsonError('Funcionário não encontrado.',404);
    if (result === 'owner') return jsonError('Não é possível remover o dono do restaurante.',400);
    return NextResponse.json({ message:'Funcionário removido. Os lançamentos e a autoria foram preservados.' });
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível remover o funcionário.',error instanceof InputError ? 400 : 500);
  }
}
