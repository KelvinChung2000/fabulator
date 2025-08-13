import { Location, TileGeometry } from './geometry';
import { buildGeometry } from '../geometry/GeometryBuilder';

export interface RawSerializedFabricMinimal {
  name: string;
  height: number;
  width: number;
  tiles: (string | null)[][];
  tileDict: any;
  wireDict: any;
  _subTileToTile: any;
  [k: string]: any;
}

export interface FabricDataShape {
  name: string;
  numberOfRows: number;
  numberOfColumns: number;
  width: number;
  height: number;
  numberOfLines: number;
  tiles: (string | null)[][];
  tileNames: (string | null)[][];
  tileDict: any;
  wireDict: any;
  _subTileToTile: any;
  tileGeomMap: { [key: string]: TileGeometry };
  tileLocations: (Location | null)[][];
  meta: Record<string, any>;
  tilePixelWidth: number;
  tilePixelHeight: number;
}

export class FabricData implements FabricDataShape {
  name!: string; numberOfRows!: number; numberOfColumns!: number; width!: number; height!: number; numberOfLines!: number;
  tiles!: (string | null)[][]; tileNames!: (string | null)[][]; tileDict!: any; wireDict!: any; _subTileToTile!: any;
  tileGeomMap!: { [key: string]: TileGeometry }; tileLocations!: (Location | null)[][]; meta!: Record<string, any>;
  tilePixelWidth!: number; tilePixelHeight!: number;

  static TILE_PIXEL_WIDTH = 120;
  static TILE_PIXEL_HEIGHT = 120;

  private constructor(init: Partial<FabricDataShape>) { Object.assign(this, init); }

  static fromRaw(raw: RawSerializedFabricMinimal): FabricData { return buildGeometry(raw); }

  toJSON(): FabricDataShape { return { ...this }; }
}
