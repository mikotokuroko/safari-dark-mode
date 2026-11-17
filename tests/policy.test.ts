import {describe, expect, it} from 'vitest';
import {decidePolicy} from '../src/shared/policy';
import {validateSettings} from '../src/shared/settings';

describe('fixed policy precedence', () => {
  const cases = [
    [{enabled: false, siteModes: {'example.com': 'force'}}, true, true, false, 'disabled'],
    [{enabled: true, siteModes: {'example.com': 'off'}}, false, true, false, 'disabled'],
    [{enabled: true, siteModes: {'example.com': 'force'}}, true, false, true, 'forced'],
    [{enabled: true, siteModes: {'example.com': 'force'}}, false, false, true, 'forced'],
    [{enabled: true, siteModes: {'example.com': 'auto'}}, true, true, false, 'native-dark'],
    [{enabled: true, siteModes: {'example.com': 'auto'}}, false, true, true, 'darkened'],
    [{enabled: true, siteModes: {'example.com': 'auto'}}, false, false, false, 'system-light'],
    [{enabled: true}, false, true, true, 'darkened'],
    [{enabled: true}, true, true, false, 'native-dark'],
    [{enabled: true}, false, false, false, 'system-light'],
  ] as const;

  for (const [partial, detected, systemDark, apply, status] of cases) {
    it(`${JSON.stringify(partial)} + native=${String(detected)} + systemDark=${String(systemDark)} -> ${status}`, () => {
      expect(decidePolicy(validateSettings(partial), 'example.com', detected, systemDark)).toEqual({apply, status});
    });
  }

  it('isolates parent and subdomain rules', () => {
    const settings = validateSettings({siteModes: {'example.com': 'off'}});
    expect(decidePolicy(settings, 'example.com', false, true).apply).toBe(false);
    expect(decidePolicy(settings, 'www.example.com', false, true).apply).toBe(true);
  });
});
