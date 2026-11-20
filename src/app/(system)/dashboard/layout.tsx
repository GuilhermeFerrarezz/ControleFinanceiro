import type { ReactNode } from 'react';
import { currentUser } from '@/src/lib/auth';
import { db } from '@/src/lib/db';
import GuidedTour from '@/src/components/GuidedTour';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user?.empresaId) return children;
  const { rows } = await db.query<{ completed: boolean }>(
    'SELECT (tutorial_completed_at IS NOT NULL) AS completed FROM usuarios WHERE id=$1', [user.id]);
  return <>{children}<GuidedTour key={user.id + user.empresaId} completed={rows[0]?.completed === true} owner={user.role === 'owner'} /></>;
}
