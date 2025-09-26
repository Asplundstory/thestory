# The Story – Vinguide

Detta repo innehåller en enkel React/Vite-applikation för att söka och filtrera i Systembolagets produktdata. Projektet är tänkt att fungera tillsammans med containern `ghcr.io/c4illin/systembolaget-data` men har även reservdata så att gränssnittet går att testa direkt.

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

Applikationen försöker först hämta data från `VITE_API_URL` (standard `http://localhost:3000`). Om anropet misslyckas laddas `frontend/public/sample-data.json` som reservdata.

## Konfiguration

| Variabel        | Standard               | Beskrivning                                   |
| --------------- | ---------------------- | --------------------------------------------- |
| `VITE_API_URL`  | `http://localhost:3000` | Bas-URL till API:t med Systembolagets data.   |

## Projektstruktur

```
frontend/
  ├─ src/
  │   ├─ App.tsx          # UI och filtreringslogik
  │   ├─ main.tsx         # Inträde för React
  │   └─ styles/          # Globala och komponentrelaterade stilar
  ├─ public/
  │   └─ sample-data.json # Reservdata för offline-testning
  ├─ index.html
  └─ vite.config.ts
```

## Nästa steg

- Lägga till fler filter (t.ex. druvor, sockerhalt, årgång).
- Implementera klient-side caching och paginering för stora datamängder.
- Koppla på avancerad sök med textindexering i API:t.

Lycka till med vidare utveckling!
