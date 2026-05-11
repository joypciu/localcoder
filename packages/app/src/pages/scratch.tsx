import "./scratch.css"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"

type ScratchDoc = {
  id: string
  name: string
  content: string
  saved: string
}

const STORAGE_KEY = "localcoder.scratch.docs"
const ACTIVE_KEY = "localcoder.scratch.active"

const starter = (): ScratchDoc => ({
  id: crypto.randomUUID(),
  name: "Untitled.txt",
  content: "",
  saved: "",
})

function readDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as ScratchDoc[]) : []
    return parsed.length ? parsed : [starter()]
  } catch {
    return [starter()]
  }
}

function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const node = document.createElement("textarea")
  node.value = text
  node.style.position = "fixed"
  node.style.opacity = "0"
  document.body.append(node)
  node.select()
  document.execCommand("copy")
  node.remove()
  return Promise.resolve()
}

export default function ScratchPage() {
  let editor!: HTMLTextAreaElement
  let fileInput!: HTMLInputElement
  const [docs, setDocs] = createSignal(readDocs())
  const [activeID, setActiveID] = createSignal(localStorage.getItem(ACTIVE_KEY) ?? docs()[0].id)
  const [find, setFind] = createSignal("")
  const [replace, setReplace] = createSignal("")
  const [menu, setMenu] = createSignal<{ x: number; y: number }>()
  const active = createMemo(() => docs().find((doc) => doc.id === activeID()) ?? docs()[0])
  const selection = () => editor.value.slice(editor.selectionStart, editor.selectionEnd)
  const lineCount = createMemo(() => Math.max(1, active().content.split("\n").length))
  const dirty = (doc: ScratchDoc) => doc.content !== doc.saved
  const cursor = createMemo(() => {
    const before = active().content.slice(0, editor?.selectionStart ?? 0)
    return {
      line: before.split("\n").length,
      col: before.length - before.lastIndexOf("\n"),
    }
  })

  createEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs()))
    localStorage.setItem(ACTIVE_KEY, activeID())
  })

  const closeMenu = () => setMenu(undefined)
  document.addEventListener("click", closeMenu)
  onCleanup(() => document.removeEventListener("click", closeMenu))

  function updateActive(content: string) {
    setDocs((items) => items.map((doc) => (doc.id === activeID() ? { ...doc, content } : doc)))
  }

  function createDoc() {
    const doc = starter()
    setDocs((items) => [...items, doc])
    setActiveID(doc.id)
    queueMicrotask(() => editor?.focus())
  }

  function closeDoc(id: string) {
    const next = docs().filter((doc) => doc.id !== id)
    setDocs(next.length ? next : [starter()])
    if (id === activeID()) setActiveID((next[0] ?? docs()[0]).id)
  }

  async function openFiles(files: FileList | null) {
    if (!files?.length) return
    const opened = await Promise.all(
      [...files].map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        content: await file.text(),
        saved: await file.text(),
      })),
    )
    setDocs((items) => [...items, ...opened])
    setActiveID(opened[0].id)
  }

  function downloadDoc() {
    const blob = new Blob([active().content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = active().name
    link.click()
    URL.revokeObjectURL(url)
    setDocs((items) => items.map((doc) => (doc.id === activeID() ? { ...doc, saved: doc.content } : doc)))
  }

  async function copySelectionOrAll() {
    await writeClipboard(selection() || active().content)
  }

  async function cutSelection() {
    if (!selection()) return
    await writeClipboard(selection())
    document.execCommand("delete")
    updateActive(editor.value)
  }

  async function pasteClipboard() {
    const text = await navigator.clipboard?.readText?.().catch(() => "")
    if (!text) return
    document.execCommand("insertText", false, text)
    updateActive(editor.value)
  }

  function selectWord() {
    const text = editor.value
    const at = editor.selectionStart
    const index = Math.max(0, Math.min(at, text.length - 1))
    if (!/\S/.test(text[index] ?? "")) return
    const start = text.slice(0, index + 1).search(/\S+$/)
    const right = text.slice(index).search(/\s/)
    editor.setSelectionRange(start, right === -1 ? text.length : index + right)
    editor.focus()
  }

  function findNext() {
    const query = find()
    if (!query) return
    const start = editor.selectionEnd
    const index = active().content.indexOf(query, start)
    const wrapped = index === -1 ? active().content.indexOf(query) : index
    if (wrapped === -1) return
    editor.setSelectionRange(wrapped, wrapped + query.length)
    editor.focus()
  }

  function replaceCurrent() {
    if (!find() || selection() !== find()) {
      findNext()
      return
    }
    document.execCommand("insertText", false, replace())
    updateActive(editor.value)
  }

  function replaceAll() {
    if (!find()) return
    updateActive(active().content.split(find()).join(replace()))
  }

  function copyForCli() {
    void writeClipboard(selection() || active().content)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      downloadDoc()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
      event.preventDefault()
      fileInput.click()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault()
      createDoc()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault()
      document.getElementById("scratch-find")?.focus()
    }
  }

  return (
    <div class="scratch-app" onKeyDown={handleKeyDown}>
      <div class="scratch-menubar">
        <div class="scratch-title">LocalCoder Scratch</div>
        <button class="scratch-button" type="button" onClick={createDoc}>New</button>
        <button class="scratch-button" type="button" onClick={() => fileInput.click()}>Open</button>
        <button class="scratch-button" type="button" onClick={downloadDoc}>Save As</button>
        <button class="scratch-button" type="button" onClick={copyForCli}>Copy for CLI</button>
        <input ref={fileInput} hidden multiple type="file" onChange={(event) => void openFiles(event.currentTarget.files)} />
      </div>

      <aside class="scratch-sidebar">
        <div class="scratch-sidebar-head">
          <span>Documents</span>
          <button class="scratch-button" type="button" onClick={createDoc}>+</button>
        </div>
        <div class="scratch-tab-list">
          <For each={docs()}>
            {(doc) => (
              <button class="scratch-tab" data-active={doc.id === activeID()} type="button" onClick={() => setActiveID(doc.id)}>
                <span class="scratch-tab-name">{doc.name}</span>
                <span class="scratch-tab-mark" onClick={(event) => { event.stopPropagation(); closeDoc(doc.id) }}>
                  {dirty(doc) ? "*" : "x"}
                </span>
              </button>
            )}
          </For>
        </div>
      </aside>

      <main class="scratch-main">
        <div class="scratch-toolbar">
          <input
            class="scratch-input"
            value={active().name}
            onInput={(event) => setDocs((items) => items.map((doc) => doc.id === activeID() ? { ...doc, name: event.currentTarget.value } : doc))}
          />
          <input id="scratch-find" class="scratch-input" placeholder="Find" value={find()} onInput={(event) => setFind(event.currentTarget.value)} />
          <input class="scratch-input" placeholder="Replace" value={replace()} onInput={(event) => setReplace(event.currentTarget.value)} />
          <button class="scratch-button" type="button" onClick={findNext}>Find Next</button>
          <button class="scratch-button" type="button" onClick={replaceCurrent}>Replace</button>
          <button class="scratch-button" type="button" onClick={replaceAll}>Replace All</button>
        </div>

        <div class="scratch-editor-wrap">
          <pre class="scratch-lines">{Array.from({ length: lineCount() }, (_, index) => index + 1).join("\n")}</pre>
          <textarea
            ref={editor}
            class="scratch-editor"
            spellcheck={false}
            value={active().content}
            onInput={(event) => updateActive(event.currentTarget.value)}
            onDblClick={selectWord}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY })
            }}
          />
        </div>
      </main>

      <div class="scratch-status">
        <span>{active().name}{dirty(active()) ? " *" : ""}</span>
        <span>Ln {cursor().line}, Col {cursor().col} | {active().content.length} chars | {lineCount()} lines</span>
      </div>

      <Show when={menu()}>
        {(pos) => (
          <div class="scratch-menu" style={{ left: `${pos().x}px`, top: `${pos().y}px` }} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { selectWord(); closeMenu() }}>Select Word</button>
            <button type="button" onClick={() => { void copySelectionOrAll(); closeMenu() }}>Copy</button>
            <button type="button" onClick={() => { void cutSelection(); closeMenu() }}>Cut</button>
            <button type="button" onClick={() => { void pasteClipboard(); closeMenu() }}>Paste</button>
            <button type="button" onClick={() => { editor.select(); closeMenu() }}>Select All</button>
          </div>
        )}
      </Show>
    </div>
  )
}
