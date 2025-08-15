import { Location, TileGeometry } from './geometry';
import { buildGeometry } from '../geometry/GeometryBuilder';

// Upstream JSON format from FABulous fabric_serial.json
export interface UpstreamPort {
  name: string;
  ioDirection: "input" | "output";
  width: number;
  sideOfTile?: "NORTH" | "SOUTH" | "EAST" | "WEST";
  terminal?: boolean;
  prefix?: string;
  external?: boolean;
  control?: boolean;
}

export interface UpstreamBel {
  src: string;
  jsonPath?: string;
  prefix: string;
  name: string;
  belType: string; // REG, IO, MEM, etc.
  inputs: UpstreamPort[];
  outputs: UpstreamPort[];
  externalInputs?: UpstreamPort[];
  externalOutputs?: UpstreamPort[];
  configPort?: UpstreamPort[]; // Skip in visualization
  sharedPort?: UpstreamPort[]; // Skip in visualization  
  paramOverride?: Record<string, any>;
  configBits?: number;
  userCLK?: UpstreamPort;
  constantBel?: boolean;
  z?: number; // Z-index for stacking
}

export interface UpstreamTileDefinition {
  name: string;
  ports: Record<string, UpstreamPort[]>;
  bels: UpstreamBel[];
}

export interface UpstreamWireConnection {
  source: UpstreamPort & { tileType?: string };
  xOffset: number;
  yOffset: number;
  destination: UpstreamPort & { tileType?: string };
  wireCount?: number;
}

export interface UpstreamFabricJSON {
  name: string;
  fabricDir?: string;
  height: number;
  width: number;
  frameBitsPerRow?: number;
  maxFramesPerCol?: number;
  contextCount?: number;
  configBitMode?: string;
  multiplexerStyle?: string;
  package?: string;
  generateDelayInSwitchMatrix?: number;
  frameSelectWidth?: number;
  rowSelectWidth?: number;
  desync_flag?: number;
  numberOfBRAMs?: number;
  superTileEnable?: boolean;
  tiles: (string | null)[][];
  tileDict: Record<string, UpstreamTileDefinition>;
  wireDict: Record<string, UpstreamWireConnection[]>; // Key format: "(dx, dy)"
  _subTileToTile: Record<string, string>; // Maps subtiles to base tiles
}

// Backward compatibility interface (for existing code)
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

  // Support both upstream JSON format and legacy minimal format
  static fromRaw(raw: RawSerializedFabricMinimal | UpstreamFabricJSON): FabricData { 
    return buildGeometry(raw); 
  }

  // Support upstream JSON format directly
  static fromUpstream(upstream: UpstreamFabricJSON): FabricData {
    return buildGeometry(upstream);
  }

  toJSON(): FabricDataShape { return { ...this }; }
}
