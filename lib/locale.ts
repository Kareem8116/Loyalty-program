import arMessages from '../messages/ar.json';
import enMessages from '../messages/en.json';

export type Locale = 'ar' | 'en';

export const messages: Record<Locale, any> = {
  ar: arMessages,
  en: enMessages,
};

export function getTranslation(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const currentMessages = messages[locale] || messages.ar;
  const parts = key.split('.');
  let value: any = currentMessages;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      // Fallback to Arabic if missing in target locale
      let fallback: any = messages.ar;
      for (const p of parts) {
        if (fallback && typeof fallback === 'object' && p in fallback) {
          fallback = fallback[p];
        } else {
          fallback = key;
          break;
        }
      }
      value = fallback;
      break;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  if (params) {
    return Object.entries(params).reduce((str, [paramKey, paramVal]) => {
      return str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
    }, value);
  }

  return value;
}
