import detectorHintsSource from '../vendor/darkreader/detector-hints.config';
import dynamicFixesSource from '../vendor/darkreader/dynamic-theme-fixes.config';
import type {DetectorHint} from './detector';

interface ConfigBlock {
  readonly patterns: readonly string[];
  readonly commands: Readonly<Record<string, string>>;
}

interface WildcardEntry {
  readonly suffix: string;
  readonly block: ConfigBlock;
}

interface CompiledConfig {
  readonly exact: Readonly<Record<string, readonly ConfigBlock[]>>;
  readonly wildcards: readonly WildcardEntry[];
  readonly global: readonly ConfigBlock[];
}

export interface DynamicThemeFix {
  readonly invert: string[];
  readonly css: string;
  readonly ignoreInlineStyle: string[];
  readonly ignoreImageAnalysis: string[];
  readonly disableStyleSheetsProxy: boolean;
  readonly ignoreCSSUrl: string[];
}

function compileRawConfig(text: string): CompiledConfig {
  const exact: Record<string, ConfigBlock[]> = Object.create(null) as Record<string, ConfigBlock[]>;
  const wildcards: WildcardEntry[] = [];
  const global: ConfigBlock[] = [];

  for (const section of text.replace(/\r\n/g, '\n').split(/\n={16,}\n/g)) {
    const sectionLines = section.trim().split('\n');
    const patterns: string[] = [];
    let index = 0;
    while (index < sectionLines.length && (sectionLines[index]?.trim() ?? '') !== '') {
      patterns.push(sectionLines[index]?.trim() ?? '');
      index += 1;
    }
    const commands: Record<string, string> = {};
    while (index < sectionLines.length) {
      while (index < sectionLines.length && (sectionLines[index]?.trim() ?? '') === '') {
        index += 1;
      }
      const command = sectionLines[index]?.trim();
      if (command === undefined) {
        break;
      }
      index += 1;
      const values: string[] = [];
      while (index < sectionLines.length) {
        const line = sectionLines[index] ?? '';
        if (line.trim() === '' && /^[A-Z][A-Z ]+$/.test((sectionLines[index + 1] ?? '').trim())) {
          break;
        }
        values.push(line);
        index += 1;
      }
      commands[command] = values.join('\n').trim();
    }
    if (patterns.length === 0) {
      continue;
    }
    const block: ConfigBlock = {patterns, commands};
    for (const rawPattern of patterns) {
      const clean = rawPattern.replace(/^\^/, '').replace(/\/$/, '').toLowerCase();
      if (clean === '*') {
        global.push(block);
      } else if (clean.startsWith('*.')) {
        wildcards.push({suffix: clean.slice(2), block});
      } else if (clean !== '') {
        (exact[clean] ??= []).push(block);
      }
    }
  }
  return {exact, wildcards, global};
}

function createLazyConfig(source: string | CompiledConfig): () => CompiledConfig {
  let compiled: CompiledConfig | undefined = typeof source === 'string' ? undefined : source;
  return () => (compiled ??= compileRawConfig(source as string));
}

const getDetectorHintsConfig = createLazyConfig(detectorHintsSource);
const getDynamicFixesConfig = createLazyConfig(dynamicFixesSource);

function matchingHostBlocks(config: CompiledConfig, hostname: string, includeGlobal: boolean): readonly ConfigBlock[] {
  const matches = new Set<ConfigBlock>(includeGlobal ? config.global : undefined);
  for (const block of config.exact[hostname] ?? []) {
    matches.add(block);
  }
  for (const entry of config.wildcards) {
    if (hostname === entry.suffix || hostname.endsWith(`.${entry.suffix}`)) {
      matches.add(entry.block);
    }
  }
  return [...matches];
}

function lines(value: string | undefined): string[] {
  return value?.split('\n').map((line) => line.trim()).filter(Boolean) ?? [];
}

export function getDetectorHint(url: string): DetectorHint | undefined {
  const hostname = new URL(url).hostname.toLowerCase();
  const block = matchingHostBlocks(getDetectorHintsConfig(), hostname, false)
    .find((candidate) => !candidate.patterns.includes('*'));
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
  const hostname = new URL(url).hostname.toLowerCase();
  const blocks = matchingHostBlocks(getDynamicFixesConfig(), hostname, true);
  return {
    invert: blocks.flatMap((block) => lines(block.commands.INVERT)),
    css: blocks.map((block) => block.commands.CSS ?? '').filter(Boolean).join('\n'),
    ignoreInlineStyle: blocks.flatMap((block) => lines(block.commands['IGNORE INLINE STYLE'])),
    ignoreImageAnalysis: blocks.flatMap((block) => lines(block.commands['IGNORE IMAGE ANALYSIS'])),
    disableStyleSheetsProxy: false,
    ignoreCSSUrl: blocks.flatMap((block) => lines(block.commands['IGNORE CSS URL'])),
  };
}
