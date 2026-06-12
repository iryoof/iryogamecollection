import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/globals.css'

type MarketEvent = {
  name: string
  description: string
  demandModifier: number
  priceSensitivity: number
}

type DayOutcome = {
  day: number
  event: string
  sold: number
  revenue: number
  cost: number
  adSpend: number
  profit: number
  remainingInventory: number
}

const MARKET_DAYS = 5
const START_CASH = 100
const UNIT_COST = 8
const MAX_ORDER = 50
const MAX_PRICE = 28
const MIN_PRICE = 6
const MAX_AD = 40

const EVENTS: MarketEvent[] = [
  {
    name: 'Festival-Tag',
    description: 'Touristen strömen auf den Markt. Die Nachfrage steigt, aber die Konkurrenz bleibt präsent.',
    demandModifier: 16,
    priceSensitivity: 0.95
  },
  {
    name: 'Schlechtes Wetter',
    description: 'Der Himmel ist grau und wenige Leute spazieren vorbei. Wer günstig ist, gewinnt.',
    demandModifier: -8,
    priceSensitivity: 1.25
  },
  {
    name: 'Influencer-Post',
    description: 'Ein lokaler Streamer schwärmt von Kristallen. Werbung wirkt besonders gut.',
    demandModifier: 12,
    priceSensitivity: 0.9
  },
  {
    name: 'Polizei-Kontrolle',
    description: 'Die Lage ist angespannt. Der Markt läuft nur, wenn du clever kalkulierst.',
    demandModifier: -4,
    priceSensitivity: 1.4
  },
  {
    name: 'Stadtfest',
    description: 'Die Menge ist bereit zu kaufen. Viel Werbung kann explosive Verkäufe auslösen.',
    demandModifier: 20,
    priceSensitivity: 0.85
  }
]

const formatMoney = (value: number) => `${value >= 0 ? '€' : '-€'}${Math.abs(value).toFixed(0)}`

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min

const chooseEvent = (day: number): MarketEvent => EVENTS[(day - 1) % EVENTS.length]

export default function MarketStandGame() {
  useEffect(() => {
    document.title = 'Market Stand – Iryo Game Collection'
  }, [])

  const [day, setDay] = useState(0)
  const [cash, setCash] = useState(START_CASH)
  const [inventory, setInventory] = useState(0)
  const [orderQuantity, setOrderQuantity] = useState(15)
  const [price, setPrice] = useState(14)
  const [adBudget, setAdBudget] = useState(10)
  const [history, setHistory] = useState<DayOutcome[]>([])
  const [gameOver, setGameOver] = useState(false)
  const [message, setMessage] = useState('Starte deinen winzigen Marktstand und optimiere Preise, Einkauf und Werbung.')
  const [bestProfit, setBestProfit] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem('marketstand-best-profit')
    return stored ? Number(stored) : 0
  })

  const currentEvent = useMemo(() => (day > 0 ? chooseEvent(day) : null), [day])

  useEffect(() => {
    if (gameOver) {
      const total = history.reduce((sum, item) => sum + item.profit, 0)
      if (total > bestProfit) {
        setBestProfit(total)
        localStorage.setItem('marketstand-best-profit', String(total))
      }
    }
  }, [gameOver, history, bestProfit])

  const startNewGame = () => {
    setDay(1)
    setCash(START_CASH)
    setInventory(0)
    setOrderQuantity(15)
    setPrice(14)
    setAdBudget(10)
    setHistory([])
    setGameOver(false)
    setMessage('Der erste Markttag beginnt. Plane deinen Einkauf und setze Preise clever.')
  }

  const handleNextDay = () => {
    if (!currentEvent) return

    const eventDemand = currentEvent.demandModifier
    const adEffect = Math.floor(adBudget * 0.6)
    const priceFactor = Math.max(0, 30 - price * currentEvent.priceSensitivity)
    const randomDemand = Math.round(randomBetween(-4, 8))
    const potentialDemand = Math.max(0, 15 + eventDemand + adEffect / 3 + priceFactor + randomDemand)

    const orderCost = orderQuantity * UNIT_COST
    if (orderCost > cash) {
      setMessage('Du hast nicht genug Bargeld für den Einkauf. Verringere die Bestellmenge.')
      return
    }

    const stock = inventory + orderQuantity
    const sold = Math.min(stock, potentialDemand)
    const revenue = sold * price
    const dayCost = orderCost
    const totalDayCost = dayCost + adBudget
    const profit = revenue - totalDayCost
    const nextCash = cash + profit
    const remainingInventory = stock - sold

    const row: DayOutcome = {
      day,
      event: currentEvent.name,
      sold,
      revenue,
      cost: dayCost,
      adSpend: adBudget,
      profit,
      remainingInventory
    }

    setHistory(prev => [...prev, row])
    setCash(nextCash)
    setInventory(remainingInventory)
    setPrice(Math.max(MIN_PRICE, Math.min(MAX_PRICE, price)))
    setOrderQuantity(Math.min(MAX_ORDER, orderQuantity))
    setAdBudget(Math.min(MAX_AD, adBudget))

    if (day >= MARKET_DAYS || nextCash < 0) {
      setGameOver(true)
      setMessage(nextCash < 0 ? 'Kasse kaputt! Dein Marktstand ging pleite.' : 'Die Runde ist vorbei. Sieh dir deinen Gewinn an.')
      setDay(MARKET_DAYS)
      return
    }

    setDay(prev => prev + 1)
    setMessage('Tag abgeschlossen. Schau dir das Ergebnis an und plane den nächsten Tag.')
  }

  const eventDescription = currentEvent?.description ?? 'Du bist bereit. Starte das Spiel, um die Marktbedingungen zu sehen.'

  return (
    <div className="min-h-screen px-4 py-8 text-white relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_20%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_28%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="section-kicker">Mikro-Wirtschaftssimulation</p>
          <h1 className="hero-title">Meth Market Stand</h1>
          <p className="max-w-2xl mx-auto text-white/70">
            Führe deinen kleinen Kristall-Marktstand über {MARKET_DAYS} Tage. Kaufe, preise und wirb für dein Produkt mit kleinen Kristallen.
          </p>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="surface-panel rounded-3xl p-5">
                <p className="section-kicker">Tag</p>
                <p className="text-4xl font-semibold">{day === 0 ? '–' : day} / {MARKET_DAYS}</p>
              </div>
              <div className="surface-panel rounded-3xl p-5">
                <p className="section-kicker">Kasse</p>
                <p className="text-4xl font-semibold">{formatMoney(cash)}</p>
              </div>
              <div className="surface-panel rounded-3xl p-5">
                <p className="section-kicker">Bestand</p>
                <p className="text-4xl font-semibold">{inventory} Kristalle</p>
              </div>
              <div className="surface-panel rounded-3xl p-5">
                <p className="section-kicker">Bestscore</p>
                <p className="text-4xl font-semibold">{formatMoney(bestProfit)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="section-kicker">Marktbedingungen</p>
                  <p className="text-lg font-semibold">{currentEvent?.name ?? 'Noch nicht gestartet'}</p>
                </div>
                <div className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                  Nachfrage: {currentEvent ? currentEvent.demandModifier > 0 ? `+${currentEvent.demandModifier}` : currentEvent.demandModifier : '–'}
                </div>
              </div>
              <p className="text-sm text-white/70">{eventDescription}</p>
            </div>

            <div className="grid gap-6">
              <div className="rounded-3xl bg-[#10111a] p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="section-kicker">Einkauf</p>
                  <p className="text-sm text-zinc-400">Kosten pro Kristall: {formatMoney(UNIT_COST)}</p>
                </div>
                <input
                  type="range"
                  min="0"
                  max={MAX_ORDER}
                  value={orderQuantity}
                  onChange={event => setOrderQuantity(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-sm text-zinc-300">
                  <span>{orderQuantity} Kristalle</span>
                  <span>{formatMoney(orderQuantity * UNIT_COST)}</span>
                </div>
              </div>

              <div className="rounded-3xl bg-[#10111a] p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="section-kicker">Preis pro Kristall</p>
                  <p className="text-sm text-zinc-400">Hoher Preis reduziert Nachfrage.</p>
                </div>
                <input
                  type="range"
                  min={MIN_PRICE}
                  max={MAX_PRICE}
                  value={price}
                  onChange={event => setPrice(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-sm text-zinc-300">
                  <span>{price} €</span>
                  <span>{price <= 10 ? 'Billig' : price <= 18 ? 'Standard' : 'Premium'}</span>
                </div>
              </div>

              <div className="rounded-3xl bg-[#10111a] p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="section-kicker">Werbebudget</p>
                  <p className="text-sm text-zinc-400">Mehr Sichtbarkeit, mehr Nachfrage.</p>
                </div>
                <input
                  type="range"
                  min="0"
                  max={MAX_AD}
                  value={adBudget}
                  onChange={event => setAdBudget(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-sm text-zinc-300">
                  <span>{adBudget} €</span>
                  <span>{adBudget === 0 ? 'Keine Werbung' : 'Anzeigen aktiv'}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                onClick={day > 0 ? handleNextDay : startNewGame}
                className="action-primary w-full px-6 py-4 text-sm"
              >
                {day > 0 ? (gameOver ? 'Neues Spiel starten' : 'Tag abschließen') : 'Spiel starten'}
              </button>
              {day > 0 && (
                <button
                  onClick={startNewGame}
                  className="action-secondary w-full px-6 py-4 text-sm"
                >
                  Neustarten
                </button>
              )}
            </div>

            <div className="rounded-3xl bg-[#0f172a] p-5 border border-white/10">
              <p className="section-kicker">Status</p>
              <p className="text-sm text-white/70">{message}</p>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="screen-shell rounded-[2rem] p-6 md:p-8 space-y-5">
              <div className="flex items-start gap-4">
                <div className="rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)] p-4 text-2xl">💎</div>
                <div>
                  <p className="section-kicker">Produkt</p>
                  <h2 className="text-2xl font-semibold">Meth Kristalle</h2>
                  <p className="text-sm text-white/70">Mega elastisher Torwart Hut für den Marktstand.</p>
                </div>
              </div>

              <div className="rounded-3xl bg-[#10111a] p-5 space-y-4">
                <p className="section-kicker">Spielziel</p>
                <ul className="list-disc list-inside text-sm text-white/70 space-y-2">
                  <li>Beende {MARKET_DAYS} Tage mit möglichst viel Gewinn.</li>
                  <li>Passe Preise und Werbung an das Marktgeschehen an.</li>
                  <li>Achte auf deine Bargeldreserve, damit du weiter einkaufen kannst.</li>
                </ul>
              </div>

              <div className="rounded-3xl bg-[#10111a] p-5 space-y-3">
                <p className="section-kicker">Tagesübersicht</p>
                {history.length === 0 ? (
                  <p className="text-sm text-white/70">Noch keine Ergebnisse. Starte das Spiel, um deinen ersten Tag zu spielen.</p>
                ) : (
                  <div className="space-y-3">
                    {history.slice(-3).reverse().map(entry => (
                      <div key={entry.day} className="rounded-3xl bg-white/5 p-3">
                        <p className="font-semibold">Tag {entry.day} – {entry.event}</p>
                        <p className="text-xs text-zinc-400">Verkauft: {entry.sold} Kristalle</p>
                        <p className="text-xs text-zinc-400">Gewinn: {formatMoney(entry.profit)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Link
              to="/"
              className="action-ghost block w-full text-center px-6 py-4 rounded-3xl"
            >
              Zurück zur Game Collection
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
