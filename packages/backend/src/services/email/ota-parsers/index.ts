// ─── OTA Parser Registration ─────────────────────────────────
//
// Import all OTA parsers and register them with the registry.
// This file is the single entry point for OTA parsing in the email pipeline.

import { registerOtaParser, parseOtaEmail } from '../ota-parser.js';
import { tripaneerParser } from './tripaneer.parser.js';

// Register all parsers
registerOtaParser(tripaneerParser);

// Re-export for convenience
export { parseOtaEmail };
