export interface Location {
    x: number;
    y: number;
}

export enum Side {
    NORTH = 'N',
    SOUTH = 'S',
    EAST = 'E',
    WEST = 'W'
}

export enum IO {
    INPUT = 'I',
    OUTPUT = 'O'
}

export interface PortGeometry {
    name: string;
    sourceName?: string;
    destName?: string;
    io?: IO;
    side?: Side;
    relX: number;
    relY: number;
}

export interface WireGeometry {
    name: string;
    path: Location[];
}

export interface LowLodWiresGeometry {
    relX: number;
    relY: number;
    width: number;
    height: number;
}

export interface SwitchMatrixWireGeometry {
    name: string;
    sourcePort: string;
    destPort: string;
    path: Location[];
}

export interface SwitchMatrixConnection {
    sourcePort: string;
    destPort: string;
    // Optional path coordinates for visual routing
    // If not provided, a straight line will be drawn
    customPath?: Location[];
}

export interface BelGeometry {
    name: string;
    relX: number;
    relY: number;
    width: number;
    height: number;
    src?: string;
    portGeometryList: PortGeometry[];
}

export interface SwitchMatrixGeometry {
    name: string;
    relX: number;
    relY: number;
    width: number;
    height: number;
    src?: string;
    csv?: string;
    portGeometryList: PortGeometry[];
    jumpPortGeometryList: PortGeometry[];
    // Internal wire connections within the switch matrix
    wireConnections?: SwitchMatrixConnection[];
    // Generated wire geometries with visual paths
    switchMatrixWires?: SwitchMatrixWireGeometry[];
}

export interface TileGeometry {
    name: string;
    width: number;
    height: number;
    smGeometry?: SwitchMatrixGeometry;
    belGeometryList: BelGeometry[];
    wireGeometryList: WireGeometry[];
    lowLodWiresGeoms: LowLodWiresGeometry[];
    lowLodOverlays: LowLodWiresGeometry[];
    crossTileConnections?: CrossTileConnection[];
    tileCsvPath?: string; // source path to tile connectivity CSV
}

export interface CrossTileConnection {
    direction: string; // NORTH/SOUTH/EAST/WEST
    source: string;
    dest: string;
    dx: number; // tile offset x
    dy: number; // tile offset y
}

export interface FabricGeometry {
    name: string;
    numberOfRows: number;
    numberOfColumns: number;
    width: number;
    height: number;
    numberOfLines: number;
    tileNames: (string | null)[][];
    tileLocations: (Location | null)[][];
    tileGeomMap: { [key: string]: TileGeometry };
}