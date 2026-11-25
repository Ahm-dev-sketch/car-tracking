import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, resolveLocale, type Locale } from './types';

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}
