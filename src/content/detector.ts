const DARK_ATTRIBUTE_VALUES = new Set(['dark', 'night', 'black']);
const THEME_ATTRIBUTES = ['data-theme', 'data-color-mode', 'data-bs-theme', 'theme', 'color-mode'];

export interface DetectorHint {
  readonly target: string;
  readonly match: readonly string[];
  readonly noDarkTheme: boolean;
  readonly systemTheme: boolean;
}

function parseRgb(color: string): readonly [number, number, number, number] | undefined {
  const match = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d*(?:\.\d+)?))?\s*\)$/i);
  if (match === null) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function lightness(color: readonly [number, number, number, number]): number {
  const linear = color.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function explicitDarkSignal(documentValue: Document): boolean {
  const meta = documentValue.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  const content = meta?.content.toLowerCase().trim() ?? '';
  if (content === 'dark' || (content.includes('dark') && matchMedia('(prefers-color-scheme: dark)').matches)) {
    return true;
  }
  for (const element of [documentValue.documentElement, documentValue.body]) {
    if ([...element.classList].some((name) => /^(dark|dark-mode|dark-theme|theme-dark|night)$/.test(name.toLowerCase()))) {
      return true;
    }
    for (const attribute of THEME_ATTRIBUTES) {
      const value = element.getAttribute(attribute)?.toLowerCase().trim();
      if (value !== undefined && DARK_ATTRIBUTE_VALUES.has(value)) {
        return true;
      }
    }
  }
  const rootStyle = getComputedStyle(documentValue.documentElement);
  const preloadActive = documentValue.querySelector('[data-safari-dark-mode="preload"]') !== null;
  return (!preloadActive && rootStyle.colorScheme === 'dark') || rootStyle.filter.includes('invert(1)');
}

function hintMatches(documentValue: Document, hint: DetectorHint): boolean | undefined {
  if (hint.noDarkTheme) {
    return false;
  }
  if (hint.systemTheme && matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }
  const target = documentValue.querySelector(hint.target);
  return target !== null && hint.match.some((selector) => target.matches(selector)) ? true : undefined;
}

function withExtensionStylesDisabled<T>(documentValue: Document, task: () => T): T {
  const elements = documentValue.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style[class*="darkreader"], link[class*="darkreader"], style[data-safari-dark-mode]',
  );
  const elementSheets = Array.from(elements)
    .map((element) => element.sheet)
    .filter((sheet): sheet is CSSStyleSheet => sheet !== null);
  const adoptedStyleSheets = (documentValue as {adoptedStyleSheets?: CSSStyleSheet[]})
    .adoptedStyleSheets;
  const adoptedSheets = Array.from(adoptedStyleSheets ?? []).filter((sheet) => {
    try {
      const rule = sheet.cssRules.item(0);
      return rule instanceof CSSStyleRule && rule.selectorText.startsWith('#__darkreader');
    } catch {
      return false;
    }
  });
  const sheets = [...new Set([...elementSheets, ...adoptedSheets])];
  const states = sheets.map((sheet) => sheet.disabled);
  sheets.forEach((sheet) => { sheet.disabled = true; });
  try {
    return task();
  } finally {
    sheets.forEach((sheet, index) => { sheet.disabled = states[index] ?? false; });
  }
}

function getVisibleSamples(documentValue: Document): readonly Element[] {
  if (typeof documentValue.elementFromPoint !== 'function' || documentValue.defaultView === null) {
    return [documentValue.documentElement, documentValue.body];
  }
  const width = Math.max(1, documentValue.defaultView.innerWidth);
  const height = Math.max(1, documentValue.defaultView.innerHeight);
  const columns = Math.min(4, Math.max(1, Math.ceil(width / 256)));
  const rows = Math.min(4, Math.max(1, Math.ceil(height / 256)));
  const samples = new Set<Element>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const element = documentValue.elementFromPoint(
        ((column + 0.5) * width) / columns,
        ((row + 0.5) * height) / rows,
      );
      if (element !== null && element.tagName !== 'IMG') {
        samples.add(element);
      }
    }
  }
  return samples.size === 0 ? [documentValue.documentElement, documentValue.body] : [...samples];
}

function detectFromVisibleColors(documentValue: Document): boolean {
  let darkSamples = 0;
  for (const element of getVisibleSamples(documentValue)) {
    if (element.closest('[data-safari-dark-mode], [class*="darkreader"]') !== null) {
      continue;
    }
    const style = getComputedStyle(element);
    const background = parseRgb(style.backgroundColor);
    const foreground = parseRgb(style.color);
    if (background !== undefined && background[3] >= 0.5) {
      if (lightness(background) > 0.55) {
        return false;
      }
      if (foreground !== undefined && lightness(background) < 0.25 && lightness(foreground) > 0.35) {
        darkSamples += 1;
      }
    } else if (foreground !== undefined) {
      if (lightness(foreground) < 0.4) {
        return false;
      }
      darkSamples += 1;
    }
  }
  return darkSamples > 0;
}

export function detectNativeDark(documentValue: Document, hint?: DetectorHint): boolean {
  if (hint !== undefined) {
    const result = hintMatches(documentValue, hint);
    if (result !== undefined) {
      return result;
    }
  }
  return withExtensionStylesDisabled(documentValue, () =>
    explicitDarkSignal(documentValue) || detectFromVisibleColors(documentValue));
}

export function observeThemeChanges(documentValue: Document, callback: () => void): MutationObserver {
  const isExtensionOwned = (node: Node): boolean => {
    const element = node instanceof Element ? node : node.parentElement;
    return (element?.closest('[data-safari-dark-mode], .darkreader, [class^="darkreader--"]') ?? null) !== null;
  };
  let observedBody: HTMLElement | null = null;
  let observedHead: HTMLHeadElement | null = null;

  const observer = new MutationObserver((mutations) => {
    attachSecondaryTargets();
    const relevant = mutations.some((mutation) => {
      if (isExtensionOwned(mutation.target)) {
        return false;
      }
      if (mutation.type === 'attributes') {
        return true;
      }
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isExtensionOwned(node));
    });
    if (relevant) {
      callback();
    }
  });

  const attachSecondaryTargets = (): void => {
    const body = documentValue.body as HTMLElement | null;
    if (body !== null && body !== observedBody) {
      observedBody = body;
      observer.observe(observedBody, {
        attributes: true,
        attributeFilter: ['class', 'style', ...THEME_ATTRIBUTES],
      });
    }
    const head = documentValue.head as HTMLHeadElement | null;
    if (head !== null && head !== observedHead) {
      observedHead = head;
      observer.observe(observedHead, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['content'],
      });
    }
  };

  observer.observe(documentValue.documentElement, {
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', ...THEME_ATTRIBUTES],
  });
  attachSecondaryTargets();
  return observer;
}
