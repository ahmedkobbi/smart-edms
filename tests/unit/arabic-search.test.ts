/**
 * Smart EDMS — Arabic search normalization tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeArabicText,
  tokenizeForSearch,
  containsArabic,
  detectLanguage,
  normalizeForSearch,
  buildSearchIndex,
} from '@/lib/i18n/arabic-search';

describe('Arabic Search Normalization', () => {
  it('removes tashkeel (diacritics)', () => {
    const withTashkeel = 'الرَّحْمَنِ الرَّحِيمِ';
    const without = normalizeArabicText(withTashkeel);
    expect(without).not.toContain('\u064B'); // fatha
    expect(without).not.toContain('\u064C'); // damma
    expect(without).not.toContain('\u064D'); // kasra
    expect(without).toContain('الرحمن');
  });

  it('normalizes hamza variants to bare alef', () => {
    expect(normalizeArabicText('أحمد')).toBe('احمد');
    expect(normalizeArabicText('إبراهيم')).toBe('ابراهيم');
    expect(normalizeArabicText('آدم')).toBe('ادم');
  });

  it('normalizes alef maksura to yeh', () => {
    expect(normalizeArabicText('متى')).toContain('متي');
    expect(normalizeArabicText('الذي')).toContain('الذي');
  });

  it('normalizes taa marbuta to haa', () => {
    expect(normalizeArabicText('مدينة')).toContain('مدينه');
    expect(normalizeArabicText('جامعة')).toContain('جامعه');
  });

  it('removes tatweel', () => {
    expect(normalizeArabicText('الـسلام')).not.toContain('\u0640');
  });

  it('normalizes Arabic-Indic digits to Western', () => {
    expect(normalizeArabicText('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeArabicText('الفصل ٣')).toContain('3');
  });

  it('handles mixed Arabic + English text', () => {
    const mixed = 'Document مستند';
    const result = normalizeArabicText(mixed);
    expect(result).toContain('document');
    expect(result).toContain('مستند');
  });

  it('detects Arabic content', () => {
    expect(containsArabic('هذا نص عربي')).toBe(true);
    expect(containsArabic('This is English text')).toBe(false);
    expect(containsArabic('Mixed نص text')).toBe(true);
  });

  it('detects language correctly', () => {
    expect(detectLanguage('This is an English document about security')).toBe('en');
    expect(detectLanguage('هذا مستند باللغة العربية عن الأمن')).toBe('ar');
    expect(detectLanguage('')).toBe('en');
  });

  it('tokenizes and removes stopwords', () => {
    const tokens = tokenizeForSearch('في هذا الملف توجد معلومات');
    expect(tokens).not.toContain('في');
    expect(tokens).not.toContain('هذا');
    expect(tokens).toContain('الملف');
    expect(tokens).toContain('توجد');
    expect(tokens).toContain('معلومات');
  });

  it('normalizes for search (Arabic path)', () => {
    expect(normalizeForSearch('أحمد')).toBe('احمد');
    expect(normalizeForSearch('Ahmed')).toBe('ahmed');
  });

  it('builds search index with both original and normalized', () => {
    const index = buildSearchIndex('مدينة');
    expect(index).toContain('مدينة');
    expect(index).toContain('مدينه'); // normalized
  });
});
