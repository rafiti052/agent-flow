/**
 * Redirects `require('vscode')` (via NODE_PATH) to the existing dev-relay
 * shim, so cursor-relay-scenario-runner.ts can import scripts/relay.ts
 * un-bundled — the same shim esbuild aliases in at build time for the real
 * dev relay (see scripts/build-relay.js).
 */
'use strict'
module.exports = require('../../../../scripts/vscode-shim.js')
