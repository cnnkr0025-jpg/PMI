import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get('session')?.value);
  redirect(hasSession ? '/chat' : '/guide');
}
