/**
 * Minimal vscode API stub for standalone mocha runs (outside VS Code extension host).
 * Loaded via: mocha --require out/test/vscode-shim.cjs ...
 * In the real extension host, vscode is already provided — this shim is a no-op.
 */
"use strict";

try {
  require.resolve("vscode");
  // vscode module exists (extension host) — do not override
} catch {
  const Module = require("module");
  const orig = Module.prototype.require;

  function cfg() {
    return {
      get: (key, def) => def ?? "",
      has: () => false,
      update: async () => {},
    };
  }

  const mock = {
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => cfg(),
      fs: {
        readFile: async () => Buffer.from(""),
      },
      asRelativePath: (uri) => (typeof uri === "string" ? uri : uri.fsPath || ""),
    },
    Uri: {
      parse: (s) => ({ fsPath: s.replace(/^file:\/\//, ""), toString: () => s }),
      joinPath: (...parts) => ({ fsPath: parts.map((p) => p.fsPath || p).join("/") }),
    },
    extensions: { getExtension: () => undefined },
    commands: { getCommands: async () => [] },
  };

  Module.prototype.require = function (id) {
    if (id === "vscode") return mock;
    return orig.apply(this, arguments);
  };
}
