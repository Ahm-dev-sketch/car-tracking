import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  const role = session.user.role;
  if (role === 'ADMIN') {
    redirect('/admin');
  } else if (role === 'DRIVER') {
    redirect('/driver');
  } else {
    redirect('/user');
  }
}
