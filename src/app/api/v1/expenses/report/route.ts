import { currentUser,jsonError } from '@/src/lib/auth';
import { expenseDashboard,expenseFilters,ExpenseError } from '@/src/lib/expenses';
import { InputError } from '@/src/lib/validation';
import { dashboardPdf } from '@/src/lib/dashboard-pdf';
export const runtime='nodejs';
export async function GET(request:Request) {
  const user=await currentUser();if(!user)return jsonError('Entre na sua conta para continuar.',401);
  if(!user.empresaId)return jsonError('Selecione um restaurante.',403);
  try {
    const filters=expenseFilters(new URL(request.url).searchParams);
    const data=await expenseDashboard({...user,empresaId:user.empresaId},filters);
    const bytes=await dashboardPdf(data,user.empresaNome||'Restaurante',user.nome);
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="resumo-${filters.start}-${filters.end}.pdf"`,'Cache-Control':'no-store'}});
  }catch(error){return jsonError(error instanceof InputError||error instanceof ExpenseError?error.message:'Não foi possível gerar o PDF. Tente novamente.',error instanceof InputError?400:error instanceof ExpenseError?error.status:500);}
}
