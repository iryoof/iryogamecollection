# Handoff

Was zuletzt passiert ist und warum. Neueste Einträge oben. Die Regeln dazu
stehen in `CLAUDE.md` unter „Handoff".

Diese Datei beschreibt die Vergangenheit. Vor einer Aussage über den heutigen
Stand trotzdem `git fetch origin` und im Repo nachsehen.

---

## 2026-09-22 (abends) — Wortpool aus Wikidata, Spielseiten nachgeladen

### Gemacht

`1d5b9b8` **Schwedenrätsel-Pool von 3.532 auf 5.967 Lösungen**, Quelle Wikidata
über `scripts/harvest-wikidata.mjs`. Dazu werden die fünf Spielseiten per
`React.lazy` nachgeladen.

### Warum Wikidata und nicht Wiktionary

Labels und Kurzbeschreibungen stehen bei Wikidata unter **CC0**, also
gemeinfrei — von den grossen freien Quellen die einzige ohne Namensnennungs-
und Share-Alike-Pflicht. Wiktionary ist deutlich grösser und deckt auch
Alltagswörter ab, steht aber unter CC BY-SA: die Seite bräuchte dann einen
Lizenzhinweis, und der ganze Wortbestand fiele unter Share-Alike. David hat sich
bewusst für CC0 entschieden.

Reine Wortlisten (igerman98 & Co.) scheiden aus, weil ein Schwedenrätsel zu
jedem Wort eine **Frage** braucht. Wikidatas Kurzbeschreibung ist von Haus aus
kurz genug ("Stadt in Italien") und pro Eintrag verschieden.

### Was beim Bauen schiefging — bitte lesen, bevor jemand den Ernter anfasst

1. **Der Ernter war nicht wiederholbar.** Er entdoppelte gegen `buildPool()`,
   also auch gegen den eigenen Ertrag. Der zweite Lauf sah fast nichts mehr als
   neu und überschrieb 15 Dateien mit Resten. Behoben durch `source: 'wikidata'`
   an der Kategorie, das `existingAnswers()` ausblendet. **Wer weitere erzeugte
   Kategorien hinzufügt, muss dieses Feld setzen.**
2. **Ein Filter griff stillschweigend nie.** Statt der Wortgrenze `` stand ein
   **Backspace-Steuerzeichen** (``) in der Datei — beim Einfügen über ein
   Heredoc war die Maskierung verlorengegangen. Ausgegeben sah die Regex korrekt
   aus. Gefunden nur, weil das Ergebnis nachgezählt wurde. Lehre: bei
   Backslash-Escapes in per Heredoc erzeugtem Code das Ergebnis mit `repr()`
   prüfen, nicht mit `cat`.
3. **Mehr Wörter machten die Rätsel erst schlechter.** Geografie liefert so viel,
   dass ein 11x11-Gitter zu zwei Dritteln aus „Fluss in …" bestand. Deshalb hat
   jede ergiebige Abfrage ein `max`. Fallstrick dabei: beim Kappen bleiben die
   **kurzen** Einträge — und genau die bevorzugt der Generator, das Kappen wirkte
   anfangs also verstärkend statt dämpfend. Die Grenzen sind entsprechend eng.
4. **Taxonomie ist als Rätselfrage wertlos.** „Art der Gattung Ourebia" kann
   niemand lösen. Nach dem Filter bleiben von 1.000 geernteten Tier-Einträgen
   **52** übrig. Die Tier-Abfragen sind damit fast nutzlos; der Ertrag kommt aus
   Geografie, Vornamen, Elementen und Berufen.

### Nicht enthalten

- **Pflanzen**: die Abfrage über den Pflanzen-Taxonbaum läuft bei WDQS
  reproduzierbar in den Timeout (HTTP 502), auch mit hoher Sitelink-Schwelle.
- **Himmelskörper**: WDQS liefert abgeschnittenes JSON, und der Ertrag wären
  18 Einträge gewesen, fast alles Katalognummern.
- WDQS liefert unter Last generell gelegentlich abgeschnittenes JSON. Deshalb
  fünf Versuche mit 15s-Backoff und die Option `--only <ids>`, um eine einzelne
  Abfrage nachzuholen, ohne die übrigen Dateien neu zu schreiben. Städte und
  Berge brauchten das mehrfach; kleineres `--limit` hilft.

### Bundle

Die Spielseiten hingen alle im Hauptbundle, das Portal trug also den ganzen
Wortpool mit. Mit `React.lazy`: **560 kB (175 kB gzip) → 244 kB (78 kB gzip)**.
Das Schwedenrätsel liegt in einem eigenen Stück von 271 kB (95 kB gzip).

### Geprüft

- `check-woerter.mjs`: 6.850 Einträge, 5.967 im Pool, 3.766 kurze nutzbare,
  weiterhin 17 zu lange Fragen (alle aus dem Altbestand).
- `check-schwedenraetsel.mjs`: 180/180 Gitter, keine Frage ohne Wort. **Läuft
  jetzt in Sekunden statt ein bis zwei Minuten** — mit mehr kurzen Wörtern
  springt der Generator kaum noch zurück. Die Angabe in CLAUDE.md ist veraltet.
- `npm run type-check`, `npm run build`: grün.
- Im Browser durchgespielt: Themenmenü weiterhin sechs Einträge, Rätsel wird
  erzeugt, Mischung stimmt (7 Geografie-Fragen von 26).

### Offen

- Ein zweiter Anlauf für Alltagswörter und Verben fehlt — Wikidata ist dort
  schwach. Das wäre der Punkt, an dem Wiktionary trotz CC BY-SA lohnen könnte.
- Die Punkte aus den früheren Einträgen gelten weiter.

---

## 2026-09-22 (später) — Wavelength-Panel nachgezogen, Nachzügler-Fehler gefunden

### Gemacht

`2a4f8ba` **Votekick-Panel im Wavelength-Voting und -Ergebnis**, dazu neu
`games/wavelength/PlayerRoster.tsx`. Und ein Fehler behoben, den das Nachjoinen
aus `4a6dafb` eingeschleppt hatte.

### Warum so

Die Spielerliste lag danach dreimal fast identisch im Code (Spiel, Voting,
Ergebnis), deshalb als eigene Komponente statt dreimal kopiert. `Game.tsx`
wurde mit umgestellt, sonst wäre die vierte Variante entstanden. Im Voting
zeigt die Liste zusätzlich „Gewählt"/„Wählt noch" — dort gab es vorher
überhaupt keine Namen.

### Der Fund beim Durchspielen

Im Browser fiel auf: der Seeker bekam einen **Nachzügler als Fragenziel**
angeboten, und der Zähler „Fragen & Antworten" zählte ihn mit (0/2 statt 0/1).
`WavelengthLobby.askQuestion` prüfte nur `isDisconnected`, nicht
`isWaitingForNextRound`, und `activeOtherPlayers` in `Game.tsx` genauso. Eine
Frage an jemanden, der die Runde aussitzt, zieht die Runde unnötig in die
Länge. Beide Stellen prüfen das jetzt.

**Das war im Socket-Test nicht sichtbar**, weil die Simulation den Seeker nur
die richtigen Spieler fragen ließ. Die Simulation prüft es jetzt aktiv.

### Geprüft

- `scripts/sim-neue-features.mjs --schnell`: **49/49**. Neu: Abstimmung in den
  Phasen „voting" und „result", abgewiesene Frage an einen Nachzügler.
- `scripts/stress-test.mjs`: 6/6. `npm run type-check`, `npm run build`: grün.
- **Im Browser mit drei Tabs durchgespielt** gegen ein lokales Backend: Panel
  und Liste auf beiden neuen Bildschirmen, Zielsicht ohne Ja/Nein-Knöpfe,
  Abbruch nach einem einzigen Nein bei zwei Stimmberechtigten, Nachzügler weder
  als Fragenziel noch im Zähler, Seeker konnte trotzdem raten.

### Fallstricke

- **Wavelength speichert die Session in `localStorage`, nicht
  `sessionStorage`.** Ein zweiter Tab übernimmt dadurch die Session des ersten
  und landet als derselbe Spieler in der Lobby. Zum Testen mit mehreren Tabs
  vorher `localStorage.removeItem('wavvelength:session')` ausführen und neu
  laden. Cypher ist davon nicht betroffen, das nutzt `sessionStorage`.
- Für den Browser-Test liegt eine `.claude/launch.json` für den Vite-Server im
  Wurzelverzeichnis. `.claude/` ist gitignoriert, die Datei ist also lokal.

### Offen

- `2a4f8ba` ist **nicht gepusht**.
- Ein Wavelength-Nachzügler ist **stimmberechtigt**, obwohl er die Runde
  aussitzt — anders als die Cypher-Bank, die gar nicht im Roster steht. Bewusst
  nicht geändert, wäre eine eigene Entscheidung.
- Cypher-Bank weiterhin ohne Stimmrecht und nicht per Votekick entfernbar,
  `reconnectionAttempts: 5` unverändert.

---

## 2026-09-22 — Simuliert, dabei einen hängenden Votekick gefunden

### Gemacht

`0b50cad` **Votekick bricht ab, sobald Ja rechnerisch unmöglich ist**, plus
`scripts/sim-neue-features.mjs`.

### Warum

Der Stand vom Vortag war nur typgeprüft und gebaut, nie mit echten Clients
gespielt. Das Nachholen hat sofort einen Fehler gefunden: bei zwei
Stimmberechtigten braucht ein Kick beide Ja-Stimmen, ein Nein erledigt ihn also.
Die Abstimmung brach aber erst bei einer Nein-*Mehrheit* ab, und ein Nein von
zwei ist keine Mehrheit — das Panel blieb 60 Sekunden hängen, der Knopf „Nein,
behalten" sah kaputt aus. Neue Regel: Abbruch, sobald `eligible - Nein < needed`.
Die alte Bedingung war ein Sonderfall davon.

Das Skript ist nach dem Muster von `stress-test.mjs` gebaut (Backend als
Kindprozess, echte socket.io-Clients). Als Unit-Test auf die Klassen hätte es
genau das nicht gefunden: der Fehler lag im Zusammenspiel von Auszählung und
Broadcast, nicht in der Schwelle selbst.

### Geprüft

- `node scripts/sim-neue-features.mjs`: **40/40**, voller Lauf ~73s. Der lange
  Teil ist ein 65-Sekunden-Warten, das zeigt, dass im laufenden Spiel wirklich
  kein Eviction-Timer mehr feuert. `--schnell` überspringt ihn (39/39, ~10s).
- `npx tsx scripts/check-votekick.mjs`: 11/11, um zwei Fälle zur neuen
  Abbruchregel erweitert.
- `node scripts/stress-test.mjs`: alle 6 Szenarien grün — keine Regression
  durch Bank-Spieler, Votekick oder den geänderten Disconnect-Pfad.
- `npm run type-check`, `npm run build`: laufen durch.
- Render-Backend per Socket-Probe geprüft: `lobby:votekick:start` und
  `wvl:votekick:start` antworten inzwischen, der Deploy von `b98b2f9` ist also
  oben. Am Vortag kam auf dieselbe Probe keine Antwort.

### Fallstricke

- **Cypher verlangt in Runde 1 zwei Zeilen pro Abgabe**, ab Runde 2 genau eine
  (`Lobby.submitText`). Hat im Simulationsskript Zeit gekostet — und war nicht
  nur ein Test-Problem, siehe `7869d37` unten.
- Render Free-Tier schläft ein: die erste Socket-Verbindung läuft in den
  Connect-Timeout, weil der Kaltstart länger dauert. Erst per `curl /health`
  wecken, dann verbinden.

### Nachgezogen: `7869d37` — abgelehnte Abgaben waren unsichtbar

Der Fallstrick oben war kein reines Testproblem. Wird eine Cypher-Abgabe
abgelehnt, schickt der Server zwar einen Fehler, aber `GameScreen` hat `error`
nie gerendert, und `handleTextSubmit` setzt optimistisch `hasSubmitted` und
schaltet auf „Warte auf die anderen...". Ergebnis: der Spieler steht dauerhaft
auf Warten, obwohl nichts gezählt wurde, und die Runde wird für **alle** nie
fertig. Das traf jeden Ablehnungsgrund in `submitText`, auch das neue „Du
steigst erst in der nächsten Runde ein" für Nachzügler.

Behoben: Spielregel-Meldungen in `Lobby.ts` deutsch und handlungsfähig,
`GameScreen` zeigt den Fehler in der Schreibphase, und ein Effekt nimmt das
optimistische `hasSubmitted` zurück, sobald ein Fehler eintrifft und der Server
uns nicht als abgegeben führt.

`stress-test.mjs` prüfte vier dieser Texte auf Englisch und wurde nachgezogen —
wer weitere Meldungen übersetzt, muss dort mitziehen.

Bewusst nicht angefasst: `'Game already started'`, `'Need at least 3 players'`,
`'Player not in lobby'` und die `'Lobby not found'`-Meldungen in `io.ts`. Die
erste Gruppe erreicht die Schreibphase nicht, und auf `lobby not found` prüft
`useGameSocket` per String-Vergleich — das wäre eine eigene Änderung.

Danach: `sim-neue-features.mjs` 42/42, `stress-test.mjs` 6/6,
`check-votekick.mjs` 11/11, type-check und build grün.

### Offen

- `0b50cad` und `7869d37` sind committet, aber **nicht gepusht** — das Backend
  auf Render läuft noch mit der hängenden Abstimmung und den stummen Abgaben.
- Die Punkte aus dem Eintrag vom 2026-09-21 gelten unverändert weiter
  (Wavelength-Panel in Voting/Ergebnis, Bank-Spieler ohne Stimmrecht,
  `reconnectionAttempts: 5`).

---

## 2026-09-21 (später) — Reconnect ohne Limit, Votekick, Nachjoinen

### Gemacht

`b35e55f` **HANDOFF.md ins Repo aufgenommen.** Die Datei lag nur lokal und war
untracked — für andere Sessions damit unsichtbar, also genau das Gegenteil
ihres Zwecks. Dazu die Backslash-Regel in CLAUDE.md auf jeden Absatz
ausgeweitet.

`4129211` **Reconnect ohne Zeitlimit, solange eine Partie läuft.** Vorher flog
ein getrennter Spieler nach 60s (Cypher) bzw. 120s (Wer bin ich, Wavelength)
raus — auch mitten im Spiel. Jetzt wird während einer laufenden Partie gar kein
Eviction-Timer gestellt. Im Wartebereich bleibt das alte Fenster, sonst sammeln
sich geschlossene Tabs als Geisterspieler an.

`ea6733a` **Votekick mit einfacher Mehrheit** in allen drei Spielen. Jeder
Verbundene darf starten, es braucht über 50 % der Verbundenen ohne den
Betroffenen. Auszählung generisch in `backend/src/game/VoteKick.ts`.

`4a6dafb` **Nachjoinen in laufende Partien** in allen drei Spielen, plus
`scripts/check-votekick.mjs`.

### Warum so

**Reconnect: kein Limit nur im laufenden Spiel, nicht generell.** Unbegrenzt
auch im Wartebereich wurde verworfen: es gibt kein TTL-Aufräumen für Lobbys
(`GameManager` löscht nur leere), eine Warte-Lobby würde sich dauerhaft mit
Karteileichen füllen. „Kein Limit" ist überall `deadline === null`. Zwei
Stolperstellen: `Lobby.markDisconnected` gab vorher die Deadline zurück, null
hätte dann zwei Bedeutungen gehabt (kein Limit / Spieler nicht in der Lobby) —
gibt jetzt boolean. Und Wer bin ich hatte keinen eigenen Disconnect-Flag,
sondern leitete ihn aus `!!reconnectDeadline` ab; das trägt mit null nicht mehr,
deshalb ein explizites `isDisconnected` am Spieler.

**Votekick-Schwelle: Verbundene ohne den Betroffenen.** Getrennte mitzuzählen
wurde verworfen — zusammen mit dem offenen Reconnect-Fenster könnte ein
Abwesender den Kick dauerhaft blockieren. Zwei Drittel wurde ebenfalls
verworfen: ein Störer wäre in kleinen Runden nicht mehr wegzubekommen. Unter
zwei Stimmberechtigten wird abgelehnt, sonst kickt einer allein. Die
Stimmberechtigten werden bei **jeder** Stimme neu gelesen, damit ein Disconnect
mitten in der Abstimmung die Schwelle verschiebt statt sie unerreichbar zu
machen.

**Nachjoinen: der „geeignete Punkt" ist pro Spiel ein anderer.**
- Cypher: erst zum Rundenwechsel. Die Rotation weist Blätter über die Position
  in `playerOrder` zu — ein Spieler mehr mitten in der Runde schiebt allen ein
  anderes Blatt unter. Preis der gewählten Variante: sein Blatt bleibt kürzer,
  und die Rotation deckt danach nicht mehr jedes Blatt von jedem ab. Bewusst
  gegen „nur zuschauen bis zum nächsten Spiel" entschieden (David).
- Wer bin ich: sofort dabei. `assignments` hält genau ein Ziel pro Autor,
  deshalb wird der Neue in den Zyklus eingehängt statt eine zweite Aufgabe zu
  erfinden. Neu ist `myWordPending` — das eigene Wort ist einem verborgen, der
  Client kann aus dem Spielstand nicht ableiten, ob er noch darauf wartet.
- Wavelength: `isWaitingForNextRound`, aus `getActivePlayers()` ausgeschlossen.
  Ohne das blockiert der Neue den Seeker, weil `canSeekerGuess()` eine Antwort
  von jedem aktiven Spieler verlangt.

### Geprüft

- `npm run type-check` (Frontend + Backend): läuft durch.
- `npm run build`: läuft durch, Frontend-Bundle 560 kB / 175 kB gzip.
- `npx tsx scripts/check-votekick.mjs`: 9 von 9 Prüfungen grün (Schwelle bei 4
  und 2 Stimmberechtigten, Ablehnung bei 1, Nein-Mehrheit, Ziel stimmt nicht
  mit, Starter zählt als Ja).

**Nicht geprüft: nichts davon wurde mit echten Clients gespielt.** Ungetestet
sind vor allem der Cypher-Rundenwechsel mit Nachzügler, die Zyklus-Einhängung
bei Wer bin ich und das Zusammenspiel von Votekick und Disconnect.

### Offen

- Alles ungepusht (`ahead 4`), Backend auf Render nicht neu deployed. Die
  Socket-Events sind neu — ein Frontend-Deploy ohne Backend-Deploy macht
  Votekick und Nachjoinen wirkungslos.
- Wavelength: Votekick-Panel fehlt im Voting- und Ergebnis-Bildschirm.
- Cypher: ein Spieler auf der Bank kann weder abstimmen noch per Votekick
  entfernt werden — er steht nicht in `getState().players`. Der Host-Kick
  greift, weil `hasPlayer` die Bank mit abdeckt.
- `reconnectionAttempts: 5` im Socket.IO-Client aller drei Spiele: nach ~25s
  gibt der Client von selbst auf. Server-seitig bleibt der Platz zwar frei, man
  muss aber neu laden. Bewusst nicht angefasst, wäre ein Einzeiler.
- Gelöscht: `Cypher-push-uncommitted-backup-2026-06-12.patch`. War ein
  Sicherungs-Diff vom 12.06. (unbegrenzter Reconnect + Host-Übergabe), nie
  angewendet und nicht mehr anwendbar — zwei Zieldateien wurden in `b8ce13c`
  umbenannt. Die Reconnect-Idee daraus ist in `4129211` umgesetzt, die
  automatische Host-Übergabe bei Disconnect **nicht** (auf Davids Wunsch).

---

## 2026-09-21 — Wortpool erweitert, Kick eingebaut, Musterproblem vermessen

### Gemacht

`9502ba5` **Spieler entfernen für Wer bin ich und Wavelength.** Beide Spiele
hatten keinen Kick — nur Cypher, dort komplett (Backend `io.ts`, Hook
`useGameSocket.ts`, Knopf in `pages/GameSetup.tsx`). Neu sind die Host-Handler
`lobby:kick` in `backend/src/werbinich.ts` und `wvl:lobby:kick` in
`backend/src/wavelength.ts`, ein Entfernen-Knopf in beiden Lobbys und die
Behandlung von `lobby:kicked` / `wvl:lobby:kicked` in den beiden Seiten.

`596e781` **Wortpool um 567 kurze Einträge erweitert.** Zwei neue Dateien
`words/grundwortschatz8.ts` (65× drei, 166× vier Buchstaben) und
`words/grundwortschatz9.ts` (164× fünf, 172× sechs), beide `always: true`.

Beides ist auf `origin/main` gepusht. David wollte ausdrücklich **keinen PR**,
sondern direkt auf `main`.

### Warum so

**Kick zuerst, Reconnect-Patch noch nicht.** Die ungetrackte Datei
`Cypher-push-uncommitted-backup-2026-06-12.patch` enthält ein zusammenhängendes
Vorhaben: solange ein Spiel läuft niemanden wegen Verbindungsabbruch entfernen,
dazu sofortiger Host-Wechsel. Anwendbar ist der Patch nicht — `Wavvelength`
wurde zu `Wavelength` umbenannt, Locales und `CypherGame.tsx` sind gewandert,
`git apply --check` scheitert an sechs Stellen. Inhaltlich fehlt fast alles im
heutigen Code: `shouldKeepDisconnectedPlayer` und `infiniteReconnect` haben null
Treffer, `reconnectionAttempts` steht an vier Stellen auf `5`, den Schlüssel
`reconnectUnlimited` gibt es nicht. Nur das Verbindungsbanner ist nachträglich
in Wer bin ich und Wavelength gelandet, in Cypher nicht.

Wenn niemand mehr entfernt wird, kann eine Lobby dauerhaft auf jemanden warten,
der nicht zurückkommt. Deshalb zuerst der Kick als Notausgang für den Host.

**Kick nur in der Lobby**, nicht im laufenden Spiel — so wie bei Cypher. Ein
bewusster Unterschied zu Cypher: dort ist der Knopf bei getrennten Spielern
ausgeblendet (`GameSetup.tsx:210`), in den zwei neuen bleibt er sichtbar. Ein
hängengebliebener getrennter Spieler ist genau der Fall, für den man ihn
braucht. Ob Cypher angeglichen wird, ist offen.

**Reihenfolge im Kick-Handler ist nicht beliebig.** Der Ziel-Socket verlässt
den Lobby-Raum *vor* dem Roster-Broadcast, damit kein spätes Update nach der
Kick-Meldung eintrifft und den Client zurück auf den Lobby-Screen setzt. Den
persönlichen Raum (`playerId`) verlässt er erst *nach* dem Emit, sonst geht die
Meldung ins Leere.

**Wörter aus öffentlichen Listen, Fragen von Hand.** Quellen waren
`gambolputty/german-nouns` (rund 100.000 Substantiv-Lemmata mit Genus aus dem
deutschen Wiktionary) und `hermitdave/FrequencyWords` `de_50k`. Die Schnittmenge
beider, abzüglich aller 2967 schon vorhandenen Lösungen, ergab 2303 brauchbare
Kandidaten der Länge 3–6. Wortlisten liefern keine Rätselfragen — das ist der
Teil, den keine öffentliche Bank abnimmt.

Aussortiert: Beleidigungen und Kraftausdrücke (die Untertitelliste ist voll
davon, inklusive rassistischer Begriffe), Vornamen, Markennamen und englische
Wörter ohne Fuss im Deutschen.

Drei Buchstaben war der Engpass. Die reine Substantivliste gab dafür wenig her —
deutsche Dreibuchstaben-Substantive sind schnell erschöpft — deshalb stehen dort
auch Abkürzungen, Vorsilben und Lehnwörter, so wie in gedruckten
Schwedenrätseln.

### Geprüft

Kick: `npm run type-check` und `npm run build` sauber, dazu ein Lauf gegen ein
lokal gestartetes Backend mit drei Socket-Clients. Bestätigt: Nicht-Host wird
abgewiesen, Selbstkick wird abgewiesen, das Kick-Event kommt beim Ziel an, das
Roster der Verbleibenden stimmt. **Im Browser mit zwei echten Clients ist es
nicht durchgeklickt** — die Knöpfe selbst sind ungetestet.

Wortpool, je 40 Rätsel pro Grösse, einmal ohne und einmal mit den neuen Dateien:

| Grösse | Wiederholung vorher | nachher | Zeit vorher | nachher |
|---|---|---|---|---|
| klein 7×7 | 1,78× | 1,49× | 77 ms | 20 ms |
| mittel 9×9 | 1,87× | 1,62× | 60 ms | 20 ms |
| gross 11×11 | 2,02× | 1,74× | 225 ms | 94 ms |

Nutzbarer Vorrat der Längen 3–6 von 1877 auf 2444, Dreibuchstaber von 166 auf
231. `npx tsx scripts/check-schwedenraetsel.mjs` mit 40 Läufen je Grösse:
bestanden, 120/120 Rätsel erzeugt, kein Feld ohne Frage.

### Vermessen, aber nicht geändert: warum die Rätsel leicht und die Muster
### ähnlich sind

Beides ist **kein** Wortmengen-Problem.

`patterns.ts` ist eine feste Liste: 24 Formen für 7×7, 24 für 9×9, **18** für
11×11. Bei 40 Rätseln siehst du jede Elfer-Form gut zweimal — daher die
Ähnlichkeit. Der Engpass ist die Formsuche in `pattern.ts`. Über je 60 Versuche
gemessen liefert sie bei 7×7 in 37 % der Fälle eine Form, bei 9×9 und 11×11 nur
in **2 %**. Hochgerechnet braucht es für ~60 zusätzliche Elfer-Formen rund 7.500
Suchversuche, also ein bis zwei Stunden Rechenzeit. Kein einziges neues Wort.

Leicht sind die Rätsel aus drei anderen Gründen: die Gitter sind mit 70 %
(klein), 75 % (mittel) und 79 % (gross) gekreuzten Buchstaben sehr dicht
verzahnt; `pattern.ts:41` deckelt Wörter bei `MAX_WORD = 6`, wodurch **816
Einträge der Länge 7–9 im Pool liegen, die der Generator nie ansieht**; und die
Fragen sind direkte Definitionen (Ø 20 Zeichen).

Am Vorrat liegt es nicht. Nach Häufigkeitsrang aufgeteilt sind von den 2444
nutzbaren Kurzwörtern nur 343 aus den Top 2000, 814 aus dem Bereich 2000–10.000,
1058 seltener als Rang 10.000 und 229 gar nicht in der Liste. Für eine schwere
Stufe (ein 11×11-Gitter verbraucht ~38 Wörter, für ≤1,5× Wiederholung über 40
Rätsel braucht eine Stufe ~1.000–1.500 Wörter) ist genug da — es fehlt der
Schalter, nicht der Vorrat.

### Fallstricke

**`scripts/build-muster.mjs` überschreibt `patterns.ts` bedingungslos**, auch
wenn der Lauf *weniger* Formen gefunden hat als vorher drin standen. Ein
Messlauf mit `--versuche 250` hat die 18 Elfer-Formen durch **eine** ersetzt;
zurückgeholt mit `git checkout --`. Vor dem nächsten Musterlauf muss das Skript
ergänzen statt ersetzen.

**Hilfsskripte müssen unter `scripts/` liegen.** Aus dem Scratchpad heraus
scheitern die relativen Importe auf die `.ts`-Dateien. Und sie laufen nur mit
`npx tsx`, nicht mit `node` — die importierten `.ts`-Dateien haben
endungslose interne Importe.

**Der Bash-Tool ist keine PowerShell.** Ein Commit mit `-m @'…'@` hat den
Betreff zu `@` gemacht; mit `--amend -F -` und einem Heredoc korrigiert.

### Offen

- Reconnect-Patch: die vier restlichen Teile (`reconnectionAttempts: Infinity`,
  Verbindungsbanner für Cypher, unendliche Karenz im laufenden Spiel, sofortiger
  Host-Wechsel). Die Patch-Datei liegt ungetrackt im Wurzelverzeichnis und ist
  nicht anwendbar — sie taugt als Vorlage, nicht zum Einspielen.
- **Der Kick ist noch nicht wirksam.** Die Pages-Action deployt nur das
  Frontend; das Backend liegt getrennt auf Render. Bis Render neu baut, zeigt
  die Lobby den Knopf, aber der Server kennt das Event nicht.
- `build-muster.mjs` reparieren, dann Formen nachgenerieren (Ziel 60–80 je
  Grösse). Grösster sichtbarer Effekt, geringstes Risiko.
- `MAX_WORD` pro Schwierigkeit statt global — holt die 816 langen Wörter ins
  Spiel. Braucht vorher neue Formen für die längeren Läufe.
- Häufigkeitsrang als Feld an jedem Eintrag, damit der Generator nach Seltenheit
  filtern kann.
- 871 der 3838 Einträge sind Dubletten und fallen in `buildPool` still raus,
  teils innerhalb derselben Kategorie (DECKE zweimal in „Alltag & Essen", TURM
  zweimal in „Kultur & Sport"). Die 567 neuen Einträge kollidieren mit keinem.
- `npm run lint` ist wirkungslos: ESLint ist nicht installiert, das Skript endet
  auf `|| true`.
