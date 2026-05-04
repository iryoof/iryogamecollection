import { formatTime } from '../hooks/useTimer'

interface TimerProps {
  timeLeft: number
  isRunning: boolean
  timerEnabled: boolean
}

export default function Timer({ timeLeft, isRunning, timerEnabled }: TimerProps) {
  if (!timerEnabled) return null

  const isWarning = timeLeft <= 10
  const isCritical = timeLeft <= 5

  const stateClass = isCritical
    ? 'border-red-400/40 bg-red-500/10 text-red-200'
    : isWarning
    ? 'border-white/20 bg-white/10 text-white'
    : isRunning
    ? 'border-white/14 bg-white/[0.05] text-zinc-100'
    : 'border-white/10 bg-white/[0.03] text-zinc-500'

  return (
    <div className={`screen-shell rounded-[1.5rem] px-6 py-5 text-center transition ${stateClass}`}>
      <div className="section-kicker mb-2 text-inherit">Round Timer</div>
      <div className="text-4xl md:text-5xl font-semibold tracking-[-0.04em]">
        {formatTime(timeLeft)}
      </div>
    </div>
  )
}
