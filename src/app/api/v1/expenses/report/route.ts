import { matchesRestaurantContext, currentUser,jsonError } from '@/src/lib/auth';
import { expenseDashboard,expenseFilters,ExpenseError } from '@/src/lib/expenses';
import { InputError } from '@/src/lib/validation';
import { dashboardPdf } from '@/src/lib/dashboard-pdf';
import { SecurityLimitError, withExportBudget } from '@/src/lib/security-limits';
export const runtime='nodejs';
export async function GET(request:Request) {
  const user=await currentUser();if(!user)return jsonError('Entre na sua conta para continuar.',401);
  if(!user.empresaId)return jsonError('Selecione um restaurante.',403);
  if(!matchesRestaurantContext(request,user.empresaId))return jsonError('O restaurante ativo mudou. Atualize a página.',409);
  try {
    const empresaId = user.empresaId;
    return await withExportBudget(user.id, async () => {
    const filters=expenseFilters(new URL(request.url).searchParams);
    const data=await expenseDashboard({...user,empresaId},{...filters,page:1});
    const bytes=await dashboardPdf(data,user.empresaNome||'Restaurante',user.nome);
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="resumo-${filters.start}-${filters.end}.pdf"`,'Cache-Control':'no-store'}});
    });
  }catch(error){if(error instanceof SecurityLimitError)return jsonError(error.message,429);return jsonError(error instanceof InputError||error instanceof ExpenseError?error.message:'Não foi possível gerar o PDF. Tente novamente.',error instanceof InputError?400:error instanceof ExpenseError?error.status:500);}
}
