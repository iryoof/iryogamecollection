import { useState } from 'react'

interface TextInputProps {
  onSubmit: (text: string) => void
  maxLines?: number
  placeholder?: string
  isDisabled?: boolean
}

export default function TextInput({
  onSubmit,
  maxLines = 2,
  placeholder = 'Schreibe deine Zeilen...',
  isDisabled = false
}: TextInputProps) {
  const [text, setText] = useState('')
  const lineCount = text.split('\n').length

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text)
      setText('')
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      handleSubmit()
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="relative">
        <textarea
          value={text}
          onChange={event => setText(event.target.value.slice(0, 500))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={maxLines + 1}
          maxLength={500}
          className="w-full rounded-[1.5rem] px-5 py-4 text-base leading-relaxed placeholder:text-zinc-600 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="absolute bottom-3 right-4 text-[11px] text-zinc-600 font-mono-ui">
          {text.length}/500
        </div>
      </div>

      <div className="flex justify-between items-center gap-4">
        <div className="text-xs text-zinc-500 font-mono-ui uppercase tracking-[0.14em]">
          Zeilen: {lineCount}/{maxLines}
        </div>
        <button
          onClick={handleSubmit}
          disabled={isDisabled || !text.trim() || lineCount > maxLines}
          className="action-primary px-5 py-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Senden
        </button>
      </div>
    </div>
  )
}
