/**
 * osVACneo-Parameter – 1:1 aus "osVACneo Master" v366 (Fusion 360) übernommen.
 * Alle Längen in mm. Abgeleitete Werte nutzen exakt die Fusion-Formeln.
 */

export interface OsvacInput {
  /** SteckerDurchmesserInnen (Standard 25 / 32) */
  maleDiameterInner: number;
  /** KupplungDurchmesserInnen (Standard 25 / 32) */
  femaleDiameterInner: number;
  /** SchlauchDurchmesserInnen (Standard 25 27 32 36 38 40 50) */
  hoseDiameterInner: number;
  /** AllgemeinMaterialStärke, erlaubt 7 oder 9 */
  generalMaterialWidth: number;
  /** Spaltmaß Stecker/Kupplung */
  maleFemaleGapSize: number;
  /** Spaltmaß Drehring */
  slipRingGapSize: number;
  /** Spaltmaß Stützstruktur */
  supportStructureGapSize: number;
}

export const DEFAULT_INPUT: OsvacInput = {
  maleDiameterInner: 32,
  femaleDiameterInner: 32,
  hoseDiameterInner: 32,
  generalMaterialWidth: 7,
  maleFemaleGapSize: 0.2,
  slipRingGapSize: 0.3,
  supportStructureGapSize: 0.3,
};

export interface OsvacParams extends OsvacInput {
  // Fest
  maleHeight: number;
  femaleHeight: number;
  hoseAdapterFemaleHeight: number;
  generalBayonetNoseWidth: number;
  bajonettNaseDicke: number;
  bajonettNaseHoehe1: number;
  bajonettNaseMaleRandAbstand: number;
  rastnasenStaerke: number;
  hoseAdapterThreadIndentation: number;
  hoseMaleTransitionConeHeight: number;
  generalTextFieldHeight: number;
  generalTextFieldWidth: number;
  generalMiniValue: number;
  /** Drehwinkel des Bajonetts */
  bayonetRotateAngle: number;
  /** Fase am Bajonett (Höhe) */
  bayonetChamfer: number;
  // Abgeleitet
  maleMaterialWidth: number;
  maleDiameterOuter: number;
  maleBayonetNoseWidth: number;
  femaleDiameterMiddle: number;
  femaleMaterialWidth: number;
  femaleDiameterOuter: number;
  femaleBayonetNoseWidth: number;
  hoseAdapterFemaleDiameterOuter: number;
  hoseFemaleTransitionConeHeight: number;
  mxxFyyInner: number;
  mxxFyyOuter: number;
  mxxFyyTransitionConeHeight: number;
}

export function deriveParams(input: Partial<OsvacInput> = {}): OsvacParams {
  const i: OsvacInput = { ...DEFAULT_INPUT, ...input };
  const g = i.maleFemaleGapSize;
  const W = i.generalMaterialWidth;

  const generalBayonetNoseWidth = 10;
  const generalMiniValue = 0.00314159 * 2;

  const maleMaterialWidth = 3 - g / 2;
  const maleDiameterOuter = i.maleDiameterInner + 2 * maleMaterialWidth;
  const femaleDiameterMiddle = i.femaleDiameterInner + 2 * maleMaterialWidth + 2 * g;
  const femaleMaterialWidth = W - (g / 2 + 2);
  const femaleDiameterOuter = femaleDiameterMiddle + 2 * femaleMaterialWidth;

  const mxxFyyInner = Math.max(0, (i.maleDiameterInner - i.femaleDiameterInner) / 2);
  const mxxFyyOuter = Math.max(0, (i.femaleDiameterInner + 2 * W - maleDiameterOuter) / 2);

  return {
    ...i,
    maleHeight: 32,
    femaleHeight: 33.5,
    hoseAdapterFemaleHeight: 27,
    generalBayonetNoseWidth,
    bajonettNaseDicke: 2,
    bajonettNaseHoehe1: 5.8 - 0.3,
    bajonettNaseMaleRandAbstand: 3 + 0.3,
    rastnasenStaerke: 0.4,
    hoseAdapterThreadIndentation: 3.25,
    hoseMaleTransitionConeHeight: 3,
    generalTextFieldHeight: 16,
    generalTextFieldWidth: 40,
    generalMiniValue,
    bayonetRotateAngle: 35,
    bayonetChamfer: 1.2,

    maleMaterialWidth,
    maleDiameterOuter,
    maleBayonetNoseWidth: generalBayonetNoseWidth - g,
    femaleDiameterMiddle,
    femaleMaterialWidth,
    femaleDiameterOuter,
    femaleBayonetNoseWidth: generalBayonetNoseWidth + g,
    hoseAdapterFemaleDiameterOuter: i.hoseDiameterInner + 2 * W,
    hoseFemaleTransitionConeHeight: Math.abs((i.hoseDiameterInner - i.femaleDiameterInner) / 2),
    mxxFyyInner,
    mxxFyyOuter,
    mxxFyyTransitionConeHeight: Math.max(generalMiniValue, Math.max(mxxFyyInner, mxxFyyOuter)),
  };
}
