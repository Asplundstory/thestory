# The Story – Vinguide

Detta repo innehåller en enkel React/Vite-applikation för att söka och filtrera i Systembolagets produktdata. Projektet är tänkt att fungera tillsammans med containern `ghcr.io/c4illin/systembolaget-data` men har även reservdata så att gränssnittet går att testa direkt. Utöver grundfiltreringen innehåller appen nu:

- **Drickfönster- och lagringsfilter** för att snabbt hitta viner som passar din tidsplan eller källarkapacitet.
- **Wine-Searcher analys** som räknar fram värdeökning baserat på externa data och lyfter fram de mest intressanta flaskorna för investering.

## Kom igång

1. Installera beroenden:
   ```bash
   cd frontend
   npm install
   ```

2. (Valfritt) starta API:t via Docker-compose-filen i projektets rot:
   ```bash
   docker compose up systembolaget-data
   ```
   API:t exponerar då produkter på `http://localhost:3000/products`.

3. Starta utvecklingsservern:
   ```bash
   npm run dev
   ```

4. Öppna webbläsaren på adressen som Vite visar (standard `http://localhost:5173`).

Applikationen försöker först hämta data från `VITE_API_URL` (standard `http://localhost:3000`). Om anropet misslyckas laddas `frontend/public/sample-data.json` som reservdata. För värdeanalysen anropas `GET /value-insights?ids=...`; vid fel används `frontend/public/sample-value-insights.json`.

## Konfiguration

| Variabel        | Standard               | Beskrivning                                                                 |
| --------------- | ---------------------- | --------------------------------------------------------------------------- |
| `VITE_API_URL`  | `http://localhost:3000` | Bas-URL till API:t med Systembolagets data och endpointen `/value-insights`. |

## Projektstruktur

```
frontend/
  ├─ src/
  │   ├─ App.tsx          # UI och filtreringslogik
  │   ├─ main.tsx         # Inträde för React
  │   └─ styles/          # Globala och komponentrelaterade stilar
  ├─ public/
  │   ├─ sample-data.json          # Reservdata för produkter
  │   └─ sample-value-insights.json # Reservdata för Wine-Searcher-analys
  ├─ index.html
  └─ vite.config.ts
```

## Tips för vidareutveckling

- Utöka API:t med fler datakällor (t.ex. auktioner eller sekundärmarknad) och mappa dem till Wine-Searcher-analysen.
- Lägg till grafer över historisk prisutveckling per produkt.
- Komplettera filtren med druvsammansättning, expertbetyg och koldioxidavtryck.

Lycka till med vidare utveckling!
