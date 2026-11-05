"""osVAC neo Referenz-Export (Teil 3).

Ein Skript für beide Designs. Es erkennt am geöffneten Design, welche
Varianten exportiert werden:

  osVACneo Master                    -> Größen 50/40/27 und Spaltmaße
  osVACneo PipesConesFlangesHandles  -> Rohrwand 3/5/6 mm (Schraubenlöcher)

Für jede Variante werden die Parameter gesetzt, Fusion rechnet neu, jede
Komponente wird als STEP und STL exportiert, dazu die Parameterliste als CSV.
Danach werden die Originalwerte wiederhergestellt.

Ausgabe: Dokumente/osvac_export3/<Variante>/...
Das Design danach NICHT speichern.
"""
import adsk.core
import adsk.fusion
import os
import re
import traceback

# Werte als Fusion-Ausdruck. Nicht genannte Parameter bleiben wie im Original.
MASTER = {
    # große Durchmesser (Einlaufschräge, Nutende, Gewindeanfang)
    "M50_F50_H50": {"MaleDiameterInner": "50 mm", "FemaleDiameterInner": "50 mm", "HoseDiameterInner": "50 mm"},
    "M40_F40_H40": {"MaleDiameterInner": "40 mm", "FemaleDiameterInner": "40 mm", "HoseDiameterInner": "40 mm"},
    # kleinster Schlauch, gemischte Größen (Übergänge)
    "M25_F25_H27": {"MaleDiameterInner": "25 mm", "FemaleDiameterInner": "25 mm", "HoseDiameterInner": "27 mm"},
    "M40_F25_H50": {"MaleDiameterInner": "40 mm", "FemaleDiameterInner": "25 mm", "HoseDiameterInner": "50 mm"},
    # Spaltmaße bei bekannter Größe, damit nur der Spalt sich ändert
    "M32_F32_H36_G04_S05": {"MaleDiameterInner": "32 mm", "FemaleDiameterInner": "32 mm", "HoseDiameterInner": "36 mm",
                            "MaleFemaleGapSize": "0.4 mm", "SlipRingGapSize": "0.5 mm"},
}

# Basis wie Variante coneB aus Teil 2 (dort 4 mm Wand, Löcher 0,13 mm zu tief)
_CONE_B = {"PipeConeDiameter1Inner": "30 mm", "PipeConeDiameter2Inner": "30 mm",
           "TransitionConeLength": "12 mm", "UpperPipeConeLength": "20 mm"}
PIPES = {
    "coneB_W3": dict(_CONE_B, PipeConeMaterialWidth="3 mm"),
    "coneB_W5": dict(_CONE_B, PipeConeMaterialWidth="5 mm"),
    "coneB_W6": dict(_CONE_B, PipeConeMaterialWidth="6 mm"),
    "coneB_D40_W4": dict(_CONE_B, PipeConeMaterialWidth="4 mm",
                         PipeConeDiameter1Inner="40 mm", PipeConeDiameter2Inner="40 mm"),
}

OUT_ROOT = os.path.join(os.path.expanduser("~"), "Documents", "osvac_export3")


def safe(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name).strip("_")


def run(context):
    app = adsk.core.Application.get()
    ui = app.userInterface
    log_lines = []

    def log(msg):
        log_lines.append(msg)

    params = None
    original = {}
    try:
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox("Kein aktives Design.\nBitte 'osVACneo Master' oder "
                          "'osVACneo PipesConesFlangesHandles' öffnen.")
            return
        params = design.userParameters

        if params.itemByName("PipeConeDiameter1Inner") is not None:
            variants, kind = PIPES, "pipes"
        elif params.itemByName("HoseDiameterInner") is not None:
            variants, kind = MASTER, "master"
        else:
            ui.messageBox("Unbekanntes Design.\nBitte 'osVACneo Master' oder "
                          "'osVACneo PipesConesFlangesHandles' öffnen.")
            return

        log("Dokument: " + app.activeDocument.name + " (" + kind + ")")
        out_base = os.path.join(OUT_ROOT, kind)
        os.makedirs(out_base, exist_ok=True)

        touched = set(k for v in variants.values() for k in v)
        for k in touched:
            p = params.itemByName(k)
            if p is None:
                ui.messageBox("Parameter '%s' nicht gefunden." % k)
                return
            original[k] = p.expression

        em = design.exportManager
        progress = ui.createProgressDialog()
        progress.show("osVAC neo Export", "Variante %v von %m", 0, len(variants), 0)

        for n, (vname, values) in enumerate(variants.items()):
            progress.progressValue = n
            progress.message = vname + " (%v von %m)"
            adsk.doEvents()
            out_dir = os.path.join(out_base, vname)
            os.makedirs(out_dir, exist_ok=True)
            log("\n=== " + vname)

            for k, expr in original.items():
                params.itemByName(k).expression = expr
            for k, expr in values.items():
                params.itemByName(k).expression = expr
            design.computeAll()
            adsk.doEvents()

            with open(os.path.join(out_dir, "parameters.csv"), "w", encoding="utf-8") as f:
                f.write("name;expression;value;unit;comment\n")
                for i in range(params.count):
                    p = params.item(i)
                    val = p.value * 10 if p.unit in ("mm", "cm", "m", "in") else p.value
                    f.write("%s;%s;%.4f;%s;%s\n" % (p.name, p.expression, val, p.unit,
                                                     (p.comment or "").replace(";", ",")))

            done = set()
            for occ in design.rootComponent.allOccurrences:
                comp = occ.component
                if comp.bRepBodies.count == 0 or comp.name in done:
                    continue
                done.add(comp.name)
                base = os.path.join(out_dir, safe(comp.name))
                try:
                    em.execute(em.createSTEPExportOptions(base + ".step", comp))
                    log("STEP ok: %s (Körper: %d)" % (comp.name, comp.bRepBodies.count))
                except Exception as e:
                    log("FEHLER STEP %s: %s" % (comp.name, e))
                try:
                    stl = em.createSTLExportOptions(occ, base + ".stl")
                    stl.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
                    stl.isBinaryFormat = True
                    em.execute(stl)
                except Exception as e:
                    log("FEHLER STL %s: %s" % (comp.name, e))
                # Schlauchteil zusätzlich sehr fein (Lücke im Knickschutz)
                if kind == "master" and comp.name.startswith("Hose"):
                    try:
                        stl = em.createSTLExportOptions(occ, base + "_fein.stl")
                        stl.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementCustom
                        stl.surfaceDeviation = 0.001       # cm = 0,01 mm
                        stl.normalDeviation = 0.087        # rad = 5°
                        stl.maximumEdgeLength = 0.1        # cm = 1 mm
                        stl.isBinaryFormat = True
                        em.execute(stl)
                    except Exception as e:
                        log("FEHLER STL fein %s: %s" % (comp.name, e))

        progress.hide()
        ui.messageBox("Fertig.\n\nExport liegt in:\n%s\n\nDesign NICHT speichern." % out_base)
    except Exception:
        log("ABBRUCH:\n" + traceback.format_exc())
        ui.messageBox("Fehler:\n" + traceback.format_exc())
    finally:
        try:
            if params is not None:
                for k, expr in original.items():
                    params.itemByName(k).expression = expr
                adsk.fusion.Design.cast(app.activeProduct).computeAll()
        except Exception:
            pass
        try:
            os.makedirs(OUT_ROOT, exist_ok=True)
            name = "export_log_%s.txt" % ("pipes" if params is not None and params.itemByName("PipeConeDiameter1Inner") else "master")
            with open(os.path.join(OUT_ROOT, name), "w", encoding="utf-8") as f:
                f.write("\n".join(log_lines))
        except Exception:
            pass
