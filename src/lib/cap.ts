import { type CodeActionKind, type ServerCapabilities, TextDocumentSyncKind } from "vscode-languageserver/node";

// "*" from jsdoc completion
export const completionTriggerCharacters = [".", '"', "'", "`", "/", "@", "<", "#", " ", "*"];

export const signatureHelpTriggerCharacters = ["(", ",", "<"];

export const signatureHelpReTriggerCharacters = [")"];

export const codeActionKinds = [
  'source'                 satisfies typeof CodeActionKind.Source,
  'source.fixAll'          satisfies typeof CodeActionKind.SourceFixAll,
  'source.organizeImports' satisfies typeof CodeActionKind.SourceOrganizeImports,
  'quickfix'               satisfies typeof CodeActionKind.QuickFix,
  'refactor'               satisfies typeof CodeActionKind.Refactor,
  'refactor.extract'       satisfies typeof CodeActionKind.RefactorExtract,
  'refactor.rewrite'       satisfies typeof CodeActionKind.RefactorRewrite,
  'refactor.inline'        satisfies typeof CodeActionKind.RefactorInline,
];

export const semanticTokenTypes = [
  "class",
  "enum",
  "interface",
  "namespace",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "enumMember",
  "property",
  "function",
  "method",
];
export const semanticTokenModifiers = [
  "declaration",
  "static",
  "async",
  "readonly",
  "defaultLibrary",
  "local",
];

// FIXME: this differs from the original source
export const commands = ["_vtsls.completionCacheCommand"];

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];


export function getTsLspDefaultCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      willSave: false,
      willSaveWaitUntil: false,
      save: false,
    },
    completionProvider: {
      triggerCharacters: completionTriggerCharacters,
      resolveProvider: true,
      completionItem: {
        labelDetailsSupport: true,
      },
    },
    hoverProvider: true,
    signatureHelpProvider: {
      triggerCharacters: signatureHelpTriggerCharacters,
      retriggerCharacters: signatureHelpReTriggerCharacters,
    },
    declarationProvider: false,
    definitionProvider: true,
    typeDefinitionProvider: true,
    implementationProvider: true,
    referencesProvider: true,
    documentHighlightProvider: true,
    documentSymbolProvider: {
      label: "typescript",
    },
    codeActionProvider: {
      codeActionKinds,
      resolveProvider: true,
    },
    codeLensProvider: { resolveProvider: true },
    // documentLinkProvider: { resolveProvider: false },
    documentLinkProvider: undefined,
    colorProvider: false,
    workspaceSymbolProvider: { resolveProvider: false },
    documentFormattingProvider: true,
    documentRangeFormattingProvider: true,
    documentOnTypeFormattingProvider: {
      firstTriggerCharacter: onTypeFormatFirstTriggerCharacter,
      moreTriggerCharacter: onTypeFormatMoreTriggerCharacter,
    },
    renameProvider: {
      prepareProvider: true,
    },
    foldingRangeProvider: true,
    selectionRangeProvider: true,
    executeCommandProvider: {
      commands,
    },
    callHierarchyProvider: true,
    linkedEditingRangeProvider: true,
    semanticTokensProvider: {
      legend: {
        tokenTypes: semanticTokenTypes,
        tokenModifiers: semanticTokenModifiers,
      },
      full: true,
      range: true,
    },
    monikerProvider: false,
    typeHierarchyProvider: false,
    inlineValueProvider: false,
    inlayHintProvider: true,
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true,
      },
      fileOperations: {
        didRename: {
          filters: [
            {
              scheme: "file",
              pattern: {
                glob: "**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}",
                matches: "file",
              },
            },
            {
              scheme: "file",
              pattern: {
                glob: "**/*",
                matches: "folder",
              },
            },
          ],
        },
      },
    },
  };
}
