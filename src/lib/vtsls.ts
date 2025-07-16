// this file is mostly ported from @vtsls/language-server:
// https://github.com/yioneko/vtsls/blob/main/packages/server/src/index.ts

import {
  createTSLanguageService,
  DocumentNotOpenedError,
  ProviderNotFoundError,
  type TSLanguageService,
} from "@andy0130tw/vtsls-language-service";
import {
    BrowserMessageReader,
    BrowserMessageWriter,
  type ClientCapabilities,
  ConfigurationRequest,
  type Connection,
  createConnection,
  type InitializeParams,
  LogMessageNotification,
  ProposedFeatures,
  ShowDocumentRequest,
  ShowMessageRequest,
} from "vscode-languageserver/browser";
import { URI } from "vscode-uri";
import { getTsLspDefaultCapabilities } from "./cap";

// FIXME
const VTSLS_VERSION: string = '9999'

interface VTSLSInitializationOptions {
  hostInfo?: string
  tsLogPath?: string
  extensionUri?: string
  settings?: {}
}

type VTSLSInitializeParams = Omit<InitializeParams, 'initializationOptions'> & {
  initializationOptions: VTSLSInitializationOptions,
}

export function createLanguageServer(port: MessagePort, initializationOptions: VTSLSInitializationOptions = {}) {
  const messageReader = new BrowserMessageReader(port);
  const messageWriter = new BrowserMessageWriter(port);

  const conn = createConnection(ProposedFeatures.all, messageReader, messageWriter);

  conn.onInitialize((params) => {
    console.log('on initialize params', params)

    params.capabilities.textDocument ??= {}

    // better-supported push-based diagnostics
    params.capabilities.textDocument.publishDiagnostics = {
      relatedInformation: true,
      codeDescriptionSupport: true,
      dataSupport: true,
      versionSupport: true,
    }
    // more ergonomic, pull-based diagnostics since 3.17.0
    // but t-l-s nor vtsls does not support this :(
    // params.capabilities.textDocument.diagnostics = {}

    params.capabilities.workspace ??= {}
    params.capabilities.workspace.didChangeConfiguration = {}

    return onServerInitialize(conn, {
      ...params,
      // XXX: @codemirror/lsp-client do not expose the param to us; see client.ts:240
      initializationOptions,
    });
  });

  // NOTE: you should call `conn.listen()` when ready
  return conn;
}

function onServerInitialize(conn: Connection, params: VTSLSInitializeParams) {
  const clientCapabilities = params.capabilities;

  const root =
    params.rootUri ?? (params.rootPath ? URI.file(params.rootPath).toString() : undefined);
  const folders =
    params.workspaceFolders ?? (typeof root == "string" ? [{ name: root, uri: root }] : undefined);

  const service = createTSLanguageService({
    locale: params.locale,
    workspaceFolders: folders,
    clientCapabilities,
    hostInfo: params.initializationOptions?.hostInfo,
    tsExtLogPath: params.initializationOptions?.tsLogPath,
    extensionUri: params.initializationOptions?.extensionUri,
  });

  async function initializeService() {
    try {
      if (clientCapabilities.workspace?.configuration) {
        const config = await conn.sendRequest(ConfigurationRequest.type, {
          items: [{ section: "" }],
        });
        await service.initialize(Array.isArray(config) ? config[0] : {});
      } else {
        await service.initialize(params.initializationOptions?.settings ?? {});
      }
    } catch (e) {
      conn.console.error(`Server initialization failed: ${String(e)}`);
      conn.dispose();
    }
  }

  conn.onInitialized(() => {
    bindServiceHandlers(conn, service, clientCapabilities);
    void initializeService();
  });

  // process.on("exit", () => service.dispose());

  const capabilities = getTsLspDefaultCapabilities();
  if (!clientCapabilities.textDocument?.codeAction?.codeActionLiteralSupport) {
    capabilities.codeActionProvider = true;
  }

  return {
    capabilities,
    serverInfo: { name: "vtsls", version: VTSLS_VERSION },
  };
}

function bindServiceHandlers(
  conn: Connection,
  service: TSLanguageService,
  clientCapabilities: ClientCapabilities
) {
  service.onLogMessage((params) => void conn.sendNotification(LogMessageNotification.type, params));

  service.onLogTrace((params) => void conn.tracer.log(params.message));
  if (clientCapabilities.window?.showMessage) {
    service.onShowMessage((params) => conn.sendRequest(ShowMessageRequest.type, params));
  }
  if (clientCapabilities.window?.showDocument) {
    service.onShowDocument(
      async (params) => (await conn.sendRequest(ShowDocumentRequest.type, params)).success
    );
  }
  if (clientCapabilities.window?.workDoneProgress) {
    service.onWorkDoneProgress(() => conn.window.createWorkDoneProgress());
  }
  if (clientCapabilities.workspace?.applyEdit) {
    service.onApplyWorkspaceEdit((params) => conn.workspace.applyEdit(params));
  }
  if (clientCapabilities.textDocument?.publishDiagnostics) {
    service.onDiagnostics((params) => conn.sendDiagnostics(params));
  }

  conn.onExit(() => service.dispose());
  conn.onShutdown(() => service.dispose());

  function safeRun<A extends any[], R, F>(
    handler: (...args: A) => Promise<R>,
    fallback: F,
    catchProviderNotFound = false
  ) {
    return async (...args: A) => {
      try {
        return await handler(...args);
      } catch (e) {
        if (catchProviderNotFound && e instanceof ProviderNotFoundError) {
          // some features are missing on older version of ts, supress error for them
          conn.console.warn(e.message);
          return fallback;
        } else if (e instanceof DocumentNotOpenedError) {
          // https://github.com/microsoft/language-server-protocol/issues/1912
          // The discussion has not been settled, just ignore the error for now
          return fallback;
        }
        throw e;
      }
    };
  }

  /* eslint-disable @typescript-eslint/unbound-method*/
  conn.onDidOpenTextDocument(service.openTextDocument);
  conn.onDidCloseTextDocument(service.closeTextDocument);
  conn.onDidChangeTextDocument(service.changeTextDocument);
  conn.onDidChangeConfiguration(service.changeConfiguration);
  conn.workspace.onDidRenameFiles(service.renameFiles);
  /* eslint-enable @typescript-eslint/unbound-method*/
  if (clientCapabilities.workspace?.workspaceFolders) {
    // otherwise this will throw error 😈
    conn.workspace.onDidChangeWorkspaceFolders((event) =>
      service.changeWorkspaceFolders({ event })
    );
  }
  conn.onCompletion(safeRun(service.completion, null));
  conn.onCompletionResolve(service.completionItemResolve);
  conn.onDocumentHighlight(safeRun(service.documentHighlight, null));
  conn.onSignatureHelp(safeRun(service.signatureHelp, null));
  // conn.onDocumentLinks(service.documentLinks);
  conn.onDefinition(safeRun(service.definition, null));
  conn.onReferences(safeRun(service.references, null));
  conn.onHover(safeRun(service.hover, null));
  conn.onDocumentSymbol(safeRun(service.documentSymbol, null));
  conn.onWorkspaceSymbol(safeRun(service.workspaceSymbol, null));
  conn.onCodeAction(safeRun(service.codeAction, null));
  conn.onCodeActionResolve(service.codeActionResolve);
  conn.onExecuteCommand(safeRun(service.executeCommand, null));
  conn.onImplementation(safeRun(service.implementation, null));
  conn.onTypeDefinition(safeRun(service.typeDefinition, null));
  conn.onDocumentFormatting(safeRun(service.documentFormatting, null));
  conn.onDocumentRangeFormatting(safeRun(service.documentRangeFormatting, null));
  conn.onDocumentOnTypeFormatting(safeRun(service.documentOnTypeFormatting, null));
  conn.onPrepareRename(safeRun(service.prepareRename, null));
  conn.onRenameRequest(safeRun(service.rename, null));
  conn.onFoldingRanges(safeRun(service.foldingRanges, null));
  conn.onSelectionRanges(safeRun(service.selectionRanges, null));
  conn.onCodeLens(safeRun(service.codeLens, null));
  conn.onCodeLensResolve(service.codeLensResolve);
  conn.languages.callHierarchy.onPrepare(safeRun(service.prepareCallHierarchy, null, true));
  conn.languages.callHierarchy.onIncomingCalls(safeRun(service.incomingCalls, null, true));
  conn.languages.callHierarchy.onOutgoingCalls(safeRun(service.outgoingCalls, null, true));
  conn.languages.inlayHint.on(safeRun(service.inlayHint, null, true));
  conn.languages.onLinkedEditingRange(safeRun(service.linkedEditingRange, null, true));

  const nullSemanticTokens = { data: [] };
  conn.languages.semanticTokens.on(safeRun(service.semanticTokensFull, nullSemanticTokens, true));
  conn.languages.semanticTokens.onRange(
    safeRun(service.semanticTokensRange, nullSemanticTokens, true)
  );
}
