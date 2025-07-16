import { linter, lintGutter, type Diagnostic, type LintSource } from '@codemirror/lint'
import { LSPPlugin } from '@codemirror/lsp-client'
import { MapMode, StateEffect, StateField, type EditorState, type Extension, type Text } from '@codemirror/state'
import type * as lsp from 'vscode-languageserver-protocol'

const setPublishedDiagnostics = StateEffect.define<Diagnostic[]>()

export function storeLspDiagnostics(plugin: LSPPlugin, lspDiags: lsp.Diagnostic[], doc: Text) {
  const result: Diagnostic[] = []

  for (const diag of lspDiags) {
    let from: number, to: number
    try {
      from = plugin.fromPosition(diag.range.start, doc)
      to = plugin.fromPosition(diag.range.end, doc)
    } catch (e) { continue }
    if (to > doc.length) continue

    const severity = severities[diag.severity ?? 0]
    const { message } = diag
    const source = diag.code ? `${diag.source ? `${diag.source}-` : ''}${diag.code}` : undefined
    result.push({
      from, to, severity, message, source,
    })
  }

  return setPublishedDiagnostics.of(result)
}

// the index 0 maps to something arbitrary as per spec
const severities = ['hint', 'error', 'warning', 'info', 'hint'] as const

const lspPublishedDiagnostics = StateField.define<Diagnostic[]>({
  create() { return [] },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPublishedDiagnostics)) {
        value = e.value
      }
    }
    return value
  }
})

export function lspLinter(): Extension {
  return [
    lspPublishedDiagnostics,
    lintGutter(),
    linter(lspLinterSource, {
      needsRefresh(update) {
        return update.transactions.some(tr => tr.effects.some(e => e.is(setPublishedDiagnostics)))
      },
      autoPanel: true,
    }),
  ]
}

const lspLinterSource: LintSource = view => {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return []
  return getDiagnostics(plugin, view.state)
}

async function getDiagnostics(plugin: LSPPlugin, state: EditorState) {
  const cs = plugin.unsyncedChanges
  plugin.client.sync()
  const diags = state.field(lspPublishedDiagnostics)
  const result: Diagnostic[] = []
  for (const {from: ff, to: tt, ...diag} of diags) {
    const from = cs.mapPos(ff, 1, MapMode.TrackDel)
    const to = cs.mapPos(tt, -1, MapMode.TrackDel)
    if (from != null && to != null) {
      result.push({...diag, from, to})
    }
  }
  return result
}
