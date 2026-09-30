#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).catch((error) => {
  const structured = error?.toJSON?.() ?? {
    ok: false,
    error: {
      code: error?.code || 'UNEXPECTED_ERROR',
      message: error?.message || String(error)
    }
  };
  process.stderr.write(`${JSON.stringify(structured, null, 2)}\n`);
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
});
