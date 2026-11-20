export const TUTORIAL_EVENT = 'restaurant-tutorial-start';

export function tutorialSteps(owner: boolean) {
  return [
    { title: 'Conheça seu restaurante', href: '', text: 'Vamos percorrer as abas do sistema. Use Próxima para conhecer cada área ou Pular tutorial para começar a trabalhar. Confira sempre o restaurante ativo antes de registrar informações.' },
    { title: 'Visão geral', href: '/dashboard', text: 'Consulte os indicadores, gráficos e compras por produto. Escolha mês, ano ou datas personalizadas para analisar o período. Aqui também estão Novo gasto, importação CSV e exportações.' },
    { title: 'Lançamentos', href: '/dashboard/expenses', text: 'Registre compras e despesas em Novo gasto. Detalhe quantidade, unidade e valor dos produtos dentro da mesma compra. Filtre, edite, marque como pago ou exporte os gastos. Funcionários alteram os próprios lançamentos.' },
    { title: 'Faturamento', href: '/dashboard/revenue', text: owner ? 'Informe as vendas de cada dia, marmitex delivery, refeições no restaurante e pedidos. Você pode editar, excluir, importar e exportar os registros.' : 'Consulte as vendas e quantidades registradas pelo dono. O dono é responsável por salvar, importar e corrigir o faturamento.' },
    { title: 'Lucro', href: '/dashboard/profit', text: 'Compare faturamento e gastos, incluindo contas a pagar. Confira se todos os dias de vendas foram informados antes de interpretar o lucro ou prejuízo.' },
    { title: 'Planilha', href: '/dashboard/sheet', text: 'Consulte os gastos por dia e categoria. Clique nos valores para ver os lançamentos, organize as colunas e exporte o período em Excel.' },
    { title: 'Estoque', href: '/dashboard/inventory', text: 'Ative o controle dos produtos e defina unidade, mínimo, armazenamento e fornecedores. Receba compras pelo lançamento e registre consumo, perdas ou contagem física. O histórico explica cada mudança de saldo.' },
    { title: 'Cadastros', href: '/dashboard/catalog', text: 'Organize categorias, fornecedores, locais de armazenamento e produtos. Defina unidades e conteúdo das embalagens. Excluir um cadastro retira as sugestões para novos lançamentos e preserva o histórico.' },
    { title: 'Equipe', href: '/dashboard/team', text: owner ? 'Gere um convite pelo e-mail do funcionário, copie o link e envie para ele. Você também pode revogar convites e remover acessos. Cada pessoa usa sua própria conta.' : 'Confira seu vínculo com o restaurante. Peça ao dono para administrar convites e acessos da equipe.' },
    { title: 'Restaurante', href: '/dashboard/restaurant', text: owner ? 'Atualize nome e CNPJ do restaurante. A exclusão exige sua senha e remove permanentemente os dados daquela casa. Para sair da conta, use o menu com seu nome no cabeçalho.' : 'Confira os dados da casa. Alterações e exclusão ficam com o dono. Para sair da conta, use o menu com seu nome no cabeçalho.' },
    { title: 'Ajuda sempre à mão', href: '/dashboard/help', text: 'Busque uma dúvida ou escolha um assunto para abrir o passo a passo. Você pode iniciar este tutorial novamente pelo botão Rever tutorial. Confirme seu e-mail em até 7 dias para manter o acesso.' },
  ];
}
