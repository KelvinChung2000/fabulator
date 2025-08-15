import { describe, it, expect } from 'vitest';
import { FabricData } from '../src/webview/ui/src/types/FabricData';

describe('GeometryBuilder', () => {
  it('creates geometry with synthesized BEL ports', () => {
    const raw = {
      name: 'fab',
      height: 1,
      width: 2,
      tiles: [['A','B']],
      tileDict: { A: { bels: [{ z:0 }] }, B: { bels: [] } },
      wireDict: {},
      _subTileToTile: {}
    } as any;
    const data = FabricData.fromRaw(raw);
    expect(data.tileGeomMap['A'].belGeometryList.length).toBe(1);
    expect(data.tileGeomMap['A'].belGeometryList[0].portGeometryList.length).toBeGreaterThanOrEqual(2);
    expect(data.tileLocations[0][1]?.x).toBe(120);
  });
});
