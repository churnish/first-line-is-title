/**
 * Minimal ambient declaration for jsdom.
 *
 * jsdom ships no types and @types/jsdom is not installed — adding it would have
 * to be mirrored across all nine plugin repos for devDependency parity. Only
 * tests/setup.ts consumes jsdom, and only for the two members declared here.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(
      html?: string,
      options?: { url?: string; pretendToBeVisual?: boolean }
    );
    readonly window: any;
  }
}
