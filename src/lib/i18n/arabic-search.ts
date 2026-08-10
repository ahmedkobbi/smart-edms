/**
 * Smart EDMS — Arabic text normalization for search
 *
 * Handles: tashkeel removal, hamza normalization, alef maksura,
 * taa marbuta, tatweel removal, Arabic-Indic digits, stopwords.
 */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const TATWEEL = /\u0640/g;

const ARABIC_DIGITS: Record<string, string> = {
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
  '\u06F0': '0', '\u06F1': '1', '\u06F2': '2', '\u06F3': '3', '\u06F4': '4',
  '\u06F5': '5', '\u06F6': '6', '\u06F7': '7', '\u06F8': '8', '\u06F9': '9',
};

const ARABIC_STOPWORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'الذين', 'ما', 'هل', 'لا', 'لم', 'لن', 'قد', 'كان',
  'كل', 'بعض', 'غير', 'بين', 'أو', 'ثم', 'إذا', 'حتى', 'عند', 'لكن',
  'هو', 'هي', 'هم', 'نحن', 'أنا', 'إن', 'أن', 'كي', 'بعد', 'قبل',
  'ال', 'و', 'ف', 'ب', 'ل',
]);

export function normalizeArabicText(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(TASHKEEL, '');
  result = result.replace(TATWEEL, '');
  result = result.replace(/[\u0622\u0623\u0625]/g, '\u0627');
  result = result.replace(/\u0649/g, '\u064A');
  result = result.replace(/\u0629/g, '\u0647');
  result = result.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => ARABIC_DIGITS[c] || c);
  result = result.replace(/\s+/g, ' ').trim().toLowerCase();
  return result;
}

export function tokenizeForSearch(text: string, removeStopwords = true): string[] {
  const normalized = normalizeArabicText(text);
  const tokens = normalized.split(/[\s\-_,.;:!?'"\[\](){}\/\\]+/).filter(Boolean);
  if (removeStopwords) return tokens.filter((t) => !ARABIC_STOPWORDS.has(t) && t.length > 1);
  return tokens;
}

export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

export function detectLanguage(text: string): 'ar' | 'en' {
  if (!text) return 'en';
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + latinChars;
  return total === 0 ? 'en' : arabicChars / total > 0.3 ? 'ar' : 'en';
}

export function normalizeForSearch(text: string): string {
  if (!text) return '';
  return containsArabic(text) ? normalizeArabicText(text) : text.toLowerCase().trim();
}

export function buildSearchIndex(text: string): string {
  if (!text) return '';
  return `${text.toLowerCase()} ${normalizeForSearch(text)}`;
}
