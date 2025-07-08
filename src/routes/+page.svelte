<script>
  import { basicSetup } from 'codemirror'
  import { EditorView } from '@codemirror/view'
  import { typescriptLanguage } from '@codemirror/lang-javascript'
  import { doc, basicTheme, tsLspClient } from '$lib'

  /** @type {null | EditorView} */
  let cmView

  /** @param {HTMLElement} dom */
  function codemirror(dom) {
    cmView = new EditorView({
      doc,
      parent: dom,
      extensions: [
        basicSetup, 
        basicTheme,
        typescriptLanguage,
        tsLspClient(),
      ],
    })

    return () => { cmView?.destroy() }
  }

</script>

<div {@attach codemirror}>
</div>
