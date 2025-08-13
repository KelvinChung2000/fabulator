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

// Serialized ioDirection values available for ports (BEL and tile level)
export enum PortDirection {
    IN = 'input',
    OUT = 'output',
    INOUT = 'inout'
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

export interface RawSerializedFabric {
    name: string;
    width: number; // count of columns
    height: number; // count of rows
    tiles: (string | null)[][];
    tileDict: {
        [tileType: string]: {
            name: string;
            ports: { [subTileName: string]: any[] };
            bels: { z: number }[];
            switchMatrix: { muxes: any[]; configBits: number };
            configBits: number;
            withUserCLK: boolean;
            tileMap: (string | null)[][];
        };
    };
    wireDict: { [delta: string]: any[] };
    _subTileToTile: { [subTile: string]: string };
    frameBitsPerRow?: number;
    maxFramesPerCol?: number;
    contextCount?: number;
    configBitMode?: string;
    multiplexerStyle?: string;
    generateDelayInSwitchMatrix?: number;
    frameSelectWidth?: number;
    rowSelectWidth?: number;
    desync_flag?: number;
    numberOfBRAMs?: number;
    superTileEnable?: boolean;
}

// Canonical geometry model used internally after deserialization
export class FabricGeometry {
    readonly name: string;
    readonly numberOfRows: number;
    readonly numberOfColumns: number;
    // Physical pixel dimensions
    readonly width: number;
    readonly height: number;
    readonly numberOfLines: number = 0; // placeholder unless provided elsewhere
    readonly tileNames: (string | null)[][];
    readonly tileLocations: (Location | null)[][];
    readonly tileGeomMap: { [key: string]: TileGeometry };
    readonly tiles: (string | null)[][];
    readonly tileDict: RawSerializedFabric['tileDict'];
    readonly wireDict: RawSerializedFabric['wireDict'];
    readonly _subTileToTile: RawSerializedFabric['_subTileToTile'];
    // Metadata passthrough
    readonly frameBitsPerRow?: number;
    readonly maxFramesPerCol?: number;
    readonly contextCount?: number;
    readonly configBitMode?: string;
    readonly multiplexerStyle?: string;
    readonly generateDelayInSwitchMatrix?: number;
    readonly frameSelectWidth?: number;
    readonly rowSelectWidth?: number;
    readonly desync_flag?: number;
    readonly numberOfBRAMs?: number;
    readonly superTileEnable?: boolean;

    // Default visual tile size (can be made configurable later)
    static TILE_PIXEL_WIDTH = 120;
    static TILE_PIXEL_HEIGHT = 120;

    private constructor(init: {
        name: string; rows: number; cols: number; tiles: (string | null)[][]; tileDict: RawSerializedFabric['tileDict'];
        wireDict: RawSerializedFabric['wireDict']; _subTileToTile: RawSerializedFabric['_subTileToTile'];
        meta: Partial<RawSerializedFabric>; tileGeomMap: { [k: string]: TileGeometry }; tileLocations: (Location | null)[][];
    }) {
        this.name = init.name;
        this.numberOfRows = init.rows;
        this.numberOfColumns = init.cols;
        this.tiles = init.tiles;
        this.tileNames = init.tiles; // alias
        this.tileDict = init.tileDict;
        this.wireDict = init.wireDict;
        this._subTileToTile = init._subTileToTile;
        this.tileGeomMap = init.tileGeomMap;
        this.tileLocations = init.tileLocations;
        this.width = init.cols * FabricGeometry.TILE_PIXEL_WIDTH;
        this.height = init.rows * FabricGeometry.TILE_PIXEL_HEIGHT;
        // Meta
        this.frameBitsPerRow = init.meta.frameBitsPerRow;
        this.maxFramesPerCol = init.meta.maxFramesPerCol;
        this.contextCount = init.meta.contextCount;
        this.configBitMode = init.meta.configBitMode;
        this.multiplexerStyle = init.meta.multiplexerStyle;
        this.generateDelayInSwitchMatrix = init.meta.generateDelayInSwitchMatrix;
        this.frameSelectWidth = init.meta.frameSelectWidth;
        this.rowSelectWidth = init.meta.rowSelectWidth;
        this.desync_flag = init.meta.desync_flag;
        this.numberOfBRAMs = init.meta.numberOfBRAMs;
        this.superTileEnable = init.meta.superTileEnable;
    }

    static fromRaw(raw: RawSerializedFabric): FabricGeometry {
        if (!Array.isArray(raw.tiles)) { throw new Error('tiles must be an array'); }
        const rows = raw.height; // authoritative
        const cols = raw.width;  // authoritative
        if (typeof rows !== 'number' || typeof cols !== 'number') {
            throw new Error('height and width must be defined in new JSON format');
        }
        // Non-failing pre-checks: log inconsistencies instead of throwing (except jagged rows)
        if (raw.tiles.length !== rows) {
            console.warn(`FabricGeometry.fromRaw: tiles.length (${raw.tiles.length}) != height (${rows})`);
        }
        const firstLen = raw.tiles[0] ? raw.tiles[0].length : 0;
        let jagged = false;
        for (const r of raw.tiles) { if (r.length !== firstLen) { jagged = true; break; } }
        if (jagged) { console.warn('FabricGeometry.fromRaw: tiles rows have inconsistent column counts'); }
        if (firstLen !== cols) {
            console.warn(`FabricGeometry.fromRaw: tile row column count (${firstLen}) != width (${cols})`);
        }
        // Build tile geometries using tileDict info
        const tileGeomMap: { [k: string]: TileGeometry } = {};
        for (const [tileType, def] of Object.entries(raw.tileDict)) {
            // BEL geometry list: preserve provided names; vertical stack
            const belGeometryList: BelGeometry[] = (def.bels || []).map((b: any, idx: number) => ({
                name: b.name ? String(b.name) : `${tileType}_BEL_${b.z ?? idx}`,
                relX: 8,
                relY: 8 + (idx * 14),
                width: 40,
                height: 12,
                src: b.src,
                portGeometryList: []
            }));

            const smRelX = 20; const smRelY = 20; const smW = 80; const smH = 80;
            const eastX = smRelX + smW - 4; // EAST inside edge (BEL ports)
            const bottomY = smRelY + smH - 4; // SOUTH inside edge
            const westX = smRelX - 6; // WEST just outside (tile outputs)

            const portGeometryList: PortGeometry[] = [];
            const jumpPortGeometryList: PortGeometry[] = [];

            const outputs: PortGeometry[] = []; // WEST vertical (tile outputs)
            const inputs: PortGeometry[] = [];  // SOUTH horizontal
            const north: PortGeometry[] = [];   // NORTH horizontal (fallback + INOUT)
            const west: PortGeometry[] = [];    // BEL ports vertical

            const classify = (meta: any, fallbackName: string): PortDirection => {
                const rawDir = (meta && (meta.ioDirection || meta.direction)) ? String(meta.ioDirection || meta.direction).toLowerCase() : '';
                if (rawDir === PortDirection.IN) { return PortDirection.IN; }
                if (rawDir === PortDirection.OUT) { return PortDirection.OUT; }
                if (rawDir === PortDirection.INOUT) { return PortDirection.INOUT; }
                const n = fallbackName.toLowerCase();
                if (/(in|input)$/.test(n)) { return PortDirection.IN; }
                if (/(out|output)$/.test(n)) { return PortDirection.OUT; }
                return PortDirection.INOUT;
            };

            // Tile-level ports (raw.ports groups)
            for (const [groupName, portArr] of Object.entries(def.ports || {})) {
                const arr = Array.isArray(portArr) && portArr.length ? portArr : [ {} ];
                arr.forEach((meta: any, idx: number) => {
                    const logicalName = `${groupName}_${idx}`;
                    const dir = classify(meta, logicalName);
                    if (dir === PortDirection.OUT) {
                        outputs.push({ name: logicalName, relX: westX, relY: 0, io: IO.OUTPUT, side: Side.WEST });
                    } else if (dir === PortDirection.IN) {
                        inputs.push({ name: logicalName, relX: 0, relY: bottomY, io: IO.INPUT, side: Side.SOUTH });
                    } else { // INOUT / fallback -> NORTH
                        north.push({ name: logicalName, relX: 0, relY: smRelY - 6, side: Side.NORTH, io: undefined });
                    }
                });
            }

            // BEL ports (EAST)
            belGeometryList.forEach((belGeom, idx) => {
                const sourceBel: any = (def.bels || [])[idx];
                if (!sourceBel) { return; }
                const collect = (key: string) => {
                    const arr: any[] = (sourceBel as any)[key] || [];
                    if (!Array.isArray(arr)) { return; }
                    arr.forEach((p: any, i: number) => {
                        const pName = p && p.name ? p.name : `${key}_${i}`;
                        const dir = classify(p, pName);
                        const io = dir === PortDirection.OUT ? IO.OUTPUT : dir === PortDirection.IN ? IO.INPUT : undefined;
                        // Place on EAST side now
                        outputs.push({ name: `${belGeom.name}_${pName}`, relX: eastX, relY: 0, side: Side.EAST, io });
                    });
                };
                collect('inputs');
                collect('outputs');
                collect('configPort');
                collect('sharedPort');
                if (sourceBel && sourceBel.userCLK) {
                    const clkName = sourceBel.userCLK.name || 'clk';
                    outputs.push({ name: `${belGeom.name}_${clkName}`, relX: eastX, relY: 0, side: Side.EAST, io: IO.INPUT });
                }
            });

            // Distribution helpers
            const distribute = (list: PortGeometry[], axis: 'vertical' | 'horizontal', region: 'N'|'E'|'S'|'W') => {
                if (!list.length) { return; }
                if (axis === 'vertical') {
                    const gap = smH / (list.length + 1);
                    list.forEach((p, i) => { p.relY = Math.round(smRelY + gap * (i + 1)); });
                    if (region === 'W') { list.forEach(p => { p.relX = westX; }); }
                    if (region === 'E') { list.forEach(p => { p.relX = eastX; }); }
                } else { // horizontal
                    const gap = smW / (list.length + 1);
                    list.forEach((p, i) => { p.relX = Math.round(smRelX + gap * (i + 1)); });
                    if (region === 'N') { list.forEach(p => { p.relY = smRelY - 6; }); }
                    if (region === 'S') { list.forEach(p => { p.relY = bottomY; }); }
                }
            };
            // Distribute by sides (now outputs contain both BEL (EAST) and tile outputs (WEST) separated by side attribute after distribution)
            distribute(north, 'horizontal', 'N');
            // Split outputs into eastOutputs and westOutputs by side
            const eastOutputs = outputs.filter(p => p.side === Side.EAST);
            const westOutputs = outputs.filter(p => p.side === Side.WEST);
            distribute(eastOutputs, 'vertical', 'E');
            distribute(inputs, 'horizontal', 'S');
            distribute(westOutputs, 'vertical', 'W');

            // Stable ordering within each side
            const byName = (a: PortGeometry, b: PortGeometry) => a.name.localeCompare(b.name);
            north.sort(byName); eastOutputs.sort(byName); inputs.sort(byName); westOutputs.sort(byName);
            // NESW push sequence (N, E(BEL), S(inputs), W(tile outputs))
            portGeometryList.push(...north, ...eastOutputs, ...inputs, ...westOutputs);

            const smGeometry: SwitchMatrixGeometry = {
                name: `${tileType}_SM`,
                relX: smRelX,
                relY: smRelY,
                width: smW,
                height: smH,
                portGeometryList,
                jumpPortGeometryList
            };
            // Attempt to derive switchMatrixWires from serialized muxes
            try {
                const muxes: any[] = (def as any).switchMatrix && Array.isArray((def as any).switchMatrix.muxes) ? (def as any).switchMatrix.muxes : [];
                const wires: SwitchMatrixWireGeometry[] = [];
                if (muxes.length && portGeometryList.length) {
                    // Build index for quick lookup
                    const portIndex = new Set(portGeometryList.map(p => p.name));
                    for (const mux of muxes) {
                        // Heuristic: find output name
                        const outName = mux.output || mux.dest || mux.to || mux.name || undefined;
                        const inputs = mux.inputs || mux.sources || mux.from || mux.in || [];
                        if (outName && Array.isArray(inputs)) {
                            for (const inp of inputs) {
                                if (typeof inp !== 'string') { continue; }
                                const src = inp;
                                const dst = String(outName);
                                // Only add if ports exist or defer; using names directly for now
                                wires.push({ name: `${src}->${dst}`, sourcePort: src, destPort: dst, path: [] });
                            }
                        }
                    }
                }
                if (wires.length) { smGeometry.switchMatrixWires = wires; }
            } catch (e) {
                // Silent fallback; visualization will auto-generate
            }
            tileGeomMap[tileType] = {
                name: tileType,
                width: FabricGeometry.TILE_PIXEL_WIDTH,
                height: FabricGeometry.TILE_PIXEL_HEIGHT,
                smGeometry,
                belGeometryList,
                wireGeometryList: [],
                lowLodWiresGeoms: [],
                lowLodOverlays: []
            };
        }
        // Generate tileLocations grid
        const tileLocations: (Location | null)[][] = [];
        for (let y = 0; y < rows; y++) {
            const locRow: (Location | null)[] = [];
            for (let x = 0; x < cols; x++) {
                if (raw.tiles[y][x]) {
                    locRow.push({ x: x * FabricGeometry.TILE_PIXEL_WIDTH, y: y * FabricGeometry.TILE_PIXEL_HEIGHT });
                } else { locRow.push(null); }
            }
            tileLocations.push(locRow);
        }
        return new FabricGeometry({
            name: raw.name,
            rows, cols,
            tiles: raw.tiles,
            tileDict: raw.tileDict,
            wireDict: raw.wireDict,
            _subTileToTile: raw._subTileToTile,
            meta: raw,
            tileGeomMap,
            tileLocations
        });
    }

    toPlainObject(): any {
        const plain: any = { ...this };
        // Ensure critical fields are enumerable and present
        plain.numberOfRows = this.numberOfRows;
        plain.numberOfColumns = this.numberOfColumns;
        plain.width = this.width;
        plain.height = this.height;
        // tileGeomMap may contain class instances; clone shallowly
        plain.tileGeomMap = { ...this.tileGeomMap };
        return plain;
    }
}