"""osVAC neo Referenz-Export: Drehring-Lösehilfe (Design „osVACneo SlipRingHelper“).

Die Parameter der Lösehilfe sind noch nicht bekannt. Das Skript
  1. schreibt alle Parameter des Designs auf (Benutzer- und Modellparameter, auch verknüpfte),
  2. exportiert den Stand wie geöffnet („Standard“),
  3. exportiert weitere Varianten (Größen, Materialstärke 9 mm, Spaltmaß). Gesetzt werden nur Parameter,
     die es im Design gibt und die sich ändern lassen (Name genau oder mit Endung wie „_Ref1“).
     Geht keiner, wird die Variante übersprungen und im Protokoll vermerkt.

Für jede Variante: jede Komponente als STEP und STL, dazu parameters.csv.
Danach werden die Originalwerte wiederhergestellt.

Ausgabe: Dokumente/osvac_loesehilfe/<Variante>/...  und  Dokumente/osvac_loesehilfe/protokoll.txt
Das Design danach NICHT speichern.
"""
import adsk.core
import adsk.fusion
import os
import re
import traceback

# Werte als Fusion-Ausdruck; nicht genannte Parameter bleiben wie im Original
VARIANTS = {
    "Standard": {},
    "M25_F25_H27": {"MaleDiameterInner": "25 mm", "FemaleDiameterInner": "25 mm", "HoseDiameterInner": "27 mm"},
    "M40_F40_H40": {"MaleDiameterInner": "40 mm", "FemaleDiameterInner": "40 mm", "HoseDiameterInner": "40 mm"},
    "M50_F50_H50": {"MaleDiameterInner": "50 mm", "FemaleDiameterInner": "50 mm", "HoseDiameterInner": "50 mm"},
    "W9": {"GeneralMaterialWidth": "9 mm"},
    "M50_F50_H50_W9": {"MaleDiameterInner": "50 mm", "FemaleDiameterInner": "50 mm", "HoseDiameterInner": "50 mm",
                       "GeneralMaterialWidth": "9 mm"},
    "S05": {"SlipRingGapSize": "0.5 mm"},
}

OUT_ROOT = os.path.join(os.path.expanduser("~"), "Documents", "osvac_loesehilfe")
LENGTH = ("mm", "cm", "m", "in")


def safe(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name).strip("_")


def run(context):
    app = adsk.core.Application.get()
    ui = app.userInterface
    log_lines = []

    def log(msg):
        log_lines.append(msg)

    design = None
    original = {}
    try:
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox("Kein aktives Design.\nBitte 'osVACneo SlipRingHelper' öffnen.")
            return
        doc = app.activeDocument.name
        log("Dokument: " + doc)
        if "SlipRing" not in doc and "Helper" not in doc:
            if ui.messageBox("Geöffnet ist '%s'.\nDas Skript ist für 'osVACneo SlipRingHelper'.\nTrotzdem fortfahren?" % doc,
                             "osVAC neo Export", adsk.core.MessageBoxButtonTypes.YesNoButtonType) != adsk.core.DialogResults.DialogYes:
                return
        os.makedirs(OUT_ROOT, exist_ok=True)
        params = design.allParameters

        # Parameter finden: genauer Name, sonst Name mit Endung (z. B. HoseDiameterInner_Ref1)
        def find(name):
            p = params.itemByName(name)
            if p is not None:
                return p
            for i in range(params.count):
                q = params.item(i)
                if q.name.startswith(name + "_") or q.name.startswith(name + "Ref"):
                    return q
            return None

        def settable(p):
            try:
                expr = p.expression
                p.expression = expr  # gleicher Wert: prüft nur, ob sich der Parameter ändern lässt
                return True
            except Exception:
                return False

        usable = {}
        for k in sorted(set(k for v in VARIANTS.values() for k in v)):
            p = find(k)
            if p is None:
                log("Parameter %s: nicht im Design" % k)
            elif not settable(p):
                log("Parameter %s: gefunden als %s, lässt sich hier nicht ändern (verknüpft?)" % (k, p.name))
            else:
                usable[k] = p.name
                original[p.name] = p.expression
                log("Parameter %s: %s = %s" % (k, p.name, p.expression))

        em = design.exportManager
        progress = ui.createProgressDialog()
        progress.show("osVAC neo Export", "Variante %v von %m", 0, len(VARIANTS), 0)
        done_variants = []

        for n, (vname, values) in enumerate(VARIANTS.items()):
            progress.progressValue = n
            progress.message = vname + " (%v von %m)"
            adsk.doEvents()
            values = {usable[k]: e for k, e in values.items() if k in usable}
            if vname != "Standard" and not values:
                log("\n=== %s übersprungen (keiner der Parameter lässt sich setzen)" % vname)
                continue
            log("\n=== " + vname)
            out_dir = os.path.join(OUT_ROOT, vname)
            os.makedirs(out_dir, exist_ok=True)

            for name, expr in original.items():
                params.itemByName(name).expression = expr
            for name, expr in values.items():
                params.itemByName(name).expression = expr
            design.computeAll()
            adsk.doEvents()

            with open(os.path.join(out_dir, "parameters.csv"), "w", encoding="utf-8") as f:
                f.write("name;art;expression;value;unit;comment\n")
                for i in range(params.count):
                    p = params.item(i)
                    art = "user" if adsk.fusion.UserParameter.cast(p) else "model"
                    val = p.value * 10 if p.unit in LENGTH else p.value
                    f.write("%s;%s;%s;%.4f;%s;%s\n" % (p.name, art, p.expression.replace(";", ","), val, p.unit,
                                                        (p.comment or "").replace(";", ",")))

            comps = [(design.rootComponent, None)] + [(o.component, o) for o in design.rootComponent.allOccurrences]
            seen = set()
            for comp, occ in comps:
                if comp.bRepBodies.count == 0 or comp.name in seen:
                    continue
                seen.add(comp.name)
                base = os.path.join(out_dir, safe(comp.name) or "Root")
                names = ", ".join(b.name for b in comp.bRepBodies)
                try:
                    em.execute(em.createSTEPExportOptions(base + ".step", comp))
                    log("STEP ok: %s (Körper: %s)" % (comp.name, names))
                except Exception as e:
                    log("FEHLER STEP %s: %s" % (comp.name, e))
                try:
                    stl = em.createSTLExportOptions(occ if occ is not None else comp, base + ".stl")
                    stl.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
                    stl.isBinaryFormat = True
                    em.execute(stl)
                except Exception as e:
                    log("FEHLER STL %s: %s" % (comp.name, e))
            done_variants.append(vname)

        progress.hide()
        ui.messageBox("Fertig: %d Varianten (%s).\n\nExport liegt in:\n%s\n\nDesign NICHT speichern."
                      % (len(done_variants), ", ".join(done_variants), OUT_ROOT))
    except Exception:
        log("ABBRUCH:\n" + traceback.format_exc())
        ui.messageBox("Fehler:\n" + traceback.format_exc())
    finally:
        try:
            if design is not None:
                for name, expr in original.items():
                    design.allParameters.itemByName(name).expression = expr
                design.computeAll()
        except Exception:
            pass
        try:
            os.makedirs(OUT_ROOT, exist_ok=True)
            with open(os.path.join(OUT_ROOT, "protokoll.txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(log_lines))
        except Exception:
            pass
