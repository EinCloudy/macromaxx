# MacroMaxx Plugins

Plugins sind kleine JavaScript-Module. Öffne **Einstellungen → Plugins → Plugin-Ordner** und lege dort für jedes Plugin einen eigenen Ordner an. Danach **Plugins neu laden** und im Editor die Aktion **Plugin** auswählen.

## Beispiel

`mein-plugin/manifest.json`:

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "description": "Eine eigene Aktion",
  "main": "index.mjs",
  "fields": [
    { "key": "name", "label": "Name", "default": "Welt" }
  ]
}
```

`mein-plugin/index.mjs`:

```js
export async function execute(config, context) {
  return {
    label: `Hi ${config.name || 'Welt'}!`,
    color: '#86efac',
    message: `Ausgeführt auf ${context.platform}`
  };
}
```

`id` besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und muss eindeutig sein. Für ES-Module `.mjs` verwenden, alternativ `"type": "module"` in einer eigenen `package.json` setzen. Node.js-Module können importiert werden; weitere Abhängigkeiten müssen im Plugin-Ordner installiert werden.

## Schnittstelle

- `execute(config, context)` wird bei jedem Tastendruck in einem **neuen separaten Prozess** gestartet.
- `config` enthält die JSON-Konfiguration der Aktion. `fields` stellt einfache Texteingaben dafür im Editor bereit; komplexere Werte können im JSON-Feld eingegeben werden.
- `context.platform`: `linux`, `darwin` oder `win32`.
- Das Ergebnis kann `label` (max. 80 Zeichen), `color` (`#rrggbb`) und `message` (Aktivitätsprotokoll) enthalten. Beschriftung/Farbe werden auf der Taste aktualisiert und gespeichert.
- Fehler durch `throw new Error('…')` melden. Die Einstellung „Bei Fehler abbrechen“ wird auch für Plugins berücksichtigt.
- Ein erneuter Druck auf eine laufende Aktionskette oder „Alle stoppen“ beendet den Plugin-Prozess. Maximale Laufzeit: 15 Sekunden.
- Keine dauerhaften Hintergrunddienste oder selbstständig geöffneten Unterprozesse verwenden: Plugins sind einzelne Aktionen.

Plugins haben dieselben Dateisystem- und Netzwerkrechte wie dein Benutzerkonto. Die Prozessisolierung verhindert keine Zugriffe auf Benutzerdaten; sie dient der Stabilität. Es handelt sich um eine eigene MacroMaxx-Schnittstelle, nicht um Elgato-Plugin-Kompatibilität.

Ein funktionsfähiges Beispiel befindet sich im Projekt unter `plugins/hello/`.
