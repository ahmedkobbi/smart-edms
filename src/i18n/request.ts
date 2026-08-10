import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isValidLocale } from './config';

export default getRequestConfig(async ({ locale }) => {
  const validLocale = isValidLocale(locale as string) ? locale : defaultLocale;

  return {
    messages: (await import(`../../messages/${validLocale}.json`)).default,
  };
});
