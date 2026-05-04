import { useEffect, useState } from 'react'
import { PageType } from '../App'
import { GameArchive } from '../../../shared/types'
import ArchiveItem from '../components/ArchiveItem'

interface ArchiveScreenProps {
  onNavigate: (page: PageType) => void
}

export default function ArchiveScreen({ onNavigate }: ArchiveScreenProps) {
  const [archives, setArchives] = useState<GameArchive[]>([])
  const [selectedArchive, setSelectedArchive] = useState<GameArchive | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('cypher-archives')
    if (saved) {
      try {
        setArchives(JSON.parse(saved))
      } catch (error) {
        console.error('Error loading archives:', error)
      }
    }
  }, [])

  const handleDeleteArchive = (id: string) => {
    const filtered = archives.filter(archive => archive.id !== id)
    setArchives(filtered)
    localStorage.setItem('cypher-archives', JSON.stringify(filtered))
    setSelectedArchive(null)
  }

  const handleClearAll = () => {
    if (!archives.length) return
    const confirmed = window.confirm('Willst du wirklich alle gespeicherten Spiele loeschen?')
    if (!confirmed) return
    setArchives([])
    localStorage.removeItem('cypher-archives')
    setSelectedArchive(null)
  }

  if (selectedArchive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-3xl space-y-5">
          <button
            onClick={() => setSelectedArchive(null)}
            className="action-secondary px-5 py-3 text-xs"
          >
            Zurück zum Archiv
          </button>

          <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-6">
            <div className="text-center space-y-2">
              <p className="section-kicker">Archive Detail</p>
              <h1 className="text-4xl font-semibold text-white">Spiel Details</h1>
              <p className="display-code text-lg text-zinc-200">{selectedArchive.lobbyCode}</p>
              <p className="text-sm text-zinc-500">
                {new Date(selectedArchive.date).toLocaleString('de-DE')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.15fr] gap-4">
              <div className="surface-panel rounded-[1.5rem] p-5 space-y-3">
                <p className="section-kicker">Spieler</p>
                <p className="text-zinc-200 leading-relaxed">{selectedArchive.players.join(', ')}</p>
              </div>

              <div className="surface-panel rounded-[1.5rem] p-5 space-y-3">
                <p className="section-kicker">Texte</p>
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {selectedArchive.finalTexts.map((text, i) => (
                    <div key={i} className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-200 whitespace-pre-line">
                      <span className="mr-2 text-zinc-500 font-mono-ui">{i + 1}.</span>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  const lines = [
                    'CYPHER Archiv',
                    `Code: ${selectedArchive.lobbyCode}`,
                    `Datum: ${new Date(selectedArchive.date).toLocaleString('de-DE')}`,
                    `Spieler: ${selectedArchive.players.join(', ')}`,
                    '',
                    'Texte:',
                    ...selectedArchive.finalTexts.map((text, i) => `${i + 1}. ${text}`)
                  ]
                  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `cypher-archiv-${selectedArchive.lobbyCode}.txt`
                  document.body.appendChild(link)
                  link.click()
                  link.remove()
                  URL.revokeObjectURL(url)
                }}
                className="action-primary w-full px-6 py-4 text-sm"
              >
                Als TXT herunterladen
              </button>
              <button
                onClick={() => handleDeleteArchive(selectedArchive.id)}
                className="action-danger w-full px-6 py-4 text-sm"
              >
                Loeschen
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-5xl space-y-6">
        <div className="text-center space-y-3">
          <p className="section-kicker">Archive</p>
          <h1 className="hero-title text-[clamp(2.5rem,7vw,4.6rem)] leading-none">Vault</h1>
          <p className="text-sm text-zinc-500 font-mono-ui uppercase tracking-[0.18em]">
            {archives.length} gespeicherte Spiele
          </p>
        </div>

        {archives.length === 0 ? (
          <div className="space-y-4">
            <div className="screen-shell rounded-[2rem] p-12 text-center space-y-3">
              <p className="section-kicker">Empty Shelf</p>
              <p className="text-zinc-300">Noch keine Spiele archiviert.</p>
              <p className="text-sm text-zinc-500">
                Wenn du ein Spiel beendest, werden deine Ergebnisse hier gespeichert.
              </p>
            </div>

            <button
              onClick={() => onNavigate('menu')}
              className="action-secondary w-full px-6 py-4 text-sm"
            >
              Zurück zum Menü
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleClearAll}
              className="action-danger w-full px-6 py-4 text-sm"
            >
              Alle loeschen
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {archives.map(archive => (
                <div
                  key={archive.id}
                  onClick={() => setSelectedArchive(archive)}
                  className="cursor-pointer"
                >
                  <ArchiveItem archive={archive} />
                </div>
              ))}
            </div>

            <button
              onClick={() => onNavigate('menu')}
              className="action-secondary w-full px-6 py-4 text-sm"
            >
              Zurück zum Menü
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
