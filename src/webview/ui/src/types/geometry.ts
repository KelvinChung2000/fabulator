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