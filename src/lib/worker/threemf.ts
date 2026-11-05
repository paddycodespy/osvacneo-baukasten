/**
 * Minimaler 3MF-Writer (Core-Spezifikation): ein Objekt je Körper, Einheit mm.
 * Mehrere Körper werden als ein Build-Item mit Komponenten abgelegt, damit Slicer sie
 * als zusammengehörendes Teil laden.
 */
import { zipSync, strToU8 } from 'fflate';

export interface MeshPart {
  name: string;
  /** Mehrere Adapter auf einem Druckbett: Nummer des Adapters (je Adapter ein eigenes Objekt) */
  group?: number;
  vertices: ArrayLike<number>;
  triangles: ArrayLike<number>;
}

/**
 * OpenCascade liefert die Dreiecke flächenweise mit eigenen Eckpunkten. Für ein geschlossenes
 * (wasserdichtes) Netz werden Punkte an gleicher Position zusammengeführt und entartete Dreiecke entfernt.
 */
export function weld(part: MeshPart): MeshPart {
  const map = new Map<string, number>();
  const verts: number[] = [];
  const remap: number[] = [];
  const q = (v: number) => Math.round(v * 1e5);
  for (let i = 0; i < part.vertices.length; i += 3) {
    const key = `${q(part.vertices[i])},${q(part.vertices[i + 1])},${q(part.vertices[i + 2])}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = verts.length / 3;
      map.set(key, idx);
      verts.push(part.vertices[i], part.vertices[i + 1], part.vertices[i + 2]);
    }
    remap.push(idx);
  }
  const tris: number[] = [];
  for (let i = 0; i < part.triangles.length; i += 3) {
    const a = remap[part.triangles[i]];
    const b = remap[part.triangles[i + 1]];
    const c = remap[part.triangles[i + 2]];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { name: part.name, group: part.group, vertices: verts, triangles: tris };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Nur Metadaten-Namen aus der 3MF-Kernspezifikation, sonst lehnen Slicer die Konfiguration ab. */
export function build3MF(parts: MeshPart[], title: string, groupNames?: string[]): Blob {
  let objects = '';
  parts = parts.map(weld);
  parts.forEach((p, i) => {
    const v: string[] = [];
    for (let k = 0; k < p.vertices.length; k += 3) {
      v.push(`<vertex x="${p.vertices[k].toFixed(4)}" y="${p.vertices[k + 1].toFixed(4)}" z="${p.vertices[k + 2].toFixed(4)}"/>`);
    }
    const t: string[] = [];
    for (let k = 0; k < p.triangles.length; k += 3) {
      t.push(`<triangle v1="${p.triangles[k]}" v2="${p.triangles[k + 1]}" v3="${p.triangles[k + 2]}"/>`);
    }
    objects += `<object id="${i + 1}" name="${esc(p.name)}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
  });
  // je Adapter ein Objekt aus seinen Körpern (Slicer laden es als ein zusammengehörendes Teil)
  const groups = [...new Set(parts.map((p) => p.group ?? 0))];
  let items = '';
  groups.forEach((g, gi) => {
    const parentId = parts.length + 1 + gi;
    const comps = parts.map((p, i) => ((p.group ?? 0) === g ? `<component objectid="${i + 1}"/>` : '')).join('');
    const name = groupNames?.[g] ?? title;
    objects += `<object id="${parentId}" name="${esc(name)}" type="model"><components>${comps}</components></object>`;
    items += `<item objectid="${parentId}"/>`;
  });

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(title)}</metadata>
<metadata name="Designer">Ludo Kerz (osVAC neo)</metadata>
<metadata name="Description">Basiert auf osVAC neo von Ludo Kerz, ursprünglich entstanden im Hobbyhimmel Stuttgart. Erzeugt mit dem osVAC neo Konfigurator.</metadata>
<metadata name="LicenseTerms">CC BY-NC-SA 4.0</metadata>
<resources>${objects}</resources>
<build>${items}</build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const zip = zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
  return new Blob([zip], { type: 'model/3mf' });
}
