import { forceLinting } from '@codemirror/lint'
import {
  languageServerSupport,
  LSPClient,
  LSPPlugin,
  type Transport,
} from '@codemirror/lsp-client'
import type { Extension, Text } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type * as lsp from 'vscode-languageserver-protocol'

import { lspLinter, storeLspDiagnostics } from './diag'
import { createLanguageServer } from './vtsls'

export { doc } from './doc'

export const basicTheme = EditorView.baseTheme({
  '&': {
    margin: '8px 0',
    height: 'calc(100dvh - 16px)',
    border: '1px solid #eee',
    background: '#f3f3f3',
    fontSize: '12px',
    '--fontMono': 'Fira Mono',
  },
  '.cm-scroller, .cm-lsp-documentation pre, .cm-lsp-signature-tooltip .cm-lsp-signature': {
    fontFamily: 'var(--font-mono)',
  },
  '.cm-lsp-documentation pre code': {
    fontFamily: 'inherit',
  },
})

function createTsTransport(): [Transport, () => void] {
  const {port1: portForCM, port2: portForLanguageServer} = new MessageChannel()

  const vtsls = createLanguageServer(portForLanguageServer, {
    extensionUri: window.origin + '/vtsls',
    settings: {
      typescript: {
        locale: 'zh-TW',
        // tsserver: {
        //   log: 'verbose',
        // },
      },
    },
  });

  // LS -> CM
  portForCM.onmessage = function(ev) {
    if (ev.data?.method?.indexOf('logMessage') >= 0) {
      console.warn(ev.data.params.message.replace(/\\n/g, '\n').replace(/\\\\/g, '\\'))
    } else {
      console.log('CM <--', ev.data)
    }
    const resp = JSON.stringify(ev.data)
    handlers.forEach((cb) => cb(resp))
  }

  vtsls.listen()

  let handlers = [] as ((value: string) => void)[]
  return [{
    send(message) {  // CM -> LS
      const payload = JSON.parse(message)
      console.log('CM -->', payload)
      portForCM.postMessage(payload)
    },
    subscribe(handler) { handlers.push(handler) },
    unsubscribe(handler) { handlers = handlers.filter(h => h != handler) },
  }, vtsls.dispose.bind(vtsls)]
}

export const tsLspClient = function(): Extension {
  const mainFilePath = 'file:///workspace/index.ts'
  const [transport, disposeTsTransport] = createTsTransport()
  const client = new LSPClient({
    rootUri: '/workspace',
    notificationHandlers: {
      'textDocument/publishDiagnostics': (client, params: lsp.PublishDiagnosticsParams) => {
        let doc: Text | undefined
        let view: EditorView | null | undefined
        for (const f of client.workspace.files) {
          if (f.uri === params.uri && (view = f.getView())) {
            doc = f.doc
            break
          }
        }
        if (!doc || !view) return false

        const plugin = LSPPlugin.get(view)
        if (!plugin) return false

        view.dispatch({
          effects: storeLspDiagnostics(plugin, params.diagnostics, doc),
        })
        forceLinting(view)
        return true
      }
    },
  }).connect(transport)

  return [
    languageServerSupport(client, mainFilePath),
    lspLinter(),
    // FIXME: (HMR) because the transport function is sync while the disposal is async
    // this cleanup is rigged and is bound to fail
    ViewPlugin.define(() => ({
      destroy: disposeTsTransport,
    })),
  ]
}
