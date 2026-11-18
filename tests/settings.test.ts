import {describe, expect, it} from 'vitest';
import {DEFAULT_SETTINGS, normalizeHostname, validateSettings, withSiteMode} from '../src/shared/settings';

describe('settings validation', () => {
  it('returns defaults for missing or invalid data', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({schemaVersion: 99, enabled: 'yes', brightness: NaN, contrast: null, sepia: []})).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs, rounds, and clamps every numeric field', () => {
    expect(validateSettings({enabled: false, brightness: 49, contrast: 151, sepia: 50.6})).toMatchObject({
      schemaVersion: 1,
      enabled: false,
      brightness: 50,
      contrast: 150,
      sepia: 51,
    });
  });

  it('normalizes exact hostnames and omits default auto entries', () => {
    expect(normalizeHostname(' ExAmPle.COM. ')).toBe('example.com');
    expect(normalizeHostname('example.com/path')).toBe('');
    const settings = validateSettings({siteModes: {'EXAMPLE.com.': 'off', 'bad/path': 'force', 'auto.test': 'auto', 'force.test': 'force'}});
    expect(settings.siteModes).toEqual({'example.com': 'off', 'force.test': 'force'});
    expect(withSiteMode(settings, 'Sub.Example.com', 'auto').siteModes).toEqual({
      'example.com': 'off',
      'force.test': 'force',
    });
    expect(withSiteMode(settings, 'example.com', 'auto').siteModes).toEqual({'force.test': 'force'});
  });
});
