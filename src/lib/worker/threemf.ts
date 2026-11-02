/**
 * Minimaler 3MF-Writer (Core-Spezifikation): ein Objekt je Körper, Einheit mm.
 * Mehrere Körper werden als ein Build-Item mit Komponenten abgelegt, damit Slicer sie
 * als zusammengehörendes Teil laden.
 */
import { zipSync, strToU8 } from 'fflate';

export interface MeshPart {
  name: string;
  vertices: number[];
  triangles: number[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function build3MF(parts: MeshPart[], title: string): Blob {
  let objects = '';
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
  const parentId = parts.length + 1;
  const comps = parts.map((_, i) => `<component objectid="${i + 1}"/>`).join('');
  objects += `<object id="${parentId}" name="${esc(title)}" type="model"><components>${comps}</components></object>`;

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(title)}</metadata>
<metadata name="Application">osVAC neo Konfigurator</metadata>
<metadata name="License">CC BY-NC-SA 4.0 (osVAC neo)</metadata>
<resources>${objects}</resources>
<build><item objectid="${parentId}"/></build>
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
