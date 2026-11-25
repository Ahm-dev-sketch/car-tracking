import LoginClient from './LoginClient';
import { isDemoModeEnabled } from '@/lib/demo-auth';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const showDemoAccounts = isDemoModeEnabled();
  return <LoginClient showDemoAccounts={showDemoAccounts} />;
}
