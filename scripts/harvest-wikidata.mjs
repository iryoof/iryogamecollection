// Holt Schwedenrätsel-Wörter aus Wikidata und schreibt sie als Kategoriedateien
// nach frontend/src/games/schwedenraetsel/words/.
//
// Warum Wikidata: Labels und Kurzbeschreibungen stehen dort unter CC0, also
// gemeinfrei — für eine öffentlich gehostete Seite die einzige der großen
// Quellen ohne Namensnennungs- und Share-Alike-Pflicht. Wiktionary wäre größer,
// steht aber unter CC BY-SA.
//
// Die Beschreibung ist als Rätselfrage brauchbar, weil sie von Haus aus kurz
// ist ("Stadt in Italien", "Tierart"). Wo sie zu lang oder zu nichtssagend ist,
// setzt der Spec-Text ein.
//
// Nicht enthalten: Himmelskoerper. WDQS liefert fuer die Abfrage reproduzierbar
// eine abgeschnittene JSON-Antwort, und der Ertrag waere mit 18 Eintraegen die
// Muehe nicht wert gewesen - fast alles sind Katalognummern statt Woerter.
//
// Nicht enthalten: Pflanzen. Die Abfrage ueber den Pflanzen-Taxonbaum
// (P171* wd:Q756) laeuft bei WDQS zuverlaessig in den Timeout (HTTP 502), auch
// mit hoher Sitelink-Schwelle. Wer es erneut versucht, braucht einen engeren
// Einstieg als das ganze Pflanzenreich.
//
// Aufruf: node scripts/harvest-wikidata.mjs [--limit N] [--dry]
//   --limit  Obergrenze je Abfrage (Standard 4000)
//   --dry    nur berichten, nichts schreiben
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORDS_DIR = path.join(__dirname, '..', 'frontend', 'src', 'games', 'schwedenraetsel', 'words')
const ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT =
  'IryoGamecollection-WordHarvest/1.0 (https://github.com/iryoof/iryogamecollection)'

// Muss zu check-woerter.mjs passen: längere Fragen passen nicht ins Gitter.
const MAX_CLUE = 38
// Unter 3 Buchstaben nimmt buildPool den Eintrag ohnehin nicht, über 14 wird er
// für ein 11er-Gitter unbrauchbar.
const MIN_ANSWER = 3
const MAX_ANSWER = 14
// Wie oft dieselbe Frage im ganzen Ertrag vorkommen darf. Ohne diese Grenze
// bestünde die Hälfte des Pools aus „Gemeinde in Frankreich".
//
// Das reicht allein nicht: "Fluss in Italien" und "Fluss in Spanien" sind
// verschiedene Fragen, und Geografie liefert so viel, dass ein Gitter sonst zu
// zwei Dritteln aus Flüssen besteht. Deshalb hat jede ergiebige Abfrage
// zusätzlich ein `max`.
const MAX_PER_CLUE = 8

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 4000
// Mit --only laesst sich eine einzelne Abfrage nachholen, ohne die uebrigen
// Dateien neu zu schreiben - WDQS liefert unter Last gelegentlich abgeschnittene
// Antworten, und dann fehlt genau eine Kategorie.
const ONLY = args.includes('--only')
  ? (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean)
  : null

/**
 * Eine Abfrage. `sparql` muss ?label und optional ?desc sowie ?extra liefern.
 * `fallback` ist die Frage, wenn die Beschreibung fehlt oder unbrauchbar ist;
 * `%s` darin wird durch ?extra ersetzt.
 */
const SPECS = [
  // --- Natur & Tiere -------------------------------------------------------
  {
    id: 'wd-tiere',
    max: 600,
    category: 'natur',
    categoryLabel: "Natur & Tiere",
    file: 'wdTiere',
    label: 'Tiere (Wikidata)',
    fallback: 'Tierart',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P105 wd:Q7432 ; wdt:P171* wd:Q5113 ;
              wikibase:sitelinks ?links .
        FILTER(?links >= 25)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-saeuger',
    max: 400,
    category: 'natur',
    categoryLabel: "Natur & Tiere",
    file: 'wdSaeuger',
    label: 'Säugetiere (Wikidata)',
    fallback: 'Säugetier',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P105 wd:Q7432 ; wdt:P171* wd:Q7377 ;
              wikibase:sitelinks ?links .
        FILTER(?links >= 20)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  // --- Geografie -----------------------------------------------------------
  {
    id: 'wd-staedte',
    max: 300,
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdStaedte',
    label: 'Städte (Wikidata)',
    fallback: 'Stadt in %s',
    sparql: limit => `
      SELECT ?label ?desc ?extra WHERE {
        ?item wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 ?land ;
              wikibase:sitelinks ?links .
        FILTER(?links >= 60)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?land rdfs:label ?extra FILTER(lang(?extra)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-fluesse',
    max: 300,
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdFluesse',
    label: 'Flüsse (Wikidata)',
    fallback: 'Fluss in %s',
    sparql: limit => `
      SELECT ?label ?desc ?extra WHERE {
        ?item wdt:P31 wd:Q4022 ; wdt:P17 ?land ; wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?land rdfs:label ?extra FILTER(lang(?extra)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-berge',
    max: 200,
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdBerge',
    label: 'Berge (Wikidata)',
    fallback: 'Berg in %s',
    sparql: limit => `
      SELECT ?label ?desc ?extra WHERE {
        ?item wdt:P31 wd:Q8502 ; wdt:P17 ?land ; wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?land rdfs:label ?extra FILTER(lang(?extra)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-inseln',
    max: 200,
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdInseln',
    label: 'Inseln (Wikidata)',
    fallback: 'Insel in %s',
    sparql: limit => `
      SELECT ?label ?desc ?extra WHERE {
        ?item wdt:P31 wd:Q23442 ; wdt:P17 ?land ; wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?land rdfs:label ?extra FILTER(lang(?extra)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-seen',
    max: 120,
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdSeen',
    label: 'Seen (Wikidata)',
    fallback: 'See in %s',
    sparql: limit => `
      SELECT ?label ?desc ?extra WHERE {
        ?item wdt:P31 wd:Q23397 ; wdt:P17 ?land ; wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?land rdfs:label ?extra FILTER(lang(?extra)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },

  {
    id: 'wd-meere',
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdMeere',
    label: 'Meere (Wikidata)',
    fallback: 'Meer oder Bucht',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q165 ; wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-orte-de',
    category: 'geografie',
    categoryLabel: "Geografie",
    file: 'wdOrteDe',
    label: 'Orte in Deutschland (Wikidata)',
    // Der Landkreis macht die Frage von Ort zu Ort verschieden - ohne ihn
    // stuenden hier tausendmal "Gemeinde in Deutschland".
    fallback: 'Ort im %s',
    maxPerClue: 4,
    ignoreDescription: true,
    sparql: limit => `
      SELECT ?label ?extra WHERE {
        ?item wdt:P31 wd:Q262166 ; wdt:P131 ?kreis ; wikibase:sitelinks ?links .
        FILTER(?links >= 8)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        ?kreis rdfs:label ?extra FILTER(lang(?extra)="de")
        FILTER(STRSTARTS(STR(?extra), "Landkreis"))
      } LIMIT ${limit}`
  },
  {
    id: 'wd-vornamen',
    max: 250,
    category: 'menschSprache',
    categoryLabel: "Mensch & Sprache",
    file: 'wdVornamen',
    label: 'Vornamen (Wikidata)',
    fallback: 'Vorname',
    // Im Kreuzwortraetsel ist "Weiblicher Vorname" eine ganz normale, oft
    // wiederholte Frage - hier darf sie sich deshalb viel haeufiger wiederholen
    // als anderswo.
    maxPerClue: 120,
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q202444 ; wikibase:sitelinks ?links .
        FILTER(?links >= 6)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },

  // --- Wissen & Geschichte -------------------------------------------------
  {
    id: 'wd-elemente',
    category: 'wissenGeschichte',
    categoryLabel: "Wissen & Geschichte",
    file: 'wdElemente',
    label: 'Chemie & Physik (Wikidata)',
    fallback: 'Chemisches Element',
    sparql: limit => `
      SELECT ?label ?extra WHERE {
        ?item wdt:P31 wd:Q11344 ; wdt:P1086 ?extra ; rdfs:label ?label .
        FILTER(lang(?label)="de")
      } LIMIT ${limit}`,
    clue: row => (row.extra ? `Element Nr. ${row.extra}` : 'Chemisches Element'),
    ignoreDescription: true
  },
  {
    id: 'wd-sprachen',
    category: 'menschSprache',
    categoryLabel: "Mensch & Sprache",
    file: 'wdSprachen',
    label: 'Sprachen & Völker (Wikidata)',
    fallback: 'Sprache',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31 wd:Q34770 ; wikibase:sitelinks ?links .
        FILTER(?links >= 20)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },

  // --- Mensch & Alltag -----------------------------------------------------
  {
    id: 'wd-berufe',
    category: 'menschSprache',
    categoryLabel: "Mensch & Sprache",
    file: 'wdBerufe',
    label: 'Berufe (Wikidata)',
    fallback: 'Beruf',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31 wd:Q28640 ; wikibase:sitelinks ?links .
        FILTER(?links >= 12)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-essen',
    category: 'alltag',
    categoryLabel: "Alltag & Essen",
    file: 'wdEssen',
    label: 'Essen & Trinken (Wikidata)',
    fallback: 'Speise oder Getränk',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        { ?item wdt:P31/wdt:P279* wd:Q746549 } UNION { ?item wdt:P31/wdt:P279* wd:Q40050 }
        ?item wikibase:sitelinks ?links .
        FILTER(?links >= 15)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-instrumente',
    category: 'kulturSport',
    categoryLabel: "Kultur & Sport",
    file: 'wdInstrumente',
    label: 'Musik (Wikidata)',
    fallback: 'Musikinstrument',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q34379 ; wikibase:sitelinks ?links .
        FILTER(?links >= 10)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-sport',
    category: 'kulturSport',
    categoryLabel: "Kultur & Sport",
    file: 'wdSport',
    label: 'Sport (Wikidata)',
    fallback: 'Sportart',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q31629 ; wikibase:sitelinks ?links .
        FILTER(?links >= 12)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-kleidung',
    category: 'alltag',
    categoryLabel: "Alltag & Essen",
    file: 'wdKleidung',
    label: 'Kleidung & Dinge (Wikidata)',
    fallback: 'Kleidungsstück',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q11460 ; wikibase:sitelinks ?links .
        FILTER(?links >= 8)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  },
  {
    id: 'wd-werkzeug',
    category: 'alltag',
    categoryLabel: "Alltag & Essen",
    file: 'wdWerkzeug',
    label: 'Werkzeug & Technik (Wikidata)',
    fallback: 'Werkzeug',
    sparql: limit => `
      SELECT ?label ?desc WHERE {
        ?item wdt:P31/wdt:P279* wd:Q39546 ; wikibase:sitelinks ?links .
        FILTER(?links >= 8)
        ?item rdfs:label ?label FILTER(lang(?label)="de")
        OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc)="de") }
      } LIMIT ${limit}`
  }
]

/**
 * Laendernamen, die im Deutschen einen Artikel tragen. Ohne diese Tabelle
 * entstuenden Fragen wie "Fluss in Schweiz".
 */
const DATIVE = new Map([
  ['Schweiz', 'der Schweiz'],
  ['Türkei', 'der Türkei'],
  ['Ukraine', 'der Ukraine'],
  ['Slowakei', 'der Slowakei'],
  ['Mongolei', 'der Mongolei'],
  ['Tschechien', 'Tschechien'],
  ['Niederlande', 'den Niederlanden'],
  ['Vereinigte Staaten', 'den USA'],
  ['Vereinigtes Königreich', 'Großbritannien'],
  ['Philippinen', 'den Philippinen'],
  ['Malediven', 'den Malediven'],
  ['Seychellen', 'den Seychellen'],
  ['Komoren', 'den Komoren'],
  ['Bahamas', 'den Bahamas'],
  ['Marshallinseln', 'den Marshallinseln'],
  ['Salomonen', 'den Salomonen'],
  ['Kapverden', 'den Kapverden'],
  ['Färöer', 'den Färöern'],
  ['Vereinigte Arabische Emirate', 'den Emiraten'],
  ['Kaimaninseln', 'den Kaimaninseln'],
  ['Cookinseln', 'den Cookinseln'],
  ['Amerikanische Jungferninseln', 'den Jungferninseln'],
  ['Britische Jungferninseln', 'den Jungferninseln'],
  ['Falklandinseln', 'den Falklandinseln'],
  ['Åland', 'Åland'],
  ['Iran', 'dem Iran'],
  ['Irak', 'dem Irak'],
  ['Sudan', 'dem Sudan'],
  ['Libanon', 'dem Libanon'],
  ['Jemen', 'dem Jemen'],
  ['Tschad', 'dem Tschad'],
  ['Kongo', 'dem Kongo'],
  ['Demokratische Republik Kongo', 'dem Kongo'],
  ['Republik Kongo', 'dem Kongo'],
  ['Elfenbeinküste', 'der Elfenbeinküste'],
  ['Dominikanische Republik', 'der Dominikanischen Republik'],
  ['Zentralafrikanische Republik', 'der Zentralafrikanischen Republik']
])

/** Genau die Normalisierung aus words/index.ts. */
const normaliseAnswer = answer =>
  answer
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .replace(/[^A-Z]/g, '')

async function query(sparql, attempt = 1) {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(180000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return data.results.bindings
  } catch (error) {
    if (attempt >= 5) throw error
    // WDQS wirft unter Last 429/502 und liefert gelegentlich abgeschnittenes
    // JSON. Beides geht nach einer Pause meistens weg, aber die Pause muss
    // laenger sein als ein paar Sekunden.
    await new Promise(resolve => setTimeout(resolve, 15000 * attempt))
    return query(sparql, attempt + 1)
  }
}

/**
 * Ein Label taugt nur als Lösung, wenn es ein einzelnes deutsches Wort ist.
 * Mehrwortbegriffe werden von normaliseAnswer zusammengeklebt ("NEW YORK" ->
 * "NEWYORK") und lesen sich im Gitter wie ein Tippfehler.
 */
function usableLabel(label) {
  if (!/^[A-ZÄÖÜ][a-zäöüß]*(-[A-ZÄÖÜa-zäöüß]+)?$/.test(label)) return false
  const normalised = normaliseAnswer(label)
  return normalised.length >= MIN_ANSWER && normalised.length <= MAX_ANSWER
}

/**
 * Baut die Frage. Die Beschreibung ist erste Wahl, weil sie pro Eintrag
 * verschieden ist — aber nur, wenn sie kurz genug ist und die Lösung nicht
 * selbst enthält.
 */
function buildClue(spec, row, label) {
  if (spec.clue) return spec.clue(mapRow(row))
  const description = spec.ignoreDescription ? '' : row.desc?.value?.trim() || ''
  const answer = normaliseAnswer(label)
  // Taxonomische Floskeln sind als Raetselfrage wertlos: "Art der Gattung
  // Ourebia" kann niemand loesen, der nicht zufaellig Zoologe ist.
  if (/^(Art|Unterart|Gattung|Familie|Ordnung|Unterfamilie|Tribus) (der|des|aus)/i.test(description)) {
    return null
  }

  // Eine Beschreibung aus einem einzigen Wort ("Fluss", "Tierart") sagt nichts
  // und macht die Loesung unratbar - dann ist die Vorlage mit dem Land besser.
  if (
    description &&
    description.includes(' ') &&
    description.length <= MAX_CLUE &&
    !normaliseAnswer(description).includes(answer)
  ) {
    return description.charAt(0).toUpperCase() + description.slice(1)
  }
  const rawExtra = row.extra?.value?.trim()
  const extra = rawExtra ? DATIVE.get(rawExtra) ?? rawExtra : undefined
  const fallback = spec.fallback.includes('%s')
    ? extra
      ? spec.fallback.replace('%s', extra)
      : null
    : spec.fallback
  if (!fallback || fallback.length > MAX_CLUE) return null
  if (normaliseAnswer(fallback).includes(answer)) return null
  return fallback
}

const mapRow = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.value]))

function fileContents(spec, entries) {
  const lines = entries
    .map(([answer, clue]) => `    [${JSON.stringify(answer)}, ${JSON.stringify(clue)}]`)
    .join(',\n')
  return `import type { Category } from './index'

// Automatisch erzeugt von scripts/harvest-wikidata.mjs.
// Quelle: Wikidata (Labels und Kurzbeschreibungen, CC0 — gemeinfrei).
// Nicht von Hand pflegen: der nächste Lauf überschreibt die Datei.
export const ${spec.file}: Category = {
  id: ${JSON.stringify(spec.category)},
  label: ${JSON.stringify(spec.categoryLabel)},
  source: 'wikidata',
  entries: [
${lines}
  ]
}
`
}

/**
 * Lösungen aus dem handgepflegten Pool. Der eigene Ertrag früherer Läufe bleibt
 * bewusst draußen: sonst wäre beim zweiten Lauf alles schon „bekannt" und die
 * Dateien würden leer überschrieben.
 */
async function existingAnswers() {
  const { CATEGORIES, normaliseAnswer: normalise } = await import(
    '../frontend/src/games/schwedenraetsel/words/index.ts'
  )
  const known = new Set()
  for (const category of CATEGORIES) {
    if (category.source === 'wikidata') continue
    for (const [answer] of category.entries) {
      known.add(normalise(answer))
    }
  }
  return known
}

async function main() {
  const known = await existingAnswers()
  console.log(`Bestehender Pool: ${known.size} Lösungen\n`)

  const clueCounts = new Map()
  const results = []
  let total = 0

  for (const spec of SPECS) {
    if (ONLY && !ONLY.includes(spec.id)) continue
    process.stdout.write(`${spec.label} ... `)
    let rows
    try {
      rows = await query(spec.sparql(LIMIT))
    } catch (error) {
      console.log(`FEHLGESCHLAGEN (${error.message})`)
      continue
    }

    const entries = []
    for (const row of rows) {
      const label = row.label?.value?.trim()
      if (!label || !usableLabel(label)) continue
      const answer = normaliseAnswer(label)
      if (known.has(answer)) continue

      const clue = buildClue(spec, row, label)
      if (!clue) continue
      const used = clueCounts.get(clue) || 0
      if (used >= (spec.maxPerClue ?? MAX_PER_CLUE)) continue

      known.add(answer)
      clueCounts.set(clue, used + 1)
      entries.push([label, clue])
    }

    // Kurze Loesungen zuerst: das ist der Treibstoff des Generators, und wenn
    // eine Abfrage gekappt wird, sollen die nuetzlichen Eintraege bleiben.
    if (spec.max && entries.length > spec.max) {
      entries.sort((a, b) => normaliseAnswer(a[0]).length - normaliseAnswer(b[0]).length)
      entries.length = spec.max
    }
    entries.sort((a, b) => a[0].localeCompare(b[0], 'de'))
    results.push({ spec, entries })
    total += entries.length
    const short = entries.filter(([answer]) => {
      const length = normaliseAnswer(answer).length
      return length >= 3 && length <= 6
    }).length
    console.log(`${rows.length} Zeilen -> ${entries.length} neue Einträge (${short} kurz)`)
  }

  console.log(`\nNeue Einträge gesamt: ${total}`)
  if (DRY) {
    console.log('--dry: nichts geschrieben.')
    return
  }

  for (const { spec, entries } of results) {
    if (!entries.length) continue
    fs.writeFileSync(path.join(WORDS_DIR, `${spec.file}.ts`), fileContents(spec, entries), 'utf-8')
  }
  console.log(`${results.filter(r => r.entries.length).length} Dateien geschrieben nach ${WORDS_DIR}`)
  console.log('index.ts muss die neuen Kategorien noch importieren.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
