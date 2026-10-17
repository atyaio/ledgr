import { core } from './ar.core';
import { pagesA } from './ar.pages-a';
import { pagesB } from './ar.pages-b';

/** Arabic UI strings keyed by the English text. Later entries win on duplicates. */
export const ar: Record<string, string> = { ...core, ...pagesA, ...pagesB };
