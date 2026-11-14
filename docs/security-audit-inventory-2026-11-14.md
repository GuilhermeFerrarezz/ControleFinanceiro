# Inventário da auditoria — 14/11/2026

Inventário inicial de arquivos autorais, testes, documentação, configuração e ativos locais. Cada arquivo textual passou pela busca de padrões de source/sink; a revisão manual de fluxos se concentrou nas entradas, autorização, validação, persistência, geração de arquivos e execução de processos. Ativos binários foram inventariados por tamanho e SHA-256.

| Arquivo | Bytes | Área de verificação |
| --- | ---: | --- |
| `ControleFinanceiro.session.sql` | 0 | Configuração, dependências, documentação ou arquivo local |
| `docs/security-review-2026-11-11.md` | 8414 | Configuração, dependências, documentação ou arquivo local |
| `.env.example` | 469 | Configuração, dependências, documentação ou arquivo local |
| `.gitignore` | 704 | Configuração, dependências, documentação ou arquivo local |
| `.vscode/settings.json` | 431 | Configuração, dependências, documentação ou arquivo local |
| `AGENTS.md` | 679 | Configuração, dependências, documentação ou arquivo local |
| `README.md` | 10949 | Configuração, dependências, documentação ou arquivo local |
| `docs/architecture.md` | 14711 | Configuração, dependências, documentação ou arquivo local |
| `docs/financial-calculations.md` | 4520 | Configuração, dependências, documentação ou arquivo local |
| `docs/security-review-2026-11-01.md` | 3678 | Configuração, dependências, documentação ou arquivo local |
| `eslint.config.mjs` | 465 | Configuração, dependências, documentação ou arquivo local |
| `next.config.ts` | 841 | Configuração, dependências, documentação ou arquivo local |
| `package-lock.json` | 316688 | Configuração, dependências, documentação ou arquivo local |
| `package.json` | 1117 | Configuração, dependências, documentação ou arquivo local |
| `postcss.config.mjs` | 94 | Configuração, dependências, documentação ou arquivo local |
| `public/branding/saldo-da-casa.png` | 588452 | Ativo estático; não tratado como entrada executável |
| `public/file.svg` | 391 | Ativo estático; não tratado como entrada executável |
| `public/fonts/NotoSans-Bold.ttf` | 575740 | Ativo estático; não tratado como entrada executável |
| `public/fonts/NotoSans-Regular.ttf` | 569208 | Ativo estático; não tratado como entrada executável |
| `public/fonts/OFL.txt` | 4377 | Ativo estático; não tratado como entrada executável |
| `public/globe.svg` | 1035 | Ativo estático; não tratado como entrada executável |
| `public/next.svg` | 1375 | Ativo estático; não tratado como entrada executável |
| `public/vercel.svg` | 128 | Ativo estático; não tratado como entrada executável |
| `public/window.svg` | 385 | Ativo estático; não tratado como entrada executável |
| `schema.sql` | 12130 | Configuração, dependências, documentação ou arquivo local |
| `scripts/audit-financial-data.ts` | 8122 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/migrate-db.ts` | 598 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/seed-demo-data.ts` | 7547 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/seed-demo-history.ts` | 2094 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/seed-restaurant-demo.ts` | 1532 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/vary-demo-prices.ts` | 1632 | Execução local, argumentos, arquivos e limites de confiança |
| `scripts/verify-financial-roundtrip.ts` | 5515 | Execução local, argumentos, arquivos e limites de confiança |
| `src/app/(auth)/login/FormLogin.tsx` | 2309 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(auth)/login/page.tsx` | 540 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(auth)/register/FormRegister.tsx` | 3842 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(auth)/register/page.tsx` | 1136 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/RestaurantSwitcher.tsx` | 1189 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/TeamPanel.tsx` | 6632 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/catalog/CatalogPanel.tsx` | 8265 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/catalog/page.tsx` | 1220 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/dashboard.module.css` | 10593 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/expenses/page.tsx` | 326 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/help/page.tsx` | 1245 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/page.tsx` | 328 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/profit/page.tsx` | 3255 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/restaurant/RestaurantForm.tsx` | 3587 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/restaurant/page.tsx` | 1286 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/revenue/page.tsx` | 6868 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/sheet/page.tsx` | 9249 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/dashboard/team/page.tsx` | 2594 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/home/CompanyForm.tsx` | 1577 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/home/home.module.css` | 121 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/(system)/home/page.tsx` | 516 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/api/v1/auth/login/route.ts` | 2527 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/auth/logout/route.ts` | 616 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/auth/refresh/route.ts` | 551 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/auth/register/route.ts` | 2538 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/catalog/route.ts` | 5431 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/company/route.ts` | 4815 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/company/switch/route.ts` | 1298 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/expenses/[id]/route.ts` | 1662 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/expenses/import/route.ts` | 1793 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/expenses/report/route.ts` | 1356 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/expenses/route.ts` | 4558 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/expenses/sheet/route.ts` | 1790 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/invitations/[id]/route.ts` | 1246 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/invitations/accept/route.ts` | 1493 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/invitations/route.ts` | 1542 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/members/[id]/route.ts` | 1663 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/private/route.ts` | 436 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/api/v1/revenue/route.ts` | 5445 | Entrada HTTP, autenticação, tenant, validação e resposta |
| `src/app/favicon.ico` | 10120 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/globals.css` | 3183 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/invite/[token]/AcceptInvitation.tsx` | 1011 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/invite/[token]/page.tsx` | 2194 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/landing.module.css` | 13049 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/layout.tsx` | 621 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/app/page.tsx` | 7971 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/AuthShell.tsx` | 1903 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/Brand.tsx` | 440 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/CategoryPie.tsx` | 4391 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/DateRangeFields.tsx` | 1698 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/DeleteExpensePeriod.tsx` | 2991 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ExpenseCharts.tsx` | 1580 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ExpenseForm.tsx` | 13767 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ExpenseItemDetails.tsx` | 870 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ExpenseSheetTable.tsx` | 9148 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/FinanceComparisonChart.tsx` | 8755 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/FinanceNav.tsx` | 1624 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/FinancePage.tsx` | 1606 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/FinancialDashboard.tsx` | 20088 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/HelpCenter.tsx` | 6386 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/Icon.tsx` | 1430 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ImportExpenses.tsx` | 7774 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/IngredientAnalysis.tsx` | 5668 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/MerchantInput.tsx` | 4235 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/MoneyTrendChart.tsx` | 7028 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/MonthFilter.tsx` | 1015 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/PasswordInput.tsx` | 940 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/PeriodFilters.tsx` | 969 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ProductCharts.tsx` | 4479 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ProductInput.tsx` | 4377 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ProductPackagingFields.tsx` | 1975 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/ProductSummary.tsx` | 1480 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/RevenueEditor.tsx` | 11064 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/auth.module.css` | 6521 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/cabecalho/cabecalho.module.css` | 2652 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/cabecalho/page.tsx` | 2449 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/chart-pointer.ts` | 494 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/finance.module.css` | 35036 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/components/help.module.css` | 8446 | Renderização, URLs, formulários, armazenamento e contexto |
| `src/lib/api.ts` | 583 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/auth.ts` | 2438 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/browser-download.ts` | 296 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/catalog-shared.ts` | 1816 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/chart-scale.ts` | 1152 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/csv-encoding.ts` | 574 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/dashboard-pdf-details.ts` | 12889 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/dashboard-pdf.ts` | 12466 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/db.ts` | 596 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/demo-history.ts` | 5925 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/demo-prices.ts` | 824 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/dev-origins.ts` | 749 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-csv-archive.ts` | 3559 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-csv.ts` | 14733 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-items.ts` | 3121 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-product-catalog.ts` | 2209 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-shared.ts` | 8605 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-sheet-workbook.ts` | 3332 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expense-workbook.ts` | 7750 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/expenses.ts` | 18399 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/financial-math.ts` | 3584 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/help-content.ts` | 25800 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/ingredient-analysis.ts` | 5888 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/invitations.ts` | 3025 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/migrations.ts` | 536 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/postgres.ts` | 808 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/product-analysis.ts` | 1249 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/rate-limit.ts` | 863 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/request-origin.ts` | 1304 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/restaurant-demo.ts` | 15343 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/restaurants.ts` | 340 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/revenue-counts.ts` | 450 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/revenue-csv.ts` | 4283 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/revenue-series.ts` | 1306 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/revenue.ts` | 5648 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/lib/validation.ts` | 2008 | Fontes/sinks, transformação, limites, criptografia e lógica |
| `src/models/Catalog.ts` | 6715 | SQL, autorização transacional, joins e bloqueios |
| `src/models/Empresa.ts` | 1642 | SQL, autorização transacional, joins e bloqueios |
| `src/models/Expense.ts` | 18490 | SQL, autorização transacional, joins e bloqueios |
| `src/models/Invitation.ts` | 2936 | SQL, autorização transacional, joins e bloqueios |
| `src/models/Membership.ts` | 3043 | SQL, autorização transacional, joins e bloqueios |
| `src/models/RefreshToken.ts` | 1847 | SQL, autorização transacional, joins e bloqueios |
| `src/models/Usuario.ts` | 1200 | SQL, autorização transacional, joins e bloqueios |
| `src/proxy.ts` | 954 | Configuração, dependências, documentação ou arquivo local |
| `tests/auth.test.ts` | 29125 | Cenários de regressão, processos e isolamento de schema |
| `tests/chart-values.test.ts` | 3116 | Cenários de regressão, processos e isolamento de schema |
| `tests/dashboard-pdf.test.ts` | 3847 | Cenários de regressão, processos e isolamento de schema |
| `tests/demo-history.test.ts` | 2770 | Cenários de regressão, processos e isolamento de schema |
| `tests/dev-origins.test.ts` | 1032 | Cenários de regressão, processos e isolamento de schema |
| `tests/expense-csv-archive.test.ts` | 1774 | Cenários de regressão, processos e isolamento de schema |
| `tests/expense-csv.test.ts` | 5989 | Cenários de regressão, processos e isolamento de schema |
| `tests/expense-values.test.ts` | 5698 | Cenários de regressão, processos e isolamento de schema |
| `tests/expense-workbook.test.ts` | 3710 | Cenários de regressão, processos e isolamento de schema |
| `tests/expenses.test.ts` | 80104 | Cenários de regressão, processos e isolamento de schema |
| `tests/financial-math.test.ts` | 6882 | Cenários de regressão, processos e isolamento de schema |
| `tests/ingredient-analysis.test.ts` | 3056 | Cenários de regressão, processos e isolamento de schema |
| `tests/pdf-fixture.ts` | 847 | Cenários de regressão, processos e isolamento de schema |
| `tests/postgres-fixture.ts` | 1603 | Cenários de regressão, processos e isolamento de schema |
| `tests/product-analysis.test.ts` | 1544 | Cenários de regressão, processos e isolamento de schema |
| `tests/product-catalog.test.ts` | 2417 | Cenários de regressão, processos e isolamento de schema |
| `tests/request-origin.test.ts` | 1862 | Cenários de regressão, processos e isolamento de schema |
| `tests/restaurant-demo.test.ts` | 7519 | Cenários de regressão, processos e isolamento de schema |
| `tests/revenue-csv.test.ts` | 2451 | Cenários de regressão, processos e isolamento de schema |
| `tests/revenue-series.test.ts` | 2093 | Cenários de regressão, processos e isolamento de schema |
| `tsconfig.json` | 666 | Configuração, dependências, documentação ou arquivo local |

Total inicial: 176 arquivos. Os arquivos de correção e testes novos estão listados no relatório principal. As cópias anteriores do relatório de 11/11 e do arquivo SQL local não foram modificadas.
