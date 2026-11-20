export interface Colour {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

export const LIGHT: string;
export const DARK: string;
export const OS_DARK: string;
export function block(css: string, selector: string): Record<string, string>;
export function parse(
  value: string,
  vars?: Record<string, string>,
  seen?: string[],
): Colour | undefined;
export function hex(colour: Colour): string;
export function contrast(foreground: Colour, background: Colour): number;
export function themes(css: string): {
  light: Record<string, string>;
  dark: Record<string, string>;
};
export function palette(css: string): [string, string][];
