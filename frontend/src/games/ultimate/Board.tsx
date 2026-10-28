import type { Move, UltimateBoard } from './types'

interface BoardProps {
  board: UltimateBoard
  /** Erlaubte Zuege, fertig vom Server gerechnet. */
  legal: Move[]
  /** Ob *dieser* Besucher hier gerade setzen darf. */
  canPlay: boolean
  onPlay: (sub: number, cell: number) => void
  label: string
  note: string
}

export default function Board({ board, legal, canPlay, onPlay, label, note }: BoardProps) {
  // Nachschlagewerk statt verschachtelter Suche: bei 81 Zellen sonst 81 mal
  // durch die Zugliste.
  const legalKeys = new Set(legal.map(move => `${move.sub}:${move.cell}`))

  return (
    <div className="zt-board-wrap">
      <div className="zt-board-label">
        <span>{label}</span>
        <span>{note}</span>
      </div>

      <div className="zt-board">
        {board.subs.map((sub, subIndex) => {
          const decided = sub.result !== null
          // Das vorgegebene Feld sehen alle, nicht nur wer dran ist — sonst
          // kann der Partner nicht mitdenken.
          const forced = board.forcedSub === subIndex && !decided && board.result === null

          const classes = ['zt-sub']
          if (forced) classes.push('zt-sub--forced')
          if (decided) classes.push('zt-sub--decided')

          return (
            <div key={subIndex} className={classes.join(' ')}>
              {sub.cells.map((cell, cellIndex) => {
                const playable = canPlay && legalKeys.has(`${subIndex}:${cellIndex}`)

                return (
                  <button
                    key={cellIndex}
                    type="button"
                    className={playable ? 'zt-cell zt-cell--legal' : 'zt-cell'}
                    disabled={!playable}
                    onClick={() => onPlay(subIndex, cellIndex)}
                    aria-label={`Feld ${subIndex + 1}, Zelle ${cellIndex + 1}${cell ? `, belegt mit ${cell}` : ''}`}
                  >
                    {cell ?? ''}
                  </button>
                )
              })}

              {decided && (
                <span className={sub.result === 'draw' ? 'zt-sub-stamp zt-sub-stamp--draw' : 'zt-sub-stamp'}>
                  {sub.result === 'draw' ? 'REMIS' : sub.result}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
