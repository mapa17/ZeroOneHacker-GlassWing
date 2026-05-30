# chat/ — User-Behaviour Data Logs

This folder holds the **data logs** collected from the UNIQA Privatarzt quote funnel
(`../src/App.jsx`). For now it serves as the place where the
per-page tracking output is documented and where exported sessions live.

The live logs are produced inside the app: open the **„Daten“** tab (top-right mode
switch). There you can watch the metrics update in real time and:

- **JSON kopieren** — copy the current snapshot to the clipboard
- **JSON herunterladen** — download the snapshot as `sess_<...>.json` (drop it into this folder)
- **Reset** — start a fresh tracking session

`sample-session.json` is a reference export so you know the exact shape of the data.

## What gets tracked

Everything that signals a user's interest in the product:

| Category | Captured |
|----------|----------|
| **Time per page** | Total dwell time + visit count for each of the 7 funnel steps |
| **Navigation** | `next` / `back` / `reset` clicks (incl. which step they fired from) |
| **Tariff interest** | Which tariff was selected and how often (`tarif_select_<key>`) |
| **Add-on interest** | Each add-on toggle on/off (`addon_toggle_<key>`) |
| **Form fields** | Interaction count per field; choice values for non-PII fields |
| **Mode usage** | Switches between Manuell / Agenten / Daten |
| **Agent actions** | Persona generation and runs |
| **Conversion** | `funnel_complete` event with chosen tariff, premium, add-ons, route |

### Privacy note
Free-text / personal fields (`vorname`, `name`, `email`, `telefon`, `svnummer`,
`geburtsdatum`, `arzt`, `groesse`, `gewicht`) are **never stored as raw values** —
only `filled` (boolean) and `length` are recorded. Enumerated choice fields
(`tarif`, `geschlecht`, `sozialversicherung`, `leistungssport`, `schwangerschaft`,
`beratungsort`) store their selected value, since those represent product interest.

## JSON schema (top level)

```jsonc
{
  "sessionId":        "sess_<timestamp>_<rand>",
  "startedAt":        "ISO-8601",          // session start
  "snapshotAt":       "ISO-8601",          // when this export was taken
  "totalDurationMs":  123456,              // whole-session duration
  "mode":             "manual|agent|data",
  "currentStep":      0,                   // 0..6
  "currentPage":      "Geburtsdatum & Sozialversicherung",
  "summary": {
    "pagesVisited":      3,
    "totalButtonClicks": 12,
    "backButtonClicks":  2,
    "fieldsInteracted":  5,
    "events":            40,
    "selectedTarif":     "optimal",
    "selectedAddons":    ["fit", "akut"],
    "projectedRoute":    "online|beratung"
  },
  "pages": {
    "0": { "name": "...", "enters": 1, "totalTimeMs": 8200, "current": false }
    // one entry per visited step
  },
  "buttons": {
    "next": 4, "back": 2, "tarif_select_optimal": 1, "addon_toggle_fit": 2
    // click counters
  },
  "fields": {
    "tarif":      { "changes": 1, "firstAt": "...", "lastAt": "...", "value": "optimal" },
    "email":      { "changes": 3, "firstAt": "...", "lastAt": "...", "filled": true, "length": 21 }
  },
  "events": [
    { "t": "ISO", "type": "page_enter", "step": 0, "name": "..." },
    { "t": "ISO", "type": "button",     "step": 0, "key": "next", "from": 0 },
    { "t": "ISO", "type": "field",      "step": 1, "key": "tarif", "value": "optimal" },
    { "t": "ISO", "type": "funnel_complete", "step": 6, "route": "online", "tarif": "optimal", "premium": 93.08, "addons": ["fit"], "reasons": [] }
    // full chronological stream
  ]
}
```

### Event types
- `page_enter` — user landed on a funnel step
- `button` — any tracked button click (`key` + counter)
- `field` — a form field changed
- `funnel_complete` — reached the result page (conversion-style signal)
