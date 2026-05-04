import { GameArchive } from '../../../shared/types'

interface ArchiveItemProps {
  archive: GameArchive
}

export default function ArchiveItem({ archive }: ArchiveItemProps) {
  const date = new Date(archive.date)
  const dateStr = date.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="screen-shell rounded-[1.75rem] p-5 hover:border-white/20 transition cursor-pointer">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="space-y-1">
          <p className="section-kicker">Archive Entry</p>
          <h4 className="text-xl font-semibold text-white">Code {archive.lobbyCode}</h4>
          <p className="text-sm text-zinc-500">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-white">{archive.players.length}</p>
          <p className="section-kicker">Spieler</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.12em]">
          {archive.players.join(', ')}
        </p>
        <div className="surface-panel rounded-[1.25rem] p-3 max-h-32 overflow-y-auto">
          <div className="text-xs text-zinc-300 space-y-2 leading-relaxed">
            {archive.finalTexts.slice(0, 5).map((text, i) => (
              <p key={i} className="truncate">
                {text}
              </p>
            ))}
            {archive.finalTexts.length > 5 && (
              <p className="text-zinc-600">... und {archive.finalTexts.length - 5} weitere Zeilen</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
