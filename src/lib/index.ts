import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import {
  languageServerSupport,
  LSPClient,
  type Transport,
} from '@codemirror/lsp-client'
import { serverSupportedCapabilities } from './cap'

import ts from 'typescript'
import * as vfs from '@typescript/vfs'

import {
  createConnection,
  ProposedFeatures,
  BrowserMessageReader,
  BrowserMessageWriter,
  type InitializeParams,
  type Connection,
} from 'vscode-languageserver/browser'

export const doc = `import {basicSetup, EditorView} from "codemirror"
import {javascript} from "@codemirror/lang-javascript"

new EditorView({
  doc: "console.log('hello')\\n",
  extensions: [basicSetup, javascript()],
  parent: document.body
})
`

export const basicTheme = EditorView.baseTheme({
  '&': {
    border: '1px solid #eee',
    fontSize: '12px',
  },
  '.cm-scroller, .cm-lsp-hover-tooltip': {
    fontFamily: 'Fira Mono',
  },
})

function bindConnectionHandlers(connection: Connection, tsEnv: vfs.VirtualTypeScriptEnvironment) {
  connection.onHover(params => {
    const file = tsEnv.getSourceFile(params.textDocument.uri)
    if (!file) return null
    const pos = file.getPositionOfLineAndCharacter(params.position.line, params.position.character)
    const data = tsEnv.languageService.getQuickInfoAtPosition(params.textDocument.uri, pos)?.displayParts?.map(x => x.text).join('')
    return data ? {
      contents: data,
    } : null
  })

  connection.onDidOpenTextDocument((params) => {
    tsEnv.updateFile(params.textDocument.uri, params.textDocument.text)
  })

  connection.onDidChangeTextDocument((params) => {
    params.contentChanges.forEach((ch) => {
      if ('range' in ch) {
        // incremental
        const file = tsEnv.getSourceFile(params.textDocument.uri)!
        const start = file.getPositionOfLineAndCharacter(ch.range.start.line, ch.range.start.character)
        const end = file.getPositionOfLineAndCharacter(ch.range.end.line, ch.range.end.character)
        const length = end - start
        tsEnv?.updateFile(params.textDocument.uri, ch.text, {start, length})
      } else {
        // all
        tsEnv?.updateFile(params.textDocument.uri, ch.text)
      }
    })
  })
}

function createTsTransport(mainFilePath: string): Transport {
  const {port1: portForCM, port2: portForLanguageServer} = new MessageChannel()
  const messageReader = new BrowserMessageReader(portForLanguageServer)
  const messageWriter = new BrowserMessageWriter(portForLanguageServer)
  const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter)

  // LS -> CM
  portForCM.onmessage = function(ev) {
    console.log('CM <--', ev.data)
    const resp = JSON.stringify(ev.data)
    handlers.forEach((cb) => cb(resp))
  }

  // make them binded in "onInitialized", so that tsEnv is definitely not null

  connection.onInitialize((params: InitializeParams) => {
    connection.onInitialized(async () => {
      const {createSystem, createVirtualTypeScriptEnvironment, createDefaultMapFromCDN} = vfs;
      const fsMap = await createDefaultMapFromCDN({target: ts.ScriptTarget.ES2022}, ts.version, true, ts);
      const system = createSystem(fsMap);
      const tsEnv = createVirtualTypeScriptEnvironment(system, [], ts, {allowJs: true});
      tsEnv.createFile(mainFilePath, ' ');
      bindConnectionHandlers(connection, tsEnv)

      console.log('inited!')
    })

    return {
      capabilities: serverSupportedCapabilities as any,
      serverInfo: { name: "@typescript/vfs", version: '9999' },
    }
  })

  connection.listen()

  let handlers = [] as ((value: string) => void)[]
  return {
    send(message) {  // CM -> LS
      const payload = JSON.parse(message)
      console.log('CM -->', payload)
      portForCM.postMessage(payload)
    },
    subscribe(handler) { handlers.push(handler) },
    unsubscribe(handler) { handlers = handlers.filter(h => h != handler) },
  }
}

export const tsLspClient = function(): Extension {
  const mainFilePath = 'file:///workspace/index.ts'
  const transport = createTsTransport(mainFilePath)
  const client = new LSPClient().connect(transport)

  return [languageServerSupport(client, mainFilePath)]
}
