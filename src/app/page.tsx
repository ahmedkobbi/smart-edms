/**
 * Smart EDMS — Landing page (/)
 *
 * Redirects to /dashboard if authenticated, /login otherwise.
 * The actual marketing surface is /login (which doubles as the entry).
 */

import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/auth-options';

export default async function Home() {
  const session = await getServerSession();
  if (session?.user) {
    redirect('/dashboard');
  }
  redirect('/login');
}
