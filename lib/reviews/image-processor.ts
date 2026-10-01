import implementation from 'sharp';
// Vinext's ambient optional-dependency stub declares sharp as unknown. Import
// the installed package's actual declaration directly; this type-only reference
// is erased from the build and does not change runtime package resolution.
import type {SharpConstructor} from '../../node_modules/sharp/dist/index.d.mts';
export const sharp = implementation as SharpConstructor;
