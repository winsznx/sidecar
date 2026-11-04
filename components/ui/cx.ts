import { clsx, type ClassValue } from "clsx";

export type { ClassValue };

/**
 * Joins class names. There is no Tailwind conflict resolution, so a `className`
 * passed to a primitive should add layout (margin, width, grid placement) rather
 * than restyle colour or type.
 */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
