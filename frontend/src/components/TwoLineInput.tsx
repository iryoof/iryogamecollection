import { useState } from 'react'

interface TwoLineInputProps {
  onSubmit: (text: string) => void
  isDisabled?: boolean
  placeholder1?: string
  placeholder2?: string
}

export default function TwoLineInput({
  onSubmit,
  isDisabled = false,
  placeholder1 = 'Zeile 1...',
  placeholder2 = 'Zeile 2...'
}: TwoLineInputProps) {
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')

  const canSubmit = line1.trim() && line2.trim()

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(`${line1}\n${line2}`)
    setLine1('')
    setLine2('')
  }

  return (
    <div className="w-full space-y-3">
      <div className="space-y-2">
        <input
          value={line1}
          onChange={event => setLine1(event.target.value.slice(0, 250))}
          placeholder={placeholder1}
          disabled={isDisabled}
          className="w-full rounded-[1.5rem] px-5 py-4 text-base placeholder:text-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <input
          value={line2}
          onChange={event => setLine2(event.target.value.slice(0, 250))}
          placeholder={placeholder2}
          disabled={isDisabled}
          className="w-full rounded-[1.5rem] px-5 py-4 text-base placeholder:text-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex justify-between items-center gap-4">
        <div className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.14em]">
          Zeilen: 2/2
        </div>
        <button
          onClick={handleSubmit}
          disabled={isDisabled || !canSubmit}
          className="action-primary px-5 py-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Senden
        </button>
      </div>
    </div>
  )
}
