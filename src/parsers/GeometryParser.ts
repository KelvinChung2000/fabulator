import * as fs from 'fs/promises';
import * as path from 'path';
import { 
    FabricGeometry, 
    TileGeometry, 
    SwitchMatrixGeometry,
    BelGeometry,
    PortGeometry,
    WireGeometry,
    LowLodWiresGeometry,
    Location,
    Side,
    IO,
    LocationUtils,
    SideUtils,
    IOUtils
} from '../types/geometry';
import { SwitchMatrixParser } from './SwitchMatrixParser';

enum ParsingMode {
    NONE,
    PARAMS,
    FABRIC_DEF,
    FABRIC_LOCS,
    TILE,
    SWITCH_MATRIX,
    BEL,
    SM_PORT,
    JUMP_PORT,
    BEL_PORT,
    WIRE
}

export class GeometryParser {
    private filePath: string;
    private geometry: FabricGeometry | null = null;
    private parsingMode: ParsingMode = ParsingMode.NONE;

    // Fabric parameters
    private generatorVersion?: string;
    private name: string = '';
    private numberOfRows: number = 0;
    private numberOfColumns: number = 0;
    private width: number = 0;
    private height: number = 0;
    private numberOfLines: number = 0;

    // Data structures
    private tileNames: (string | null)[][] = [];
    private tileLocations: (Location | null)[][] = [];
    private tileGeomMap: Map<string, TileGeometry> = new Map();

    // Current parsing context
    private currentTileGeom: TileGeometry | null = null;
    private currentSmGeom: SwitchMatrixGeometry | null = null;
    private currentBelGeom: BelGeometry | null = null;
    private currentSmPortGeom: PortGeometry | null = null;
    private currentJumpPortGeom: PortGeometry | null = null;
    private currentBelPortGeom: PortGeometry | null = null;
    private currentWireGeom: WireGeometry | null = null;
    private currentWireLoc: Location | null = null;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async parse(): Promise<FabricGeometry> {
        try {
            const fileContent = await fs.readFile(this.filePath, 'utf-8');
            const lines = fileContent.split('\n');

            for (const line of lines) {
                this.processLine(line.trim());
            }

            // Generate low LOD routing for all tiles
            for (const tileGeometry of this.tileGeomMap.values()) {
                this.generateLowLodRouting(tileGeometry);
            }

            this.geometry = {
                name: this.name,
                numberOfRows: this.numberOfRows,
                numberOfColumns: this.numberOfColumns,
                width: this.width,
                height: this.height,
                numberOfLines: this.numberOfLines,
                tileNames: this.tileNames,
                tileLocations: this.tileLocations,
                tileGeomMap: this.tileGeomMap
            };

            return this.geometry;
        } catch (error) {
            throw new Error(`Failed to parse geometry file: ${error}`);
        }
    }

    private processLine(line: string): void {
        if (!line) return;

        const tokens = line.split(',');
        if (tokens.length === 0) return;

        const firstToken = tokens[0];

        // Check for mode changes
        switch (firstToken) {
            case 'PARAMS':
                this.parsingMode = ParsingMode.PARAMS;
                return;
            case 'FABRIC_DEF':
                this.parsingMode = ParsingMode.FABRIC_DEF;
                return;
            case 'FABRIC_LOCS':
                this.parsingMode = ParsingMode.FABRIC_LOCS;
                return;
            case 'TILE':
                this.parsingMode = ParsingMode.TILE;
                return;
            case 'SWITCH_MATRIX':
                this.parsingMode = ParsingMode.SWITCH_MATRIX;
                return;
            case 'BEL':
                this.parsingMode = ParsingMode.BEL;
                return;
            case 'PORT':
                this.parsingMode = ParsingMode.SM_PORT;
                return;
            case 'JUMP_PORT':
                this.parsingMode = ParsingMode.JUMP_PORT;
                return;
            case 'BEL_PORT':
                this.parsingMode = ParsingMode.BEL_PORT;
                return;
            case 'WIRE':
                this.parsingMode = ParsingMode.WIRE;
                return;
        }

        // Process based on current mode
        switch (this.parsingMode) {
            case ParsingMode.PARAMS:
                this.parseAsParams(tokens, firstToken);
                break;
            case ParsingMode.FABRIC_DEF:
                this.parseAsFabric(tokens);
                break;
            case ParsingMode.FABRIC_LOCS:
                this.parseAsLocs(tokens);
                break;
            case ParsingMode.TILE:
                this.parseAsTile(tokens, firstToken);
                break;
            case ParsingMode.SWITCH_MATRIX:
                this.parseAsSwitchMatrix(tokens, firstToken);
                break;
            case ParsingMode.BEL:
                this.parseAsBel(tokens, firstToken);
                break;
            case ParsingMode.SM_PORT:
                this.parseAsSmPort(tokens, firstToken);
                break;
            case ParsingMode.JUMP_PORT:
                this.parseAsJumpPort(tokens, firstToken);
                break;
            case ParsingMode.BEL_PORT:
                this.parseAsBelPort(tokens, firstToken);
                break;
            case ParsingMode.WIRE:
                this.parseAsWire(tokens, firstToken);
                break;
        }
    }

    private parseAsParams(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'GeneratorVersion':
                this.generatorVersion = tokens[1];
                break;
            case 'Name':
                this.name = tokens[1];
                break;
            case 'Rows':
                this.numberOfRows = parseInt(tokens[1]);
                break;
            case 'Columns':
                this.numberOfColumns = parseInt(tokens[1]);
                break;
            case 'Width':
                this.width = parseInt(tokens[1]);
                break;
            case 'Height':
                this.height = parseInt(tokens[1]);
                break;
            case 'Lines':
                this.numberOfLines = parseInt(tokens[1]);
                break;
        }
    }

    private parseAsFabric(tokens: string[]): void {
        this.tileNames.push([...tokens]);
    }

    private parseAsLocs(tokens: string[]): void {
        const locRow: (Location | null)[] = [];
        for (const token of tokens) {
            if (token !== 'Null') {
                const location = this.parseLocation(token);
                locRow.push(location);
            } else {
                locRow.push(null);
            }
        }
        this.tileLocations.push(locRow);
    }

    private parseLocation(token: string): Location {
        // Handle "x/y" format used in real eFPGA geometry files
        const parts = token.split('/');
        if (parts.length === 2) {
            return LocationUtils.create(parseFloat(parts[0]), parseFloat(parts[1]));
        }
        
        // Fallback for "(x,y)" format
        const match = token.match(/\(([^,]+),([^)]+)\)/);
        if (match) {
            return LocationUtils.create(parseFloat(match[1]), parseFloat(match[2]));
        }
        
        // Fallback for comma-separated format
        const commaParts = token.split(',');
        if (commaParts.length >= 2) {
            return LocationUtils.create(parseFloat(commaParts[0]), parseFloat(commaParts[1]));
        }
        
        return LocationUtils.create(0, 0);
    }

    private parseAsTile(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentTileGeom = {
                    name,
                    width: 0,
                    height: 0,
                    belGeometryList: [],
                    wireGeometryList: [],
                    lowLodWiresGeoms: [],
                    lowLodOverlays: []
                };
                this.tileGeomMap.set(name, this.currentTileGeom);
                break;
            case 'Width':
                if (this.currentTileGeom) {
                    this.currentTileGeom.width = parseFloat(tokens[1]);
                }
                break;
            case 'Height':
                if (this.currentTileGeom) {
                    this.currentTileGeom.height = parseFloat(tokens[1]);
                }
                break;
        }
    }

    private parseAsSwitchMatrix(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentSmGeom = {
                    name,
                    relX: 0,
                    relY: 0,
                    width: 0,
                    height: 0,
                    portGeometryList: [],
                    jumpPortGeometryList: []
                };
                if (this.currentTileGeom) {
                    this.currentTileGeom.smGeometry = this.currentSmGeom;
                }
                break;
            case 'RelX':
                if (this.currentSmGeom) {
                    this.currentSmGeom.relX = parseFloat(tokens[1]);
                }
                break;
            case 'RelY':
                if (this.currentSmGeom) {
                    this.currentSmGeom.relY = parseFloat(tokens[1]);
                }
                break;
            case 'Width':
                if (this.currentSmGeom) {
                    this.currentSmGeom.width = parseFloat(tokens[1]);
                }
                break;
            case 'Height':
                if (this.currentSmGeom) {
                    this.currentSmGeom.height = parseFloat(tokens[1]);
                }
                break;
            case 'Src':
                if (this.currentSmGeom) {
                    this.currentSmGeom.src = tokens[1];
                }
                break;
            case 'Csv':
                if (this.currentSmGeom) {
                    this.currentSmGeom.csv = tokens[1];
                    // Parse the CSV file to get actual switch matrix routing configuration
                    this.parseSwitchMatrixCSV(this.currentSmGeom, tokens[1]);
                }
                break;
        }
    }

    private parseAsBel(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentBelGeom = {
                    name,
                    relX: 0,
                    relY: 0,
                    width: 0,
                    height: 0,
                    portGeometryList: []
                };
                if (this.currentTileGeom) {
                    this.currentTileGeom.belGeometryList.push(this.currentBelGeom);
                }
                break;
            case 'RelX':
                if (this.currentBelGeom) {
                    this.currentBelGeom.relX = parseFloat(tokens[1]);
                }
                break;
            case 'RelY':
                if (this.currentBelGeom) {
                    this.currentBelGeom.relY = parseFloat(tokens[1]);
                }
                break;
            case 'Width':
                if (this.currentBelGeom) {
                    this.currentBelGeom.width = parseFloat(tokens[1]);
                }
                break;
            case 'Height':
                if (this.currentBelGeom) {
                    this.currentBelGeom.height = parseFloat(tokens[1]);
                }
                break;
            case 'Src':
                if (this.currentBelGeom) {
                    this.currentBelGeom.src = tokens[1];
                }
                break;
        }
    }

    private parseAsSmPort(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentSmPortGeom = {
                    name,
                    relX: 0,
                    relY: 0
                };
                if (this.currentSmGeom) {
                    this.currentSmGeom.portGeometryList.push(this.currentSmPortGeom);
                }
                break;
            case 'Source':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.sourceName = tokens[1];
                }
                break;
            case 'Dest':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.destName = tokens[1];
                }
                break;
            case 'IO':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.io = IOUtils.fromIdentifier(tokens[1]);
                }
                break;
            case 'Side':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.side = SideUtils.fromIdentifier(tokens[1]);
                }
                break;
            case 'RelX':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.relX = parseFloat(tokens[1]);
                }
                break;
            case 'RelY':
                if (this.currentSmPortGeom) {
                    this.currentSmPortGeom.relY = parseFloat(tokens[1]);
                }
                break;
        }
    }

    private parseAsJumpPort(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentJumpPortGeom = {
                    name,
                    relX: 0,
                    relY: 0
                };
                if (this.currentSmGeom) {
                    this.currentSmGeom.jumpPortGeometryList.push(this.currentJumpPortGeom);
                }
                break;
            case 'Source':
                if (this.currentJumpPortGeom) {
                    this.currentJumpPortGeom.sourceName = tokens[1];
                }
                break;
            case 'Dest':
                if (this.currentJumpPortGeom) {
                    this.currentJumpPortGeom.destName = tokens[1];
                }
                break;
            case 'IO':
                if (this.currentJumpPortGeom) {
                    this.currentJumpPortGeom.io = IOUtils.fromIdentifier(tokens[1]);
                }
                break;
            case 'RelX':
                if (this.currentJumpPortGeom) {
                    this.currentJumpPortGeom.relX = parseFloat(tokens[1]);
                }
                break;
            case 'RelY':
                if (this.currentJumpPortGeom) {
                    this.currentJumpPortGeom.relY = parseFloat(tokens[1]);
                }
                break;
        }
    }

    private parseAsBelPort(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentBelPortGeom = {
                    name,
                    relX: 0,
                    relY: 0
                };
                if (this.currentBelGeom) {
                    this.currentBelGeom.portGeometryList.push(this.currentBelPortGeom);
                }
                break;
            case 'Source':
                if (this.currentBelPortGeom) {
                    this.currentBelPortGeom.sourceName = tokens[1];
                }
                break;
            case 'Dest':
                if (this.currentBelPortGeom) {
                    this.currentBelPortGeom.destName = tokens[1];
                }
                break;
            case 'IO':
                if (this.currentBelPortGeom) {
                    this.currentBelPortGeom.io = IOUtils.fromIdentifier(tokens[1]);
                }
                break;
            case 'RelX':
                if (this.currentBelPortGeom) {
                    this.currentBelPortGeom.relX = parseFloat(tokens[1]);
                }
                break;
            case 'RelY':
                if (this.currentBelPortGeom) {
                    this.currentBelPortGeom.relY = parseFloat(tokens[1]);
                }
                break;
        }
    }

    private parseAsWire(tokens: string[], attribute: string): void {
        if (tokens.length !== 2) return;

        switch (attribute) {
            case 'Name':
                const name = tokens[1];
                this.currentWireGeom = {
                    name,
                    path: []
                };
                if (this.currentTileGeom) {
                    this.currentTileGeom.wireGeometryList.push(this.currentWireGeom);
                }
                break;
            case 'RelX':
                const relX = parseFloat(tokens[1]);
                this.currentWireLoc = LocationUtils.create(relX, 0);
                if (this.currentWireGeom) {
                    this.currentWireGeom.path.push(this.currentWireLoc);
                }
                break;
            case 'RelY':
                if (this.currentWireLoc) {
                    this.currentWireLoc.y = parseFloat(tokens[1]);
                }
                break;
        }
    }

    private generateLowLodRouting(tileGeometry: TileGeometry): void {
        const wirePointsMat: number[][] = [];
        const covered: boolean[][] = [];
        
        // Initialize matrices
        for (let x = 0; x <= tileGeometry.width; x++) {
            wirePointsMat[x] = new Array(Math.floor(tileGeometry.height) + 1).fill(0);
            covered[x] = new Array(Math.floor(tileGeometry.height) + 1).fill(false);
        }

        // Process wire geometries
        for (const wireGeom of tileGeometry.wireGeometryList) {
            const path = wireGeom.path;

            for (let pathCounter = path.length; pathCounter >= 2; pathCounter--) {
                const start = path[pathCounter - 1];
                const end = path[pathCounter - 2];

                const wirePoint = LocationUtils.create(
                    Math.min(start.x, end.x),
                    Math.min(start.y, end.y)
                );
                const endPoint = LocationUtils.create(
                    Math.max(start.x, end.x),
                    Math.max(start.y, end.y)
                );

                let indexX = Math.floor(wirePoint.x);
                let indexY = Math.floor(wirePoint.y);

                if (start.x === end.x) {
                    while (indexY <= endPoint.y) {
                        if (indexX < wirePointsMat.length && indexY < wirePointsMat[indexX].length) {
                            wirePointsMat[indexX][indexY]++;
                        }
                        wirePoint.y++;
                        indexY = Math.floor(wirePoint.y);
                    }
                } else if (start.y === end.y) {
                    while (indexX <= endPoint.x) {
                        if (indexX < wirePointsMat.length && indexY < wirePointsMat[indexX].length) {
                            wirePointsMat[indexX][indexY]++;
                        }
                        wirePoint.x++;
                        indexX = Math.floor(wirePoint.x);
                    }
                }
            }
        }

        // Generate low LOD rectangles
        this.buildLowLodRects(tileGeometry, wirePointsMat, covered, 1, tileGeometry.lowLodWiresGeoms);
        
        // Reset covered array
        for (const arr of covered) {
            arr.fill(false);
        }
        
        // Generate overlays
        this.buildLowLodRects(tileGeometry, wirePointsMat, covered, 2, tileGeometry.lowLodOverlays);
    }

    private buildLowLodRects(
        tileGeometry: TileGeometry,
        wirePointsMat: number[][],
        covered: boolean[][],
        pointsThresh: number,
        target: LowLodWiresGeometry[]
    ): void {
        for (let x = 0; x <= tileGeometry.width; x++) {
            for (let y = 0; y <= tileGeometry.height; y++) {
                if (x < wirePointsMat.length && y < wirePointsMat[x].length &&
                    wirePointsMat[x][y] >= pointsThresh && !covered[x][y]) {
                    const lowLodRect = this.buildLowLodRect(x, y, wirePointsMat, covered, pointsThresh, tileGeometry);
                    if (pointsThresh === 1 || (lowLodRect.width > 1 || lowLodRect.height > 1)) {
                        target.push(lowLodRect);
                    }
                }
            }
        }
    }

    private buildLowLodRect(
        topLeftX: number,
        topLeftY: number,
        wirePointsMat: number[][],
        covered: boolean[][],
        pointsThresh: number,
        tileGeometry: TileGeometry
    ): LowLodWiresGeometry {
        let currX = topLeftX;
        let currY = topLeftY;
        let botLeftY = topLeftY;

        // Find bottom boundary
        while (currY <= tileGeometry.height && 
               currX < wirePointsMat.length && 
               currY < wirePointsMat[currX].length &&
               wirePointsMat[currX][currY] >= pointsThresh) {
            botLeftY = currY;
            currY++;
        }

        let botRightX = topLeftX;
        currY = topLeftY;

        // Find right boundary
        while (currX <= tileGeometry.width && 
               currX < wirePointsMat.length) {
            while (currY <= botLeftY && 
                   currY < wirePointsMat[currX].length &&
                   wirePointsMat[currX][currY] >= pointsThresh) {
                currY++;
            }
            if (currY >= botLeftY) {
                botRightX = currX;
                currY = topLeftY;
                currX++;
            } else {
                break;
            }
        }

        // Mark as covered
        for (let x = topLeftX; x <= botRightX; x++) {
            for (let y = topLeftY; y <= botLeftY; y++) {
                if (x < covered.length && y < covered[x].length) {
                    covered[x][y] = true;
                }
            }
        }

        return {
            relX: topLeftX,
            relY: topLeftY,
            width: botRightX - topLeftX,
            height: botLeftY - topLeftY
        };
    }

    /**
     * Parse switch matrix CSV file asynchronously to get routing configuration
     */
    private async parseSwitchMatrixCSV(smGeometry: SwitchMatrixGeometry, csvPath: string): Promise<void> {
        try {
            // Resolve CSV path relative to the main geometry file
            const fullCsvPath = path.isAbsolute(csvPath) 
                ? csvPath 
                : path.resolve(path.dirname(this.filePath), csvPath);
            
            console.log(`Parsing switch matrix CSV: ${fullCsvPath} for ${smGeometry.name}`);
            
            const switchMatrixConfig = await SwitchMatrixParser.parseSwitchMatrixCSV(fullCsvPath);
            
            if (switchMatrixConfig) {
                smGeometry.wireConnections = switchMatrixConfig.connections;
                smGeometry.switchMatrixWires = this.resolveWireGeometryCoordinates(
                    switchMatrixConfig.wireGeometries, 
                    smGeometry
                );
                
                console.log(`✅ Loaded ${switchMatrixConfig.connections.length} connections and ${switchMatrixConfig.wireGeometries.length} wire geometries for ${smGeometry.name}`);
            } else {
                console.warn(`⚠️  Failed to parse switch matrix CSV for ${smGeometry.name}, using fallback generation`);
                // Keep the existing fallback behavior if CSV parsing fails
            }
        } catch (error) {
            console.error(`Error parsing switch matrix CSV for ${smGeometry.name}:`, error);
            // Keep the existing fallback behavior if CSV parsing fails
        }
    }

    /**
     * Resolve wire geometry coordinates using actual port positions
     */
    private resolveWireGeometryCoordinates(
        wireGeometries: any[], 
        smGeometry: SwitchMatrixGeometry
    ): any[] {
        const allPorts = [...smGeometry.portGeometryList, ...smGeometry.jumpPortGeometryList];
        const portMap = new Map<string, PortGeometry>();
        
        for (const port of allPorts) {
            portMap.set(port.name, port);
        }
        
        return wireGeometries.map(wireGeom => {
            const sourcePort = portMap.get(wireGeom.sourcePort);
            const destPort = portMap.get(wireGeom.destPort);
            
            // If we have placeholder coordinates (0,0), replace with actual port positions
            if (wireGeom.path && sourcePort && destPort) {
                if (wireGeom.path.length === 2 && 
                    wireGeom.path[0].x === 0 && wireGeom.path[0].y === 0 &&
                    wireGeom.path[1].x === 0 && wireGeom.path[1].y === 0) {
                    
                    // Replace with actual port coordinates
                    wireGeom.path = [
                        { x: sourcePort.relX, y: sourcePort.relY },
                        { x: destPort.relX, y: destPort.relY }
                    ];
                }
            }
            
            return wireGeom;
        });
    }

    public getGeometry(): FabricGeometry | null {
        return this.geometry;
    }
}