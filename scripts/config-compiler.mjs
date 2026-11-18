/**
 * Parses a Dark Reader `.config` file into an indexed structure for O(1) exact-host
 * lookup at runtime without shipping or parsing raw config text in the bundle.
 */
export function compileConfigText(text) {
  const exact = Object.create(null);
  const wildcards = [];
  const global = [];

  for (const section of text.replace(/\r\n/g, '\n').split(/\n={16,}\n/g)) {
    const lines = section.trim().split('\n');
    const patterns = [];
    let index = 0;
    while (index < lines.length && (lines[index]?.trim() ?? '') !== '') {
      patterns.push(lines[index]?.trim() ?? '');
      index += 1;
    }
    const commands = {};
    while (index < lines.length) {
      while (index < lines.length && (lines[index]?.trim() ?? '') === '') {
        index += 1;
      }
      const command = lines[index]?.trim();
      if (command === undefined) {
        break;
      }
      index += 1;
      const values = [];
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
    if (patterns.length === 0) {
      continue;
    }
    const block = {patterns, commands};
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
