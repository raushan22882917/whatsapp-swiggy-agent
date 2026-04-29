'use strict';

const { formatOptionSet, enforceLineLimit, sanitiseForUser } = require('../../src/utils/responseFormatter');

describe('formatOptionSet', () => {
  test('renders numbered list for 3 items', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const result = formatOptionSet(items, (i) => i.name);
    expect(result).toContain('1. A');
    expect(result).toContain('2. B');
    expect(result).toContain('3. C');
  });

  test('limits to 3 items even if more are provided', () => {
    const items = [1, 2, 3, 4, 5];
    const result = formatOptionSet(items, (i) => String(i));
    expect(result).not.toContain('4.');
    expect(result).not.toContain('5.');
  });

  test('handles fewer than 3 items', () => {
    const result = formatOptionSet([{ name: 'X' }], (i) => i.name);
    expect(result).toContain('1. X');
    expect(result).not.toContain('2.');
  });
});

describe('enforceLineLimit', () => {
  test('returns text unchanged if within limit', () => {
    const text = 'line1\nline2\nline3';
    expect(enforceLineLimit(text, 4)).toBe(text);
  });

  test('truncates to max lines', () => {
    const text = 'a\nb\nc\nd\ne\nf';
    const result = enforceLineLimit(text, 4);
    expect(result.split('\n').length).toBe(4);
  });

  test('returns empty string for empty input', () => {
    expect(enforceLineLimit('', 4)).toBe('');
  });
});

describe('sanitiseForUser', () => {
  test('removes JSON braces', () => {
    expect(sanitiseForUser('Error: {"code":500}')).not.toContain('{');
    expect(sanitiseForUser('Error: {"code":500}')).not.toContain('}');
  });

  test('removes stack trace patterns', () => {
    const trace = 'at Object.<anonymous> (index.js:10:5)';
    expect(sanitiseForUser(trace)).not.toMatch(/\bat\s+\S+/);
  });

  test('removes "Error:" prefix', () => {
    expect(sanitiseForUser('Error: something went wrong')).not.toContain('Error:');
  });

  test('removes standalone HTTP status codes', () => {
    expect(sanitiseForUser('Server returned 500')).not.toContain('500');
    expect(sanitiseForUser('Not found 404')).not.toContain('404');
  });

  test('preserves normal Hinglish text', () => {
    const text = 'Khana order ho gaya! 🍛';
    expect(sanitiseForUser(text)).toContain('Khana order ho gaya');
  });
});
