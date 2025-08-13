// UnifiedFabricModel: single source of truth for fabric logical + pixel layout
// Provides deterministic JSON serialization without losing dimension fields.

import { Location, TileGeometry, SwitchMatrixGeometry, BelGeometry, WireGeometry, LowLodWiresGeometry, CrossTileConnection } from './geometry';

export interface RawSerializedFabricMinimal {
  name: string;
  height: number; // rows
  width: number;  // columns
  tiles: (string | null)[][];
  tileDict: any; // pass-through
  wireDict: any; // pass-through
  _subTileToTile: any;
  [k: string]: any; // meta
}

export interface UnifiedTileGeom extends TileGeometry {}

export class UnifiedFabricModel {
  // Logical grid dimensions (rows/cols) and pixel geometry
  name!: string;
  numberOfRows!: number;
  numberOfColumns!: number;
  tiles!: (string | null)[][];
  tileDict!: any;
  wireDict!: any;
  _subTileToTile!: any;

  // Pixel scaling factors
  tilePixelWidth!: number;
  tilePixelHeight!: number;
  width!: number;  // pixel width
  height!: number; // pixel height

  tileGeomMap!: { [key: string]: TileGeometry };
  tileLocations!: (Location | null)[][];

  meta!: Record<string, any>;

  private constructor(init: any) {
    Object.assign(this, init);
  }

  static TILE_PIXEL_WIDTH = 120;
  static TILE_PIXEL_HEIGHT = 120;

  static fromRaw(raw: RawSerializedFabricMinimal): UnifiedFabricModel {
    // Build basic tile geometry placeholders (detailed construction can be enhanced later)
    const tileGeomMap: { [k: string]: TileGeometry } = {};
    for (const tileType of Object.keys(raw.tileDict || {})) {
      tileGeomMap[tileType] = tileGeomMap[tileType] || {
        name: tileType,
        width: UnifiedFabricModel.TILE_PIXEL_WIDTH,
        height: UnifiedFabricModel.TILE_PIXEL_HEIGHT,
        smGeometry: undefined,
        belGeometryList: [],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
      } as TileGeometry;
    }
    // Locations
    const locations: (Location | null)[][] = [];
    for (let r = 0; r < raw.height; r++) {
      const row: (Location | null)[] = [];
      for (let c = 0; c < raw.width; c++) {
        if (raw.tiles[r] && raw.tiles[r][c]) {
          row.push({ x: c * UnifiedFabricModel.TILE_PIXEL_WIDTH, y: r * UnifiedFabricModel.TILE_PIXEL_HEIGHT });
        } else { row.push(null); }
      }
      locations.push(row);
    }
    return new UnifiedFabricModel({
      name: raw.name,
      numberOfRows: raw.height,
      numberOfColumns: raw.width,
      tiles: raw.tiles,
      tileDict: raw.tileDict,
      wireDict: raw.wireDict,
      _subTileToTile: raw._subTileToTile,
      tilePixelWidth: UnifiedFabricModel.TILE_PIXEL_WIDTH,
      tilePixelHeight: UnifiedFabricModel.TILE_PIXEL_HEIGHT,
      width: raw.width * UnifiedFabricModel.TILE_PIXEL_WIDTH,
      height: raw.height * UnifiedFabricModel.TILE_PIXEL_HEIGHT,
      tileGeomMap,
      tileLocations: locations,
      meta: raw
    });
  }

  toJSON() {
    // Explicit JSON shape with all required fields
    return {
      name: this.name,
      numberOfRows: this.numberOfRows,
      numberOfColumns: this.numberOfColumns,
      width: this.width,
      height: this.height,
  numberOfLines: 0,
      tiles: this.tiles,
  tileNames: this.tiles, // alias
      tileDict: this.tileDict,
      wireDict: this.wireDict,
      _subTileToTile: this._subTileToTile,
      tileGeomMap: this.tileGeomMap,
      tileLocations: this.tileLocations,
      meta: this.meta
    };
  }
}

// Serializable JSON-facing interface (post to webview)
export interface FabricModel {
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
}
