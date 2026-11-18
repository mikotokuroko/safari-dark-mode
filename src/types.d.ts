declare module '*.config' {
  interface ConfigBlock {
    readonly patterns: readonly string[];
    readonly commands: Readonly<Record<string, string>>;
  }
  interface CompiledConfig {
    readonly exact: Readonly<Record<string, readonly ConfigBlock[]>>;
    readonly wildcards: readonly {readonly suffix: string; readonly block: ConfigBlock}[];
    readonly global: readonly ConfigBlock[];
  }
  const contents: string | CompiledConfig;
  export default contents;
}

declare module '*.mjs' {
  interface Theme {
    readonly mode?: 0 | 1;
    readonly brightness?: number;
    readonly contrast?: number;
    readonly sepia?: number;
  }

  interface DynamicThemeFix {
    readonly invert: string[];
    readonly css: string;
    readonly ignoreInlineStyle: string[];
    readonly ignoreImageAnalysis: string[];
    readonly disableStyleSheetsProxy: boolean;
    readonly ignoreCSSUrl: string[];
  }

  export function enable(theme?: Theme, fixes?: DynamicThemeFix): void;
  export function disable(): void;
  export function setFetchMethod(method: (url: string) => Promise<Response>): void;
}
