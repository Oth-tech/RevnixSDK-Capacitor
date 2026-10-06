import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { linkLabels, localizeBlockDoc, setLocale, detectLocale } = await import('../dist/esm/locale.js');

describe('linkLabels', () => {
  test('resolves Urdu for "ur" and "ur-PK"', () => {
    assert.deepEqual(linkLabels('ur'), { restore: 'بحال کریں', terms: 'شرائط', privacy: 'رازداری' });
    assert.deepEqual(linkLabels('ur-PK'), { restore: 'بحال کریں', terms: 'شرائط', privacy: 'رازداری' });
  });

  test('picks traditional Chinese for Taiwan, Hong Kong tags', () => {
    const hant = { restore: '恢復購買', terms: '條款', privacy: '隱私' };
    assert.deepEqual(linkLabels('zh-Hant-TW'), hant);
    assert.deepEqual(linkLabels('zh-TW'), hant);
    assert.deepEqual(linkLabels('zh-HK'), hant);
  });

  test('picks simplified Chinese otherwise', () => {
    const hans = { restore: '恢复购买', terms: '条款', privacy: '隐私' };
    assert.deepEqual(linkLabels('zh-Hans-HK'), hans);
    assert.deepEqual(linkLabels('zh-CN'), hans);
    assert.deepEqual(linkLabels('zh'), hans);
  });

  test('aliases old/legacy tags', () => {
    assert.deepEqual(linkLabels('iw'), { restore: 'שחזור', terms: 'תנאים', privacy: 'פרטיות' });
  });

  test('"no" aliases to Norwegian Bokmål', () => {
    assert.deepEqual(linkLabels('no'), { restore: 'Gjenopprett', terms: 'Vilkår', privacy: 'Personvern' });
  });

  test('falls back to English for unknown, undefined or empty tags', () => {
    const en = { restore: 'Restore', terms: 'Terms', privacy: 'Privacy' };
    assert.deepEqual(linkLabels('xx'), en);
    assert.deepEqual(linkLabels(undefined), en);
    assert.deepEqual(linkLabels(''), en);
  });

  test('normalizes underscore-separated tags', () => {
    assert.deepEqual(linkLabels('pt_BR'), { restore: 'Restaurar', terms: 'Termos', privacy: 'Privacidade' });
  });
});

describe('localizeBlockDoc', () => {
  test('sets defaultLocale to the resolved tag when a translation applies', () => {
    const doc = {
      version: 1,
      background: '#000',
      textColor: '#fff',
      accent: '#fff',
      accentInk: '#000',
      blocks: [],
      locales: { es: {} },
    };
    const result = localizeBlockDoc(doc, 'es-MX');
    assert.equal(result.defaultLocale, 'es');
  });
});

describe('setLocale', () => {
  test('overrides detectLocale until cleared', () => {
    setLocale('fr-FR');
    assert.equal(detectLocale(), 'fr-FR');
    setLocale();
    assert.notEqual(detectLocale(), 'fr-FR');
  });
});
