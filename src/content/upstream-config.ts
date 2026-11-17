import detectorHintsText from '../vendor/darkreader/detector-hints.config';
import dynamicFixesText from '../vendor/darkreader/dynamic-theme-fixes.config';
import type {DetectorHint} from './detector';

interface ConfigBlock {
  readonly patterns: readonly string[];
  readonly commands: Readonly<Record<string, string>>;
}

export interface DynamicThemeFix {
  readonly invert: string[];
  readonly css: string;
  readonly ignoreInlineStyle: string[];
  readonly ignoreImageAnalysis: string[];
  readonly disableStyleSheetsProxy: boolean;
  readonly ignoreCSSUrl: string[];
}

function parseBlocks(text: string): readonly ConfigBlock[] {
  return text.replace(/\r\n/g, '\n').split(/\n={16,}\n/g).map((section) => {
    const lines = section.trim().split('\n');
    const patterns: string[] = [];
    let index = 0;
    while (index < lines.length && (lines[index]?.trim() ?? '') !== '') {
      patterns.push(lines[index]?.trim() ?? '');
      index += 1;
    }
    const commands: Record<string, string> = {};
    while (index < lines.length) {
      while (index < lines.length && (lines[index]?.trim() ?? '') === '') {
        index += 1;
      }
      const command = lines[index]?.trim();
      if (command === undefined) {
        break;
      }
      index += 1;
      const values: string[] = [];
      while (index < lines.length) {
        const line = lines[index] ?? '';
        if (line.trim() === '' && /^[A-Z][A-Z ]+$/.test((lines[index + 1] ?? '').trim())) {
          break;
        }
        values.push(line);
        index += 1;
      }
      commands[command] = values.join('\n').trim();
    }
    return {patterns, commands};
  });
}

function patternMatches(hostname: string, pattern: string): boolean {
  const clean = pattern.replace(/^\^/, '').replace(/\/$/, '').toLowerCase();
  if (clean === '*') {
    return true;
  }
  if (clean.startsWith('*.')) {
    const suffix = clean.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === clean;
}

const parsedDetectorHints = parseBlocks(detectorHintsText);
const parsedDynamicFixes = parseBlocks(dynamicFixesText);

function relevantBlocks(blocks: readonly ConfigBlock[], url: string): readonly ConfigBlock[] {
  const hostname = new URL(url).hostname.toLowerCase();
  return blocks.filter((block) => block.patterns.some((pattern) => patternMatches(hostname, pattern)));
}

function lines(value: string | undefined): string[] {
  return value?.split('\n').map((line) => line.trim()).filter(Boolean) ?? [];
}

export function getDetectorHint(url: string): DetectorHint | undefined {
  const block = relevantBlocks(parsedDetectorHints, url).find((candidate) => !candidate.patterns.includes('*'));
  if (block === undefined) {
    return undefined;
  }
  return {
    target: block.commands.TARGET ?? 'html',
    match: lines(block.commands.MATCH),
    noDarkTheme: 'NO DARK THEME' in block.commands,
    systemTheme: 'SYSTEM THEME' in block.commands,
  };
}

export function getDynamicThemeFix(url: string): DynamicThemeFix {
  const blocks = relevantBlocks(parsedDynamicFixes, url);
  return {
    invert: blocks.flatMap((block) => lines(block.commands.INVERT)),
    css: blocks.map((block) => block.commands.CSS ?? '').filter(Boolean).join('\n'),
    ignoreInlineStyle: blocks.flatMap((block) => lines(block.commands['IGNORE INLINE STYLE'])),
    ignoreImageAnalysis: blocks.flatMap((block) => lines(block.commands['IGNORE IMAGE ANALYSIS'])),
    disableStyleSheetsProxy: false,
    ignoreCSSUrl: blocks.flatMap((block) => lines(block.commands['IGNORE CSS URL'])),
  };
}
