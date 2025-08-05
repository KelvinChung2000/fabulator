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
    tileGeomMap: Map<string, TileGeometry>;
}

// Utility functions for Location
export const LocationUtils = {
    create: (x: number = 0, y: number = 0): Location => ({ x, y }),
    
    add: (loc: Location, other: Location): Location => ({
        x: loc.x + other.x,
        y: loc.y + other.y
    }),
    
    addInPlace: (loc: Location, other: Location): void => {
        loc.x += other.x;
        loc.y += other.y;
    },
    
    scaleInverse: (loc: Location, value: number): void => {
        loc.x /= value;
        loc.y /= value;
    },
    
    averageOf: (...locations: Location[]): Location => {
        const average = LocationUtils.create();
        for (const location of locations) {
            LocationUtils.addInPlace(average, location);
        }
        LocationUtils.scaleInverse(average, locations.length);
        return average;
    },
    
    isValid: (loc: Location): boolean => {
        return !isNaN(loc.x) && !isNaN(loc.y);
    },
    
    equals: (loc1: Location, loc2: Location): boolean => {
        return loc1.x === loc2.x && loc1.y === loc2.y;
    }
};

// Helper functions for enums
export const SideUtils = {
    fromIdentifier: (identifier: string): Side | undefined => {
        switch (identifier.toUpperCase()) {
            case 'N': return Side.NORTH;
            case 'S': return Side.SOUTH;
            case 'E': return Side.EAST;
            case 'W': return Side.WEST;
            default: return undefined;
        }
    }
};

export const IOUtils = {
    fromIdentifier: (identifier: string): IO | undefined => {
        switch (identifier.toUpperCase()) {
            case 'I': return IO.INPUT;
            case 'O': return IO.OUTPUT;
            default: return undefined;
        }
    }
};