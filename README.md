# osVAC neo Baukasten

Der **osVAC neo Baukasten** gestaltet Absaugadapter für das System osVAC neo und läuft komplett im Browser. Ein Wizard führt durch Verbindung, Größen, Passung und Download. Am Ende gibt es das Teil als **3MF**, **STL** oder **STEP**.

Was sich von Version zu Version geändert hat, steht in [CHANGELOG.md](CHANGELOG.md) und in der App im Schritt „Download“.

Es werden keine neuen Adapter erfunden. Jedes Teil ist ein parametrisiertes Originalteil von osVAC neo: Profile, Bajonett, Toleranzen und Formeln stammen aus dem Fusion-360-Master **osVAC neo v366 (beta)** und wurden gegen Fusion-Exporte in mehreren Größen geprüft.

## Adaptertypen

| Typ | Aufbau | Fusion-Vorlage |
|---|---|---|
| Stecker ↔ Kupplung | Female, Übergangskonus, Male, Druckhilfe | MxxFyy |
| Kupplung einzeln | Female | Female (Kupplung) |
| Stecker einzeln | Male, Druckhilfe | Male (Stecker) |
| Kupplung ↔ Schlauch | Female, Übergang, Drehring (2 Ringe), Gewindekörper, Gewinde, Knickschutz | FxxHyy |
| Stecker ↔ Schlauch | Male, Gehäuse, Drehring (2 Ringe), Gewindekörper, Gewinde | MxxHyy |
| Kupplung → Stutzen | Female, Dichtnut-Füllung, Übergang, Rohrkonus | Fxx To Pipe Cone |
| Stecker → Stutzen | Male, Übergang, Rohrkonus | Mxx To Pipe Cone |
| Schieber einzeln | Unterteil und Oberteil (verschraubt, je eine Muffe), Schieberplatte, ggf. Wandhalter | eigene Erweiterung, siehe unten |
| Freiform | Anschluss A (Female oder Male), Übergang, Bausteine, Ende B (Gerät oder Female/Male) | eigene Erweiterung, siehe unten |

Einstellbar: Durchmesser von Stecker, Kupplung und Schlauch, Spaltmaß Stecker/Kupplung, Spaltmaß Drehring (ab 0,2 mm, Standard 0,3 wie im Original; an der Kupplung höchstens 0,5 mm bei 7 mm bzw. 0,35 mm bei 9 mm Materialstärke, im Gehäuse bis 0,8 mm), Materialstärke (7 oder 9 mm), Druckhilfe (die Beschriftung ist immer dabei) sowie beim Stutzen Befestigungsart, Durchmesser vorne und in der Tiefe, Steckweg, Wandstärke, Zugabe, Übergangslänge (TransitionConeLength, Standard 8 mm), Schraubenlöcher, Klemmrippen (aufgesteckt innen, eingesteckt außen; eingesteckt möglichst neben der Beschriftung) und beim Aufstecken Schlitze für eine Schlauchschelle (2 Stück bei 0° und 180°, zwischen Löchern und Schrift; 80 % der Rohrlänge, Breite Umfang/40).

### Schieber einzeln

Absperrschieber (Blast Gate) für Rohre mit 15–60 mm Außen-Ø (`src/lib/osvac/gate.ts`), zweiteilig zum Verschrauben (Sandwich). Das Rohr steckt beidseitig in einer Muffe (Tiefe einstellbar, Standard 20 mm, Spiel 0,4 mm) bis zu einem Anschlag 2 mm enger als das Rohr, der Anschlag läuft unter 45° zur Bohrung aus. Unterteil: Muffe, Boden (mindestens 3,5 mm) und der Kanal für die Platte (Platte 4 mm, Spiel 0,3 mm oben und unten in Schritten von 0,1 mm, 0,3 mm seitlich), dazu die Wandplatte. Oberteil: Deckel mit Muffe. Grundriss achteckig (Ecken unter 45° gebrochen, an den Enden des Kanals 1,6 mm Seitenwand), zur Muffe läuft das Gehäuse unter 50° aus; die Muffen haben innen eine Einführfase 0,6 mm. Boden, Kanal und Lippen liegen im 0,2-mm-Schichtraster (Druckhinweis: mit 0,2 mm Schichthöhe drucken), sonst rundet der Slicer die Pressung weg. Um die Bohrung sitzt oben und unten eine Dichtlippe (0,4 mm hoch, 1,2 mm breit, 1 mm neben der Bohrung), die beim Standardspiel je Seite 0,1 mm auf die Platte drückt (ab 0,4 mm Spiel liegt sie nur an): dicht gegen Falschluft über die offenen Enden des Kanals, und die Platte bleibt durch Reibung stehen. Vier Schrauben M3 neben dem Kanal (Wand zum Kanal mindestens 1,2 mm, nach außen und zur gebrochenen Ecke 1,6 mm), Muttern in Sechskant-Taschen von unten im Unterteil, Köpfe versenkt im Oberteil (Auflage je 2,4 mm vor dem Kanal, mit Brückenhilfe: erste Schicht über der Tasche ein Schlitz so breit wie das Loch, zweite ein Quadrat, dann das Loch; bei kleinen Schiebern, wo sich die Muttern einer Seite berühren würden, nur eine Schraube je Seite; die Taschen laufen senkrecht und öffnen sich unten in der Schräge); die Länge steht in den Druckhinweisen. Gedruckt werden beide Gehäuseteile mit der Muffe auf dem Bett (das Oberteil umgedreht, eigenes Objekt im 3MF), ohne Brücke über einem Schlitz und ohne Stützen; nur die Auflagen von Mutter und Kopf sind kleine, gerade Brücken. Die Platte (eigenes Objekt, flach davor) hat ein volles Stück und ein Fenster. Anschläge: beide Enden sind 2,5 mm dicker als die Platte, der Griff schlägt bei „zu“ am Oberteil an, das andere Ende (8 mm) bei „auf“. Die Platte wird vor dem Aufschrauben des Oberteils eingelegt. Befestigung: ohne, Wandplatte am Unterteil über die ganze Höhe mit vier Senklöchern (Ø 4 mm, je Seite unten und oben), zwei Schlüssellöcher oder ein eigener Wandhalter (Ring mit Öffnung zum Einklipsen); das Oberteil ist hinten 0,4 mm schmaler und berührt die Wandplatte nicht. Wandplatte und Wandhalter passen für senkrechtes und waagerechtes Rohr (symmetrisch, gedreht anschrauben). Nur bei den Schlüssellöchern wählt man die Lage an der Wand: bei senkrechtem Rohr zeigt der Schlitz zum oberen Ende, bei waagerechtem sitzen beide Löcher auf einer Seite mit dem Schlitz dorthin (Kopf neben dem Gehäuse). Der Wandabstand wird bis zur Rohrmitte angegeben, kleinster Wert = Teil direkt an der Wand, höchstens 50 mm mehr. `npm run test:freeform` prüft je Variante: Netze geschlossen, Unter- und Oberteil überlappen nicht, die Platte berührt zu und auf nur die Dichtlippen, schlägt an beiden Enden an, Dichthöhen im 0,2-mm-Raster, Überhang wie in der App unter 40 mm², und die Teile liegen auf dem Bett nebeneinander. Gespeicherte Stände werden beim Laden auf die Bereiche der Eingabefelder begrenzt (Spiel der Platte auf das 0,1-mm-Raster).

### Freiform

Für Geräte ohne runden Stutzen oder für Winkel und Versätze. Der Adapter wird im Schritt „Aufbau“ als Kette zusammengesetzt:

- **Anschluss A** am Anfang der Kette: Kupplung oder Stecker von osVAC neo in den Standardgrößen oder frei (15–60 mm), mit 8-mm-Übergangskonus auf die Wandstärke der Bausteine.
- **Bausteine** in beliebiger Reihenfolge: **Gerade** (Länge), **Bogen** (Winkel, Radius der Mittellinie, Richtung), **Übergang** (neuer Querschnitt, Länge, Versatz, Knick, Verdrehung), **Absatz** (neuer Querschnitt mit 45°-Schräge, Länge automatisch). **Abzweig** (Y- oder T-Stück, Vorlage „Y-Abzweig 45°“): ein zweiter, runder Abgang mit Winkel 30–90°, eigenem Innen-Ø (höchstens so weit wie das Rohr), Richtung und Länge über das Rohr hinaus; er sitzt mittig auf einem runden Rohrstück, dessen Länge mindestens so groß sein muss, dass der Abzweig ganz darauf passt. Am Abzweig sitzt **Ende C** mit denselben Möglichkeiten wie Ende B (Kupplung, Stecker oder Gerät mit Stutzen, Öffnung oder Flansch). Höchstens ein Abzweig je Adapter; das Rohr davor muss rund sein. Rohr und Abzweig werden außen vereinigt und beide Bohrungen herausgeschnitten (mit Volumen-Gegenprobe); die Innenkante der Einmündung wird ausgerundet (Radius 2 mm, notfalls kleiner – größer würde die Rundung beim Drucken überhängen; bei gleich weiten Bohrungen wird die Bohrung des Abzweigs zur Mündung hin um 0,3 mm im Radius enger, sonst scheitert die Ausrundung). Ab 50° gibt es den **gebogenen Abzweig**: erst unter 45° aus dem Rohr, dann im Bogen (Radius 1,5 × Ø) auf den Winkel, danach das gerade Stück. Strömung: Der Sauger gehört an Anschluss A (Hinweis am Abzweig); ab 60° ohne Bogen kommt ein Hinweis mit den Vorschlägen „Winkel auf 45°“ und „Gebogenen Abzweig einschalten“. Ende C liegt nie auf dem Druckbett; Kupplung oder Stecker an C stehen schräg und brauchen Stützen (Hinweis im Aufbau und in den Druckhinweisen). **Schieber** (Vorlage „Absperrschieber“, Stecker an beiden Enden): dasselbe verschraubte Gehäuse wie beim Schieber einzeln (Kanal, Dichtlippen an Boden und Deckel, M3 mit Muttern, Platte mit dicken Enden) auf einem runden Rohrstück (Länge mindestens so, dass das Gehäuse mit seinen Schrägen passt), Richtung der Platte wählbar, höchstens ein Schieber je Adapter. Der Adapter wird am Schieber geteilt und in zwei Teilen gedruckt: das A-Teil (bis zum Unterteil mit Kanal) steht auf Anschluss A, das B-Teil (ab dem Deckel) auf Ende B, beide mit der Trennfläche oben, das B-Teil ist ein eigenes Objekt im 3MF; „Was liegt unten?“ entfällt dann, an beiden Enden gibt es Druckhilfe bzw. bei einer Kupplung einen Hinweis. Boden und Trennfläche liegen beim Druck im 0,2-mm-Raster, gedacht für 0,2 mm Schichthöhe (das Gehäuse wird dazu auf dem Rohr bis 0,1 mm verschoben und das Rohr hinter dem Deckel bis 0,2 mm verlängert). Liegt zwischen Schieber und Ende ein Bogen, steht das Gehäuse schräg: Hinweis. Die Platte liegt flach vor dem Adapter. Waagerechte Flächen am Schieber (Decken der Muttertaschen) zählen nicht als Überhang.
- **Ende B**: ein Geräteanschluss (aufgesteckt als Muffe/Haube oder eingesteckt als Zapfen, mit Steckweg, Zugabe, Drehung, Einführfase und beim Zapfen optional einem Anschlagring) oder wieder eine Kupplung bzw. ein Stecker. Ein automatischer Übergang führt vom letzten Baustein auf den Querschnitt des Endes.
- **Flansch** („Mit Flansch“, Vorlage „Flansch am Gehäuse“): Ende B wird eine flache Platte zum Anschrauben, die beim Drucken unten auf dem Bett liegt (Skizze im Aufbau). Angegeben wird die Öffnung im Gerät. Standard: Rand 15 mm rund um die Öffnung (Form folgt der Öffnung), Dicke 5 mm, Löcher Ø 4,5 mm mit 90°-Senkung für M4, automatisch verteilt (eins in jeder Ecke, an langen Rundungen an deren Enden, dazwischen höchstens 70 mm Abstand; runde Formen mindestens 4). In den Feineinstellungen „Lochbild nach Maß“: rechteckige Platte mit Lochabstand und Löchern je Seite (2–6, gleichmäßig auf dem Rand des Lochbilds) runde Platte mit Lochkreis oder dreieckige Platte (abgerundetes Dreieck, immer 3 Löcher, je eins in einer Ecke auf dem Lochkreis, Eckradius = Senkung + 4 mm, Drehung einstellbar); Loch-Ø frei (Senkung passt sich an). Die Werte werden aus dem automatischen Flansch vorbelegt und laufen mit der Öffnung mit, bis man sie von Hand ändert; danach schlägt der Link „Platte und Löcher neu vorschlagen“ (Erklärung hinter dem „?“) sie wieder neu vor. Extra: Nut für Moosgummi-Dichtband auf der Anlagefläche (2 mm Steg an der Öffnung, 6, 9 oder 10 mm breit, 1,5 mm tief; der Rand wächst passend mit). Ab 100 mm Plattengröße empfehlen die Druckhinweise einen Brim. Die schnelle Vorschau zeigt den Flansch ohne Löcher und Nut, die kommen in der vollen Berechnung. Zu schmaler Rand, Löcher zu nah an Öffnung, Dichtung oder Plattenrand und zu dichte Löcher werden mit verständlicher Meldung abgefangen.
- **Extras am Geräteanschluss** (eingeklappt unter „Extras“): Klemmrippen für einen Presssitz (dreieckig, 1,6 mm breit, ragen 0,3 mm über die Gerätefläche), Längsschlitze für eine Schlauchschelle (nur aufgesteckt und nur bei Kreis, Ellipse und D-Form, denn an eckigen Formen drückt eine Schelle nur auf die Ecken; fest nach Größe: 80 % der Tiefe, Breite Umfang/40 = 2,5–4 mm, mit Schraubenlöchern je einer mittig zwischen zwei Löchern, sonst 3/4/6 je nach Umfang < 100 / ≤ 200 / > 200 mm; runder Schlitzgrund), Schraubenlöcher (Kreis und Ellipse 3 gleichmäßig, Formen mit geraden Seiten je eins mittig auf jeder Seite ab 14 mm, D-Form auf der Abflachung und 2 weitere; aufgesteckt Ø 4 mit Senkung wie beim Rohrkonus, eingesteckt Ø 3,2 zum Eindrehen; 8 mm vom Rand) und eine Aussparung am offenen Rand (nur aufgesteckt; Breite, Tiefe, Lage). Löcher, Schlitze und Rippen liegen versetzt zueinander und entfallen im Bereich der Aussparung.
- Querschnitte: Kreis, Ellipse, Langloch, Rechteck (Eckradien oben und unten getrennt), D-Form (Kreis mit Abflachung), Trapez. Maße der Bausteine sind die lichte Weite, die Wandstärke (1,6–8 mm) kommt außen dazu; am Gerät wird das gemessene Maß eingegeben.
- Vorlagen nach Beispielen von Thingiverse: Winkel 90° (stefanegg), rechteckige Haube (esbenrug, Bosch PSM 18 LI), Versatz mit Knick (dynamic-cube, Einhell TC-BJ 900), Gerade auf Stutzen.
- Wahlweise liegt Ende B oder Anschluss A auf dem Druckbett. Ein Stecker unten bekommt die Druckhilfe; steht eine Kupplung auf ihrer Öffnung (auch an einem Ende mit Schieber), zeigen Aufbau und Druckhinweise „Stützen nötig“: die Decke der Bajonett-Nut hängt dann etwa 2 mm breit waagerecht in der Luft (die Stützen-Prüfung zählt die Teile von osVAC neo sonst nicht mit). Nach der Berechnung meldet die Überhang-Prüfung (src/lib/overhang.ts: Fläche der Bausteine, die steiler als 45° frei nach unten zeigt) im Aufbau und in den Druckhinweisen, ob Stützmaterial nötig ist. Stoßflächen zwischen zwei Körpern zählen nicht mit, ebenso waagerechte Brücken am Geräteanschluss.
- Vorschau: Der Adapter steht immer mittig auf dem Druckbett; ist er größer als 170 mm, wächst das Bett in der Vorschau mit. Ab 220 mm Breite bzw. 250 mm Höhe erscheint im Download ein Hinweis zur Druckbettgröße. Ragt ein Teil tiefer als das Ende auf dem Druckbett (z. B. U-Bogen nach unten), ist der Adapter so nicht druckbar: roter Hinweis im Aufbau, Download gesperrt.
- Prüfungen in Klartext direkt am Baustein, z. B. zu kleiner Bogenradius, D-Form ohne Abflachung, zu steiler Übergang, zu kurzer Steckweg.

**Meldungen mit Vorschlag:** Ist ein Wert zu klein oder zu groß, nennt die Meldung die Grenze und bietet einen Knopf „… auf … setzen“ an (beim Flansch, wenn es zwei Wege gibt, beide, z. B. Platte größer oder Löcher enger). Das betroffene Feld ist rot (Fehler) bzw. gelb (Hinweis) markiert. Gilt für Bausteine, Gerät, Extras, Flansch, Wandstärke und die Stutzen-Hinweise; `npm run test:freeform` prüft, dass jeder Vorschlag seine Meldung auch behebt.

Gerade, Bogen, Anschlagring und Muffe/Zapfen ohne Konus sind exakte Extrusionen bzw. Rotationen einer Ringfläche. Übergänge, Absätze, Fase und konische Geräteanschlüsse sind Lofts durch abgetastete Querschnitte (periodische B-Spline-Interpolation, gleiche Startlage und Laufrichtung bei allen Formen, damit sich nichts verwindet). Außenhaut, Innenhaut und die beiden Ringflächen werden direkt zu einem Körper vernäht statt Innen- von Außenkörper abzuziehen: das ist schneller (unter 1 s statt bis zu 70 s) und bei Freiformflächen zuverlässig. `npm run test:freeform` baut alle Vorlagen, alle Querschnitte auf- und eingesteckt und längere Ketten und prüft jeden Körper. Mit `--teil=1/2` bzw. `--teil=2/2` (`npm run test:freeform:1`/`:2`) läuft nur eine Hälfte; auf GitHub laufen beide Hälften gleichzeitig.

**Saugdüse** (`src/lib/osvac/nozzle.ts`): Formular mit Düsenart (Rundrohr, Fugendüse, gebogen, Breitdüse, Polsterdüse), Anschluss, Länge, Biegung bis 45°, Öffnung, Schräge der Spitze bis 60° und Wandstärke; daraus entsteht eine Freiform-Kette mit dem Ende „Düse“ (Spitze an der schrägen Ebene abgeschnitten). Extras: Schutzring (1,2 mm dicker Rand) und Nut für eine Bürstenleiste (2 × 4 mm im Rand). Der Rand ist in Stufen von höchstens 0,6 mm quer zur Düse abgesetzt; bei schräger Spitze folgt er ihr in Streifen. „In der Freiform weiterbauen“ übernimmt die Düse als Bausteine, „Zurück zur Düse“ führt zum Formular.

**Nebenluft-Regler** (`src/lib/osvac/bleed.ts`, `partsBleed` in `assemblies.ts`): kompakt direkt auf dem Schlauch. Oben Kupplung (Standard) oder Stecker, darunter Rohr mit drei Fenstern (je 50°) und mitgedrucktem Drehring (60° = auf bis zu), unten wie beim Schlauchadapter FxxHyy Drehring für den Schlauch, Schlauchteil mit Gewinde und Knickschutz. Rohr innen wie der Schlauch, außen wie der Schlauchteil. Ring-Querschnitt trapezförmig, Bunde mit 45°-Flanken, Spiel Standard 0,4 mm (0,2–0,6). Raste: Noppe innen am Ring, Mulden im Rohr bei „auf“ und „zu“. Kerben am oberen Bund über den Fenstern. (Der Freiform-Baustein „Nebenluft“ ist in der Oberfläche nicht mehr wählbar; ältere Stände bauen weiter.)

**Eigene Kontur** (`src/lib/osvac/contour.ts`, `src/lib/contour-import.ts`, `ContourPanel.svelte`, `ContourDraw.svelte`): siebte Form „Eigene“ in jeder Formauswahl der Freiform. Wege: SVG/DXF laden (SVG im Browser abgetastet mit Transformationen und Einheiten aus width/viewBox; DXF: LWPOLYLINE/POLYLINE mit Bögen, LINE/ARC verkettet, CIRCLE, ELLIPSE, SPLINE, `$INSUNITS`; mehrere Umrisse → Auswahl), am Foto nachzeichnen (Maßstab aus zwei Punkten auf einem Lineal) oder auf Millimeterraster zeichnen (Punkte ziehen, einfügen, löschen, Eckradius je Punkt). Aufbereitung: spitze Ecken R 0,5, Rundungen dicht abgetastet, Mitte des Umrisses im Ursprung. Versatz für Zugabe und Wand mit Clipper (runde Ecken). Draht: lange Kanten als Linien, Ketten kurzer Kanten als BSpline, an Knicken getrennt. Die Punkte gelten mit Blick auf den Stutzen (von außen); in der Geometrie werden sie gespiegelt, weil die Querschnittsebene in Richtung der Kette gesehen wird. Prüfung: geschlossen, ohne Überschneidung, 6–250 mm; eingesteckt Hinweis bei Stellen, die schmaler als Wand und Luft sind (narrowLoss). SVG: `<use>`/`<symbol>` werden aufgelöst, Vorlagen in `<defs>` nicht mitgezählt. Editor: Rückgängig, Zoom mit zwei Fingern und Knöpfen, Rückfrage vor dem Verwerfen. Testdateien in `scripts/fixtures`. Clipper, der SVG/DXF-Leser und das Zeichenfenster werden nachgeladen (eigene Dateien): Wer mit Konturen rechnet, wartet auf `clipperReady` (CAD-Worker, Skripte); die Planung im Browser rechnet nach dem Laden neu (`app.clipperOk`).

**Drehring-Lösehilfe** (`src/lib/osvac/helper.ts`): nach „osVACneo SlipRingHelper“ von Ludo Kerz (odul), parametrisch nachgebaut (Abgleich mit dem Fusion-Export F32/M32: Abweichung ≤ 0,02 mm, Schrift ausgenommen). Halter für Kupplungen: Block (FemaleDiameterOuter + 2, 33,5 hoch) mit Stecker-Stutzen und drei Rippen bis 3,3 mm unter die Oberkante. Halter für Stecker: Block mit Bohrung wie die Kupplung und sechs Taschen für die Nasen. Schrift „osVAC neo / F32 bzw. M32 / Drehring-Lösehilfe“ 0,5 mm tief; beschriftet wie im Original nach dem Teil selbst (der Halter für Kupplungen ist ein Stecker: M32, der für Stecker eine Kupplung: F32). Fusion-Exportskript: `tools/fusion/export_loesehilfe`.

**Druckbarkeit** (`npm run test:islands`): Düsen, Nebenluft-Regler und Vorlagen werden wie beim Export vernetzt und in 0,2-mm-Schichten geschnitten. Sagt die App „ohne Stützen“, darf nichts frei in der Luft beginnen (außer der untersten Schicht des Drehrings); offene Netzkanten sind immer ein Fehler. Die Stützen-Prüfung der Freiform zählt Kupplungen und Stecker mit, die schräg stehen (nach einem Bogen, am Abzweig).

Wie in Fusion besteht ein Adapter aus mehreren Körpern, die sich berühren oder überlappen. Slicer verschmelzen sie beim Laden. In 3MF liegen sie als Teile eines Objekts vor, in STEP als einzelne Volumenkörper.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
```

Fertige Version bauen und lokal ausliefern:

```bash
npm run build
npm run preview    # http://localhost:4173
```

Der Ordner `dist/` ist eine statische Website und läuft mit jedem lokalen Webserver. Per Doppelklick als `file://` funktioniert er nicht, weil Browser dort keine Web Worker und kein WebAssembly laden.

## Versionsverwaltung mit GitHub

Das Repository ist für die Nutzung auf dem eigenen Rechner gedacht. GitHub dient nur als Ablage und Versionsverwaltung, es wird nichts veröffentlicht. Empfohlen ist ein **privates** Repository.

```bash
git remote add origin https://github.com/<dein-account>/osvacneo-baukasten.git
git push -u origin main
```

Danach reicht nach Änderungen `git add -A`, `git commit -m "…"` und `git push`.

## Aufbau

```
src/
  App.svelte                 Gerüst: Vorschau, Berechnung mit Fortschritt, Schrittleiste
  lib/app.svelte.ts          Zustand aller Schritte (Eingaben, abgeleitete Werte, Export, Speichern im Browser)
  components/steps/          Die Schritte Verbindung, Größen, Passung, Download
  lib/viewer.ts              3D-Ansicht (three.js) mit Druckbett
  lib/cad.ts                 Worker-Pool, Auftragsverteilung, Export STL/STEP/3MF
  lib/worker/cad.worker.ts   OpenCascade (replicad) im Web Worker, Teile-Cache
  lib/worker/threemf.ts      3MF-Writer
  lib/osvac/params.ts        Parameter und Formeln aus Fusion
  lib/osvac/female.ts        Kupplung mit Bajonett, Rastnase, Dichtnut
  lib/osvac/male.ts          Stecker mit Bajonettnasen, Druckhilfe
  lib/osvac/hose.ts          Gewindekörper, Drehring, Gehäuse, Knickschutz
  lib/osvac/thread.ts        Schlauchgewinde (linksgängig, Steigung 5 mm, Konus 4°)
  lib/osvac/machine.ts       Rohrkonus für Stutzen
  lib/osvac/grip.ts          Rändelung und Textfelder
  lib/osvac/assemblies.ts    Baugruppen als Liste einzelner Teile
  lib/osvac/freeform.ts      Freiform: Querschnitte, Bausteine, Prüfungen, Lage auf dem Druckbett
  lib/osvac/catalog.ts       Adaptertypen für den Wizard
  components/FreeformEditor.svelte  Schritt „Aufbau“ (Vorlagen, Bausteine, Ende B)
  components/SectionEditor.svelte   Querschnitt wählen und bemaßen, mit Skizze
  components/BlockFigure.svelte     Erklärskizzen der Bausteine
scripts/
  build-ref.ts               Einzelteil in Node bauen (npm run part -- MxxFyy 25 32 32)
  matrix.ts                  Alle Typen mit Grenzwerten bauen (npm run test:geometry)
  freeform.ts                Freiform-Vorlagen und -Varianten bauen (npm run test:freeform, --stl schreibt out/)
  sketch-overlap.ts          Skizzen auf überlappende Beschriftungen prüfen (npm run build && npm run test:sketches)
  ui-flows.ts                Bedienabläufe im Browser prüfen (npm run build && npm run test:ui)
  islands.ts                 Druckbarkeit in Schichten prüfen (npm run test:islands, braucht python3 mit trimesh/shapely; tools/druck/islands.py)
  lib/preview.ts             gemeinsam für beide: vite preview + Chrome starten
.github/workflows/tests.yml  Alle Prüfungen bei jedem Push (Typen, Build, Schlüssel, Freiform, Skizzen, Bedienabläufe, Geometrie)
```

### Prüfungen

| Befehl | Prüft | Dauer |
|---|---|---|
| `npm run check` | Typen (Svelte und TypeScript) | < 1 min |
| `npm run test:keys` | gleiche Cache-Schlüssel ergeben gleiche Körper | ca. 1 min |
| `npm run test:freeform` | alle Freiform-Vorlagen, Querschnitte, Extras, Flansch (alle Formen, mit Dichtung, Lochbild nach Maß, Prüfungen) und längere Ketten, Stutzen-Typen mit Klemmrippen/Schlitzen, Weg des Hinweises bei weggelassenen Rippen, Rahmen nicht gespiegelt | ca. 4 min |
| `npm run test:sketches` | keine Beschriftung in Skizzen berührt Linien, Flächen oder andere Beschriftungen (braucht `npm run build` und Chrome, Pfad über `CHROME_PATH`) | < 1 min |
| `npm run test:ui` | Bedienabläufe: Neu anfangen, Rückfrage vor Vorlagen, Bereich bleibt offen, Download gesperrt bei Fehlern und bei Teilen unter dem Druckbett, Stand und Druckbett nach dem Neuladen, Extras im Namen, Flansch, Druckhilfe je Verbindung, Link aus den Download-Hinweisen (braucht `npm run build` und Chrome; bei Fehlern Bildschirmfotos in out/) | ca. 1 min |
| `npm run test:geometry` | alle Adaptertypen mit Grenzwerten | ca. 10–15 min |

Auf GitHub laufen alle bei jedem Push (Actions → Tests), in drei gleichzeitigen Gruppen (Oberfläche, Freiform, Geometrie), zusammen etwa 10 Minuten. Kommt ein neuer Push, während ein Lauf noch wartet, ersetzt der neue den wartenden.

### Rechenzeit

- Jede Baugruppe ist eine Liste einzelner Teile. Jedes Teil hat einen Schlüssel aus den Parametern, von denen es wirklich abhängt. Ändert sich nur die Beschriftung, wird nur das Textfeld neu gerechnet; Gewinde, Drehring und Kupplung kommen aus dem Cache.
- Mehrere Web Worker (bis zu 4, je nach CPU-Kernen) rechnen die Teile parallel, teure Teile zuerst. Fertige Teile erscheinen sofort in der Vorschau.
- Grundkörper, Rändelung und Textfelder sind getrennte Körper: Der Rändelring greift 0,3 mm in den Grundkörper und spart die Textfelder aus, die Textfelder (mit gravierter Schrift) greifen 0,05 mm hinein. Rändelung und Schrift hängen nur vom Außendurchmesser ab; ein anderes Spaltmaß rechnet nur den Grundkörper neu, und die volle Berechnung übernimmt den Grundkörper aus der schnellen Vorschau. Im 3MF sind alle Körper Teile desselben Objekts, der Slicer vereinigt sie. Volumen und Fläche der Überlappungen werden für die Filamentangabe herausgerechnet.
- `npm run test:keys` prüft, dass gleiche Zwischenspeicher-Schlüssel in allen Adaptertypen denselben Körper liefern.
- Der Senkkonus des Rohrstutzens nutzt glatte BSpline-Ringe statt Polygonen.
- OpenCascade (22 MB WebAssembly) wird beim Laden der Seite einmal übersetzt und allen Workern übergeben.
- Teure Körper werden zusätzlich im Browser gespeichert (IndexedDB, höchstens 150). Beim nächsten Öffnen ist ein schon einmal berechneter Adapter nach wenigen Sekunden da. Der Schlüssel enthält eine Prüfsumme des Geometrie-Codes; nach einem Update wird neu gerechnet.
- Jeder berechnete Körper wird auf gültige Topologie geprüft (BRepCheck). Scheitert eine Boolesche Operation, erscheint eine Meldung statt eines kaputten Teils. `npm run test:geometry` prüft das ebenso.

### Bedienung

- Ruhige Oberfläche für Laien: Jedes Feld hat eine kurze Beschriftung; die Erklärung steht hinter dem „?“ daneben (src/components/Field.svelte). Werte, die selten geändert werden (Luft/Zugabe, Wandstärke, Übergangslänge, Schraubenlöcher, Drehung, Fase), liegen in eingeklappten „Feineinstellungen“.
- Helle und dunkle Ansicht: Umschalter (Mond/Sonne) ganz rechts in der Kopfzeile, neben „Anleitung“. Start immer hell (unabhängig vom System), die Wahl liegt im localStorage (`osvacneo-theme`) und wird in `main.ts` vor dem ersten Zeichnen gesetzt. Farben stehen als Variablen in `src/app.css` (`:root` hell, `:root[data-theme='dark']` dunkel); Komponenten verwenden nur diese Variablen (z. B. `--card`, `--warn-bg`, `--on-sky`) statt fester Farbwerte.
- Texte in einfacher Sprache, Fachbegriffe vermieden (z. B. „Spiel“ statt „Spaltmaß“ in den Überschriften, „Tiefe“ statt „Steckweg“).
- Schlicht: Zurücksetzen gibt es nur beim Stutzen (alle Stutzen-Maße inkl. Feineinstellungen, die Befestigungsart bleibt), im Schritt „Passung“ und im Freiform-Aufbau (auf die zuletzt gewählte Vorlage, mit Rückfrage), jeweils nur sichtbar, wenn etwas geändert wurde; F, M und H haben keine eigenen Kennfarben mehr, Auswahlen sind überall gleich himmelblau markiert.
- Fehler: Solange ein Fehler vorliegt (Berechnung gescheitert oder rot markierte Prüfung), sind der Reiter „Download“ und der Weiter-Knopf dorthin gesperrt, mit Hinweis über den Knöpfen. In der Oberfläche erscheinen nur verständliche Meldungen (src/lib/errors.ts: `UserError` für eigene Meldungen, alles andere wie WebAssembly-Ausnahmen von OpenCascade nur in der Konsole und als allgemeiner Hinweis bzw. „Baustein n (…) ließ sich mit diesen Maßen nicht berechnen“).
- In Skizzen berührt keine Beschriftung eine Form, Linie oder andere Beschriftung; Eckradien sind mit Hinweislinien außerhalb der Form beschriftet.
- Filamentschätzung: Nach der vollen Berechnung vereinigt ein eigener kleiner Worker (`measure.worker.ts`, manifold-3d) die Netze aller Körper und schneidet das Teil wie ein Slicer in 0,2-mm-Schichten (`printedVolume` in `unionMeasure.ts`): je Schicht 3 Wände (1,36 mm, so verbraucht es Bambu Studio), 5 volle Lagen oben und 3 unten ganz, der Rest mit 15 % Füllung. Abgeglichen an drei in Bambu Studio gesliceten Teilen (Nebenluft F32H36 78,4 g, M36F36 mit Druckhilfe 40,0 g, Flansch D63 63,6 g), Abweichung unter 1 %. Geht das Schneiden nicht, zeigt die App eine Spanne (1,2 mm Hülle + 15 % bis massiv); geht schon die Vereinigung nicht, gilt die Summe der Körper.
- Der Stand (Typ, Größen, Passung, Freiform-Aufbau, Schritt) wird im Browser gespeichert (localStorage) und beim nächsten Öffnen wiederhergestellt; beschädigte oder unbekannte Werte fallen auf den Standard zurück.
- Freiform: Ist der Aufbau gegenüber der Vorlage verändert, fragt ein Klick auf eine Vorlage vorher nach. Nach der Berechnung steht schon im Aufbau, ob Stützen nötig sind. Die Zugabe am Gerät ist bei runden Formen 0,2 mm, bei eckigen 0,4 mm (wechselt mit, solange der Standard drinsteht).
- „Neu anfangen“ unten in Schritt 1 (nur sichtbar, wenn etwas geändert wurde, mit Rückfrage) setzt alle Eingaben auf den Anfang; Druckbett und fertige Dateien bleiben.
- Freiform: Dateiname und Druckbett-Liste nennen die Extras („… Schrauben Aussparung“). Die Lage der Aussparung zeigt eine kleine Skizze des Querschnitts, ein Klick darauf setzt sie. Die schnelle Vorschau rechnet ohne Extras.
- Während der Berechnung zeigt die Vorschau den Fortschritt („3 von 9 Teilen“, ab dem ersten fertigen Teil). Scheitert sie, bleibt das letzte Modell blass stehen; gab es noch keins, erscheint ein Hinweis statt einer leeren Vorschau.
- Im Download-Schritt lassen sich mehrere Adapter auf ein Druckbett legen und zusammen als 3MF, STL oder STEP herunterladen.
- Dateinamen enthalten abweichende Einstellungen (z. B. „osVAC neo F32H36 Drehring 0,4“).

Konvention: Achse = Z, Oberkante eines Moduls bei z = 0, Profile als (r, z). Radien hängen über die Fusion-Formeln von den Eingaben ab, axiale Maße sind fest.

## Anleitung

Die Anleitung für Anwender liegt in der App unter **Anleitung** (Kopfzeile, öffnet `public/anleitung.html`, auch offline im installierten Programm, hell und dunkel).

- Text: `docs/anleitung.md` (einfaches Markdown, erlaubte Zeichen oben in `scripts/anleitung.ts`). Daraus baut `npm run docs` die Seite, `npm run build` macht das jedes Mal mit; die HTML-Datei nicht von Hand ändern.
- Unten in jedem Schritt verlinkt „Mehr dazu in der Anleitung“ das passende Kapitel (`app.docAnchor`). Kapitel-Anker (`{#…}` in der Markdown-Datei) deshalb nicht umbenennen, ohne `docAnchor` mit anzupassen.
- Bilder: `public/anleitung/*.png`, aufgenommen mit `npm run build && npm run docs:bilder` (alle) oder `npm run docs:bilder -- kontur duese` (nur Szenen mit diesem Namen). Jede Szene startet mit Standardwerten; die Szenen stehen in `scripts/anleitung-bilder.ts`.
- **Bei jeder Änderung an der Oberfläche prüfen**, ob die Anleitung betroffen ist (neue oder umbenannte Einstellungen, neue Adapterarten, andere Abläufe): Text in `docs/anleitung.md` anpassen, betroffene Bilder neu aufnehmen, `npm run docs` ausführen und alles mit committen. Ein Eintrag im CHANGELOG reicht dafür nicht.

## Abgleich mit Fusion

Geprüft gegen die Fusion-STEP-Exporte M25/F32/H36, M32/F32/H32, M25/F25/H25, M50/F50/H50, M40/F40/H40,
M25/F25/H27, M40/F25/H50 (7 mm), M25/F32/H36 und M32/F32/H32 (9 mm), M32/F32/H36 mit Spaltmaß 0,4 und
Drehring 0,5 sowie sieben Rohrvarianten (konisch, gerade mit 3–6 mm Wand, Ø 30 und 40): Volumen, waagerechte
Schnitte und ein Flächenvergleich, bei dem für 150 000–300 000 Punkte jeder Oberfläche der exakte Abstand zur
Gegenfläche berechnet wird (Rändelung eingeschlossen, nur die Schrift ausgenommen). Ergebnis: Alle Flächen liegen
innerhalb von 0,1 mm am Original. Einzige Ausnahme: Am Gewindeanfang großer Schläuche (H50) weicht die
Anschnittfläche nahe am Gewindegrund an wenigen Punkten bis 0,15 mm ab; eine Ebene, die H50 genauer trifft,
verschlechtert die kleinen Größen.

Die Werkzeuge dafür liegen in `tools/fusion/` (Fusion-Exportskript und Vergleich, siehe dortige README).

Nicht nachgemessen (fortgeschrieben): Größen unter 25 und über 50 mm, Spaltmaße außer 0,2/0,4 bzw. 0,3/0,5,
Drehring bei 9 mm mit anderem Spaltmaß, Schraubenlöcher an sich verjüngenden Rohren.

| Teil | Volumen gegenüber Fusion | Anmerkung |
|---|---|---|
| Female F32 / F25 (mit Text) | +0,2 % / +0,1 % | Einführkanal mit R-1-Oberkante, Einlaufschräge (Ebene, < 0,1 mm), Rastnase mit R-1-Übergängen und bis an die Schräge reichend, Nutende mit Fase bzw. gerade bei 60° (F25) |
| Male M25 / M32 (mit Text) | +0,5 % / +0,4 % | Unterschied nur in der Beschriftung (Schrift); Nasen mit R 1 am Rohr und an der oberen Außenkante |
| Druckhilfe | ±0,01 % | Stützblöcke enden an der Steckerunterkante, Kerbe zur Fangring-Schräge wie im Original |
| Drehringe, Übergänge, Gehäuse | ±0,2 % | |
| Hose H36 (Schlauchteil, Gewinde, Knickschutz) | +0,1 % | Gewinde mit Anschnitt am Anfang, Auslauf im Knickschutz bzw. Endanschnitt ohne Knickschutz wie im Original |
| Rohrkonus, Übergang, Dichtnut-Füllung | ±0,15 % | Senkung als Fase der Bohrung wie im Original |

Beschriftung: Lage, Größe und Laufweite sind am Original vermessen (Liberation Sans Regular ist maßgleich zu Arial, Abweichung ≤ 0,15 mm). Die Lizenzzeile „CC BY-NC-SA 4.0“ steht wie im Original auf dem Band (Kupplung, Schlauchteil) und oben am Stecker; zusätzlich wird die Lizenz beim Download verlinkt.

Noch nicht umgesetzt: geteilte Varianten (FxxHyyDivided, MxxHyyDivided) mit Stützstruktur, Flansche, Griffe und Düsen aus „PipesConesFlangesHandles“ (einen eigenen Flansch zum Anschrauben gibt es in der Freiform).

## Windows-Programm (Installer)

Der Baukasten lässt sich als eigenes Windows-Programm installieren (Tauri). Er läuft dann in einem eigenen
Fenster mit dem in Windows eingebauten WebView2 (Edge), weiterhin vollständig lokal und ohne Internet.
Externe Links öffnen im Standardbrowser, die Lizenzseiten in einem zweiten Fenster. Anleitung für Tester: `docs/installation-windows.md`.

**Installer bauen lassen (GitHub):** im Repository unter **Actions → Windows-Installer → Run workflow**.
Nach etwa 10–15 Minuten liegt unter dem Lauf bei **Artifacts** eine ZIP mit
`osVAC neo Baukasten_0.5.0_x64-setup.exe`. Alternativ startet ein Versions-Tag den Bau:
`git tag v0.5.0 && git push --tags`.

**Installieren:** Setup-Datei starten. Sie installiert ohne Administratorrechte für den angemeldeten Benutzer
(Startmenü, Deinstallation über „Apps“). Da die Datei nicht signiert ist, meldet Windows beim ersten Start
„Der Computer wurde durch Windows geschützt“: **Weitere Informationen → Trotzdem ausführen**.
Fehlt WebView2 (nur sehr alte Windows-10-Installationen), lädt der Installer es nach.

**Umstieg vom „osVAC neo Konfigurator“ (bis 0.2.0):** Das Programm hat seit 0.3.0 einen neuen Namen und eine
neue App-Kennung. Es wird deshalb neben dem alten installiert, das alte Programm bitte über „Apps“ deinstallieren.
Der zuletzt bearbeitete Adapter wird nicht übernommen, das Programm startet einmal mit dem Standard.
Wer ihn behalten will, lädt ihn vorher im alten Programm herunter oder notiert die Maße.

**Selbst bauen** (Windows mit Rust und Visual Studio Build Tools): `npm ci`, dann `npm run desktop:build`.
Zum Entwickeln im Programmfenster: `npm run desktop:dev`.

## macOS-Programm

Unter **Actions → macOS-Installer → Run workflow** entsteht eine DMG (Universal: Apple Silicon und Intel), ebenfalls als Artefakt.
Auf einem Mac installiert und getestet: läuft. Da die App nicht signiert ist, beim ersten Start im Finder
Rechtsklick → **Öffnen** (oder Systemeinstellungen → Datenschutz & Sicherheit → **Dennoch öffnen**), Einzelheiten in `docs/installation-mac.md`.

## Linux-Programm

Unter **Actions → Linux-Installer → Run workflow** entstehen ein AppImage (ohne Installation, die meisten
Distributionen) und ein .deb (Debian, Ubuntu, Mint), gebaut auf Ubuntu 22.04. Anleitung: `docs/installation-linux.md`.
Selbst bauen (Ubuntu/Debian): `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev`,
dann `npx tauri build --bundles appimage,deb`.

## Alle Installer auf einmal

Ein Versions-Tag startet alle drei Installer-Läufe gleichzeitig: `git tag v0.5.0 && git push origin v0.5.0`.
Die Dateien liegen danach unter **Actions** beim jeweiligen Lauf unter **Artifacts** (Windows, macOS, Linux).
Anleitungen für Tester: `docs/installation-windows.md`, `docs/installation-mac.md`, `docs/installation-linux.md`.

**Downloads im Programm:** Die Oberfläche speichert über den Befehl `save_file` (`src-tauri/src/lib.rs`, Inhalt roh,
Name und Ordner in Kopfzeilen) in den Ordner, der im Schritt Download unter „Speichern in“ gewählt ist (Plugin
„dialog“; gemerkt im localStorage, Standard „Downloads“, freier Name „… (2)“). „Im Ordner zeigen“ nutzt
`revealItemInDir` (Plugin „opener“). Das Hauptfenster wird weiterhin in `lib.rs` erzeugt (`"create": false`), damit
auch Downloads über Links ankommen: unter macOS und Linux setzt `on_download` das Ziel. Im Browser (Chrome, Edge)
lässt sich ein Ordner über `showDirectoryPicker` wählen (gemerkt in IndexedDB), sonst bestimmt der Browser den Ordner.
Unter Linux schaltet `main.rs` den DMA-BUF-Renderer von
WebKitGTK ab (sonst bei manchen Grafiktreibern leeres Fenster).

Die Version steht in `src-tauri/tauri.conf.json` (`version`) und sollte mit `package.json` übereinstimmen.

## Lizenzen

Basiert auf **osVAC neo von Ludo Kerz**, ursprünglich entstanden im Hobbyhimmel Stuttgart.
Für den Baukasten nachgebaut und verändert: Maße, Spaltmaße und Stutzen sind frei einstellbar.
Der osVAC neo Baukasten ist von [paddycodespy](https://github.com/paddycodespy) (in der App im Download-Schritt bei Lizenz und Version; nicht in den exportierten Dateien).

Auch die exportierten Dateien tragen Namensnennung und Lizenz: 3MF in den Metadaten, STL im Dateikopf, STEP im Kopfbereich (Autor, Organisation, Beschreibung).

- **Dieses Projekt** (Quellcode und alle damit erzeugten Teile) steht wie osVAC neo unter **CC BY-NC-SA 4.0**: Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen. Siehe `LICENSE`.
- **Bausteine Dritter** mit eigenen Lizenzen, vollständig in `public/lizenzen.html` (in der App im Download-Schritt verlinkt) und als Text in `public/THIRD_PARTY_LICENSES.txt`:
  - OpenCascade (LGPL 2.1, als WebAssembly unverändert und austauschbar eingebunden)
  - replicad, three.js, Svelte, fflate (MIT)
  - Poppins (Oberfläche) und Liberation Sans Regular (Beschriftung): SIL Open Font License
- Nach neuen Abhängigkeiten `python3 scripts/licenses.py` ausführen, damit die Datei aktuell bleibt.
