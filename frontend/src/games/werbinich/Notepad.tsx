import { useState } from 'react'

export default function Notepad() {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')

  return (
    <>
      <button
        className={`fixed bottom-6 right-6 z-40 rounded-full border px-4 py-4 font-mono-ui text-xs uppercase tracking-[0.14em] transition ${
          open
            ? 'border-white/30 bg-white text-black'
            : 'border-white/12 bg-black/70 text-zinc-300 hover:bg-white/10'
        }`}
        onClick={() => setOpen(current => !current)}
        title="Notizblock"
      >
        Notizen
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[min(24rem,calc(100vw-2rem))] screen-shell rounded-[1.5rem] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="section-kicker">Notizblock</p>
              <h4 className="text-sm font-semibold text-white">Private Gedanken</h4>
            </div>
            <button
              className="text-zinc-400 hover:text-white text-xl leading-none"
              onClick={() => setOpen(false)}
              aria-label="Notizblock schließen"
            >
              ×
            </button>
          </div>
          <textarea
            className="h-72 w-full resize-none border-0 bg-transparent px-4 py-4 text-sm leading-relaxed text-zinc-200 outline-none"
            placeholder="Deine Notizen..."
            value={notes}
            onChange={event => setNotes(event.target.value)}
          />
        </div>
      )}
    </>
  )
}
