/**
 * TileRenderer.ts
 * 
 * Handles the creation and rendering of fabric tiles including:
 * - Basic tile geometry and styling
 * - Switch matrices with ports
 * - BELs (Basic Elements) with ports
 * - Internal wiring between BELs and ports
 * - Low-LOD substitutes for performance
 */

import { Graphics, Container } from 'pixi.js';
import { FabricGeometry, TileGeometry, Location, WireGeometry, SwitchMatrixGeometry, SwitchMatrixWireGeometry, PortGeometry } from '../types/geometry';
import { 
    TILE_CONSTANTS,
    SWITCH_MATRIX_CONSTANTS,
    SWITCH_MATRIX_WIRE_CONSTANTS,
    BEL_CONSTANTS,
    PORT_CONSTANTS,
    WIRE_CONSTANTS,
    LOW_LOD_COLORS,
    TILE_COLOR_CONSTANTS,
    INTERACTION_CONSTANTS,
    simpleHash,
    hslToHex
} from './FabricConstants';

export type TileClickCallback = (tileGeometry: TileGeometry, x: number, y: number) => void;
export type SwitchMatrixClickCallback = (smGeometry: any) => void;
export type BelClickCallback = (belGeometry: any) => void;
export type PortClickCallback = (port: any) => void;
export type WireClickCallback = (wireGeometry: WireGeometry) => void;

export class TileRenderer {
    private fabricContainer: Container;
    private currentGeometry: FabricGeometry | null = null;
    private tileContainers: Container[][] = [];

    // Event callbacks
    private onTileClickCallback?: TileClickCallback;
    private onSwitchMatrixClickCallback?: SwitchMatrixClickCallback;
    private onBelClickCallback?: BelClickCallback;
    private onPortClickCallback?: PortClickCallback;
    private onWireClickCallback?: WireClickCallback;

    constructor(fabricContainer: Container) {
        this.fabricContainer = fabricContainer;
    }

    // =============================================================================
    // INITIALIZATION AND BUILDING
    // =============================================================================

    public buildFabric(geometry: FabricGeometry): Container[][] {
        console.log(`🚨🚨🚨 BUILDING FABRIC DEBUG TEST 🚨🚨🚨`);
        console.log(`🎪 BUILDING FABRIC: ${geometry.numberOfRows}x${geometry.numberOfColumns} tiles`);
        console.log(`   - Total tile types: ${Object.keys(geometry.tileGeomMap).length}`);
        
        this.currentGeometry = geometry;
        this.clearFabric();
        this.tileContainers = this.initializeTileContainers(geometry);
        
        let tilesWithSwitchMatrix = 0;
        
        // Create all tiles
        for (let y = 0; y < geometry.numberOfRows; y++) {
            for (let x = 0; x < geometry.numberOfColumns; x++) {
                const tileName = geometry.tileNames[y][x];
                const tileGeometry = geometry.tileGeomMap[tileName];
                const location = geometry.tileLocations[y][x];
                
                if (tileGeometry && location) {
                    if (tileGeometry.smGeometry) {
                        tilesWithSwitchMatrix++;
                    }
                    this.createTile(tileGeometry, location, x, y);
                }
            }
        }
        
        console.log(`✅ FABRIC BUILD COMPLETE: ${tilesWithSwitchMatrix} tiles have switch matrices`);
        console.log(`   - Tile geometry map keys:`, Object.keys(geometry.tileGeomMap).slice(0, 5));
        
        // Debug: Check a few tile geometries for switch matrix info
        Object.entries(geometry.tileGeomMap).slice(0, 3).forEach(([name, tileGeom]) => {
            console.log(`   - Tile ${name}: has SM = ${!!tileGeom.smGeometry}`);
            if (tileGeom.smGeometry) {
                const sm = tileGeom.smGeometry;
                console.log(`     SM: ${sm.name}, ports: ${sm.portGeometryList.length + sm.jumpPortGeometryList.length}`);
            }
        });

        // Build fabric markers
        this.buildMarkers();

        return this.tileContainers;
    }

    private initializeTileContainers(geometry: FabricGeometry): Container[][] {
        const containers: Container[][] = [];
        for (let y = 0; y < geometry.numberOfRows; y++) {
            containers[y] = [];
            for (let x = 0; x < geometry.numberOfColumns; x++) {
                containers[y][x] = new Container();
                this.fabricContainer.addChild(containers[y][x]);
            }
        }
        return containers;
    }

    private clearFabric(): void {
        this.fabricContainer.removeChildren();
        this.tileContainers = [];
    }

    // =============================================================================
    // TILE CREATION
    // =============================================================================

    private createTile(tileGeometry: TileGeometry, location: Location, fabricX: number, fabricY: number): void {
        console.log(`🏗️ CREATING TILE: ${tileGeometry.name} at (${fabricX},${fabricY})`);
        console.log(`   - Has switch matrix: ${!!tileGeometry.smGeometry}`);
        if (tileGeometry.smGeometry) {
            console.log(`   - Switch matrix name: ${tileGeometry.smGeometry.name}`);
        }
        
        const tileContainer = this.tileContainers[fabricY][fabricX];
        tileContainer.x = location.x;
        tileContainer.y = location.y;

        // Create main tile rectangle
        const tileRect = this.createTileRectangle(tileGeometry, fabricX, fabricY);
        tileContainer.addChild(tileRect);

        // Create switch matrix if present
        if (tileGeometry.smGeometry) {
            console.log(`   ➡️  Creating switch matrix for tile ${tileGeometry.name}`);
            this.createSwitchMatrix(tileGeometry.smGeometry, tileContainer);
            this.createLowLodSubstitute(tileGeometry.smGeometry, tileContainer);
        }

        // Create BELs
        for (const belGeometry of tileGeometry.belGeometryList) {
            this.createBel(belGeometry, tileContainer);
        }

        // Create internal wires (BEL-to-port connections)
        for (const wireGeometry of tileGeometry.wireGeometryList) {
            this.createInternalWire(wireGeometry, tileContainer);
        }

        // Create low-LOD wire substitutes
        this.createLowLodWiresGroup(tileGeometry, tileContainer);
    }

    private createTileRectangle(tileGeometry: TileGeometry, fabricX: number, fabricY: number): Graphics {
        const tileRect = new Graphics();
        
        // Get tile-specific color or use default
        const fillColor = this.getTileColor(tileGeometry.name);
        
        tileRect.rect(0, 0, tileGeometry.width, tileGeometry.height);
        tileRect.fill({ 
            color: fillColor, 
            alpha: TILE_CONSTANTS.DEFAULT_FILL_ALPHA 
        });
        tileRect.stroke({ 
            width: TILE_CONSTANTS.DEFAULT_STROKE_WIDTH, 
            color: TILE_CONSTANTS.DEFAULT_STROKE_COLOR 
        });

        // Make interactive
        tileRect.eventMode = 'static';
        tileRect.cursor = 'pointer';
        tileRect.on('click', () => this.onTileClick(tileGeometry, fabricX, fabricY));

        // Mark for LOD system
        (tileRect as any).userData = { type: 'tile', tileName: tileGeometry.name };

        return tileRect;
    }

    // =============================================================================
    // SWITCH MATRIX CREATION
    // =============================================================================

    private createSwitchMatrix(smGeometry: any, tileContainer: Container): void {
        console.log(`🎛️ CREATE SWITCH MATRIX: ${smGeometry.name} - Starting creation...`);
        
        const smContainer = new Container();
        smContainer.x = smGeometry.relX;
        smContainer.y = smGeometry.relY;

        // Create switch matrix rectangle
        const smRect = new Graphics();
        smRect.rect(0, 0, smGeometry.width, smGeometry.height);
        smRect.fill({ 
            color: SWITCH_MATRIX_CONSTANTS.FILL_COLOR, 
            alpha: SWITCH_MATRIX_CONSTANTS.FILL_ALPHA 
        });
        smRect.stroke({ 
            width: SWITCH_MATRIX_CONSTANTS.STROKE_WIDTH, 
            color: SWITCH_MATRIX_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        smRect.eventMode = 'static';
        smRect.cursor = 'pointer';
        smRect.on('click', () => this.onSwitchMatrixClick(smGeometry));

        smContainer.addChild(smRect);

        // Create ports
        if (smGeometry.portGeometryList) {
            for (const port of smGeometry.portGeometryList) {
                this.createSwitchMatrixPort(port, smContainer, smGeometry, 'regular');
            }
        }

        if (smGeometry.jumpPortGeometryList) {
            for (const jumpPort of smGeometry.jumpPortGeometryList) {
                this.createSwitchMatrixPort(jumpPort, smContainer, smGeometry, 'jump');
            }
        }

        console.log(`🔌 About to create switch matrix wires for ${smGeometry.name}...`);
        
        // Create switch matrix internal wires
        this.createSwitchMatrixWires(smGeometry, smContainer);

        // Mark for LOD system and store geometry for wire creation
        (smContainer as any).userData = { type: 'switchMatrix', smGeometry };

        tileContainer.addChild(smContainer);
    }

    private createSwitchMatrixPort(port: any, smContainer: Container, smGeometry: any, portType: 'regular' | 'jump'): void {
        const portGraphics = new Graphics();
        portGraphics.circle(port.relX, port.relY, PORT_CONSTANTS.RADIUS);
        portGraphics.fill({ 
            color: PORT_CONSTANTS.FILL_COLOR, 
            alpha: PORT_CONSTANTS.ALPHA 
        });
        portGraphics.stroke({ 
            width: PORT_CONSTANTS.STROKE_WIDTH, 
            color: PORT_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        portGraphics.eventMode = 'static';
        portGraphics.cursor = 'pointer';
        portGraphics.on('click', () => this.onSwitchMatrixPortClick(port, portType));

        // Mark for LOD system
        (portGraphics as any).userData = { 
            type: 'port', 
            portType: portType,
            port: port,
            parent: smGeometry 
        };

        smContainer.addChild(portGraphics);
    }

    private createSwitchMatrixWires(smGeometry: SwitchMatrixGeometry, smContainer: Container): void {
        console.log(`🔌 Creating switch matrix wires for ${smGeometry.name}:`);
        console.log(`    - Object keys:`, Object.keys(smGeometry));
        console.log(`    - Has switchMatrixWires:`, 'switchMatrixWires' in smGeometry);
        console.log(`    - switchMatrixWires value:`, smGeometry.switchMatrixWires);
        console.log(`    - Ports: ${smGeometry.portGeometryList.length} regular, ${smGeometry.jumpPortGeometryList.length} jump`);
        console.log(`    - Dimensions: ${smGeometry.width}x${smGeometry.height}`);
        
        const allPorts = [...smGeometry.portGeometryList, ...smGeometry.jumpPortGeometryList];
        
        // Debug: Print all port positions
        allPorts.forEach((port, i) => {
            console.log(`    Port ${i}: ${port.name} at (${port.relX}, ${port.relY})`);
        });

        // Use real switch matrix wires from CSV parsing if available
        if (!smGeometry.switchMatrixWires || smGeometry.switchMatrixWires.length === 0) {
            console.log(`    - No parsed wires found, generating fallback visualization`);
            // Generate basic internal wiring visualization as fallback
            smGeometry.switchMatrixWires = this.generateSwitchMatrixWires(smGeometry);
        } else {
            console.log(`    - Using ${smGeometry.switchMatrixWires.length} parsed switch matrix wires`);
        }

        // Create visual representation of switch matrix wires
        console.log(`    - Creating ${smGeometry.switchMatrixWires.length} visual wire representations...`);
        for (const wire of smGeometry.switchMatrixWires) {
            this.createSwitchMatrixWire(wire, smContainer, smGeometry);
        }
        console.log(`    ✅ Completed wire creation for ${smGeometry.name}`);
    }

    private generateSwitchMatrixWires(smGeometry: SwitchMatrixGeometry): SwitchMatrixWireGeometry[] {
        const wires: SwitchMatrixWireGeometry[] = [];
        const allPorts = [...smGeometry.portGeometryList, ...smGeometry.jumpPortGeometryList];

        console.log(`    📊 Generating fallback wires for ${allPorts.length} ports in ${smGeometry.name}:`);
        console.log(`    📏 Switch matrix dimensions: ${smGeometry.width}x${smGeometry.height}`);
        
        // Debug: Print all port positions
        allPorts.forEach((port, i) => {
            console.log(`    Port ${i}: ${port.name} at (${port.relX}, ${port.relY})`);
        });

        // Create connections based on port positions and types - more realistic than center-based
        if (allPorts.length >= 2) {
            // Group ports by side of the switch matrix
            const leftPorts = allPorts.filter(p => p.relX <= 10);
            const rightPorts = allPorts.filter(p => p.relX >= smGeometry.width - 10);
            const topPorts = allPorts.filter(p => p.relY <= 10);
            const bottomPorts = allPorts.filter(p => p.relY >= smGeometry.height - 10);
            
            console.log(`    📍 Port groups: Left=${leftPorts.length}, Right=${rightPorts.length}, Top=${topPorts.length}, Bottom=${bottomPorts.length}`);
            
            // Create horizontal connections (left to right)
            const maxHorizontal = Math.min(leftPorts.length, rightPorts.length, 3);
            for (let i = 0; i < maxHorizontal; i++) {
                if (leftPorts[i] && rightPorts[i]) {
                    const wire: SwitchMatrixWireGeometry = {
                        name: `sm_horizontal_${leftPorts[i].name}_to_${rightPorts[i].name}`,
                        sourcePort: leftPorts[i].name,
                        destPort: rightPorts[i].name,
                        path: [] // Will be calculated by routing logic
                    };
                    wires.push(wire);
                }
            }
            
            // Create vertical connections (top to bottom)  
            const maxVertical = Math.min(topPorts.length, bottomPorts.length, 3);
            for (let i = 0; i < maxVertical; i++) {
                if (topPorts[i] && bottomPorts[i]) {
                    const wire: SwitchMatrixWireGeometry = {
                        name: `sm_vertical_${topPorts[i].name}_to_${bottomPorts[i].name}`,
                        sourcePort: topPorts[i].name,
                        destPort: bottomPorts[i].name,
                        path: [] // Will be calculated by routing logic
                    };
                    wires.push(wire);
                }
            }
            
            // Add some cross connections for more complex routing
            if (allPorts.length >= 4) {
                // Create a few diagonal connections
                for (let i = 0; i < Math.min(2, allPorts.length - 2); i++) {
                    const sourcePort = allPorts[i];
                    const destPort = allPorts[i + 2];
                    
                    const wire: SwitchMatrixWireGeometry = {
                        name: `sm_cross_${sourcePort.name}_to_${destPort.name}`,
                        sourcePort: sourcePort.name,
                        destPort: destPort.name,
                        path: [] // Will be calculated by routing logic
                    };
                    wires.push(wire);
                    console.log(`    ➕ Added cross wire: ${sourcePort.name} → ${destPort.name}`);
                }
            }
            
            // FOR DEBUGGING: Add a few more test connections to make sure we see multiple wires
            if (allPorts.length >= 2 && wires.length < 3) {
                console.log(`    🧪 Adding debug test wires...`);
                // Add every port to every other port (limited to avoid too many)
                for (let i = 0; i < Math.min(3, allPorts.length); i++) {
                    for (let j = i + 1; j < Math.min(3, allPorts.length); j++) {
                        const sourcePort = allPorts[i];
                        const destPort = allPorts[j];
                        
                        const wire: SwitchMatrixWireGeometry = {
                            name: `sm_debug_${sourcePort.name}_to_${destPort.name}`,
                            sourcePort: sourcePort.name,
                            destPort: destPort.name,
                            path: [] // Will be calculated by routing logic
                        };
                        wires.push(wire);
                        console.log(`    🔬 Added debug wire: ${sourcePort.name} → ${destPort.name}`);
                    }
                }
            }
        }

        console.log(`    ✅ Generated ${wires.length} fallback wires for ${smGeometry.name}`);
        return wires;
    }

    private createSwitchMatrixWire(wireGeometry: SwitchMatrixWireGeometry, smContainer: Container, smGeometry: SwitchMatrixGeometry): void {
        console.log(`      🔗 Creating wire: ${wireGeometry.name} (${wireGeometry.sourcePort} → ${wireGeometry.destPort})`);

        // Find source and destination ports
        const sourcePort = this.findPortInSwitchMatrix(wireGeometry.sourcePort, smGeometry);
        const destPort = this.findPortInSwitchMatrix(wireGeometry.destPort, smGeometry);
        
        if (!sourcePort || !destPort) {
            console.warn(`      ❌ Could not find ports for wire ${wireGeometry.name}: source=${wireGeometry.sourcePort}, dest=${wireGeometry.destPort}`);
            return;
        }

        console.log(`      📍 Port positions: source=(${sourcePort.relX},${sourcePort.relY}), dest=(${destPort.relX},${destPort.relY})`);

        // Calculate smart routing path (matching Java implementation)
        const routingPath = this.calculateSwitchMatrixRoutingPath(sourcePort, destPort, smGeometry);
        console.log(`      🛣️  Routing path: ${routingPath.length} points`);
        routingPath.forEach((point, i) => {
            console.log(`         ${i}: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
        });

        const wireGraphics = new Graphics();
        
        // Store wire geometry for dynamic redrawing
        (wireGraphics as any).wireGeometry = wireGeometry;
        (wireGraphics as any).currentThickness = SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH;
        (wireGraphics as any).routingPath = routingPath;
        
        // Draw initial wire with calculated routing path
        this.drawSwitchMatrixWireRoutingPath(wireGraphics, routingPath, SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH);

        // Make interactive
        wireGraphics.eventMode = 'static';
        wireGraphics.cursor = 'pointer';
        wireGraphics.on('click', () => this.onSwitchMatrixWireClick(wireGeometry));

        // Mark for LOD system
        (wireGraphics as any).userData = { 
            type: 'switchMatrixWire', 
            wireName: wireGeometry.name,
            sourcePort: wireGeometry.sourcePort,
            destPort: wireGeometry.destPort,
            wireType: 'switchMatrix'
        };

        smContainer.addChild(wireGraphics);
        console.log(`      ✅ Wire added to switch matrix container. Container now has ${smContainer.children.length} children`);
    }

    private findPortInSwitchMatrix(portName: string, smGeometry: SwitchMatrixGeometry): PortGeometry | null {
        // Search in regular ports
        for (const port of smGeometry.portGeometryList) {
            if (port.name === portName) {
                return port;
            }
        }
        
        // Search in jump ports
        for (const jumpPort of smGeometry.jumpPortGeometryList) {
            if (jumpPort.name === portName) {
                return jumpPort;
            }
        }
        
        return null;
    }

    private calculateSwitchMatrixRoutingPath(sourcePort: PortGeometry, destPort: PortGeometry, smGeometry: SwitchMatrixGeometry): Location[] {
        // Implement Java-like smart routing logic
        const sourceLocation = { x: sourcePort.relX, y: sourcePort.relY };
        const destLocation = { x: destPort.relX, y: destPort.relY };
        
        console.log(`        🧮 Calculating routing from (${sourceLocation.x},${sourceLocation.y}) to (${destLocation.x},${destLocation.y})`);
        console.log(`        🔲 Switch matrix size: ${smGeometry.width}x${smGeometry.height}`);
        
        // Check if ports are aligned or on borders (matches Java logic)
        const xEqual = sourceLocation.x === destLocation.x;
        const yEqual = sourceLocation.y === destLocation.y;
        
        const atLeftOrRightBorder = sourceLocation.x === 0 || sourceLocation.x === smGeometry.width ||
                                   destLocation.x === 0 || destLocation.x === smGeometry.width;
        const atTopOrBottomBorder = sourceLocation.y === 0 || sourceLocation.y === smGeometry.height ||
                                   destLocation.y === 0 || destLocation.y === smGeometry.height;
        
        console.log(`        ✅ Alignment: xEqual=${xEqual}, yEqual=${yEqual}`);
        console.log(`        🏗️  Borders: leftRight=${atLeftOrRightBorder}, topBottom=${atTopOrBottomBorder}`);
        
        // Decide whether to draw a curved path or straight line
        const drawCurve = !xEqual && !yEqual && (atLeftOrRightBorder || atTopOrBottomBorder);
        console.log(`        🎯 Decision: drawCurve=${drawCurve}`);
        
        if (drawCurve) {
            // Calculate curved path with midpoint (matching Java buildConnection logic)
            const midX = (sourceLocation.x + destLocation.x) / 2;
            const midY = (sourceLocation.y + destLocation.y) / 2;
            
            const diffX = destLocation.x - sourceLocation.x;
            const diffY = destLocation.y - sourceLocation.y;
            
            // Apply offset for visual separation (based on Java algorithm)
            const offsetX = diffX > 0 ? 1 : -1;
            const offsetY = diffY > 0 ? 1 : -1;
            
            const midPoint = {
                x: midX + 0.5 * diffY * offsetX,
                y: midY + 0.5 * diffX * offsetY
            };
            
            console.log(`        🔄 Curved path with midpoint at (${midPoint.x},${midPoint.y})`);
            return [sourceLocation, midPoint, destLocation];
        } else {
            // Simple direct connection
            console.log(`        ➡️  Direct path`);
            return [sourceLocation, destLocation];
        }
    }

    private drawSwitchMatrixWireRoutingPath(wireGraphics: Graphics, path: Location[], thickness: number): void {
        console.log(`        🎨 DRAWING WIRE PATH: ${path.length} points, thickness ${thickness}`);
        path.forEach((point, i) => {
            console.log(`           Point ${i}: (${point.x}, ${point.y})`);
        });
        
        if (path.length < 2) {
            console.warn(`        ❌ Not enough points to draw path: ${path.length}`);
            return;
        }
        
        // Clear existing path
        wireGraphics.clear();
        
        // Draw the routing path
        wireGraphics.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            wireGraphics.lineTo(path[i].x, path[i].y);
        }
        
        wireGraphics.stroke({ 
            width: thickness, 
            color: SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_COLOR,
            alpha: SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_ALPHA 
        });
        
        console.log(`        ✅ Wire drawn successfully with color 0x${SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_COLOR.toString(16)}`);
    }


    // =============================================================================
    // BEL CREATION
    // =============================================================================

    private createBel(belGeometry: any, tileContainer: Container): void {
        const belContainer = new Container();
        belContainer.x = belGeometry.relX;
        belContainer.y = belGeometry.relY;

        // Create BEL rectangle
        const belRect = new Graphics();
        belRect.rect(0, 0, belGeometry.width, belGeometry.height);
        belRect.fill({ 
            color: this.getBelColor(belGeometry), 
            alpha: BEL_CONSTANTS.FILL_ALPHA 
        });
        belRect.stroke({ 
            width: BEL_CONSTANTS.STROKE_WIDTH, 
            color: BEL_CONSTANTS.STROKE_COLOR,
            alpha: BEL_CONSTANTS.STROKE_ALPHA 
        });

        // Make interactive
        belRect.eventMode = 'static';
        belRect.cursor = 'pointer';
        belRect.on('click', () => this.onBelClick(belGeometry));

        belContainer.addChild(belRect);

        // Create BEL ports
        if (belGeometry.portGeometryList) {
            for (const port of belGeometry.portGeometryList) {
                this.createPort(port, belContainer, belGeometry);
            }
        }

        // Mark for LOD system
        (belContainer as any).userData = { type: 'bel', belGeometry };

        tileContainer.addChild(belContainer);
    }

    private getBelColor(belGeometry: any): number {
        // Generate color based on BEL name/type
        const hash = simpleHash(belGeometry.name || 'BEL');
        const hue = (hash * TILE_COLOR_CONSTANTS.HUE_MULTIPLIER) % TILE_COLOR_CONSTANTS.HUE_MODULO;
        return hslToHex(hue, TILE_COLOR_CONSTANTS.SATURATION, TILE_COLOR_CONSTANTS.LIGHTNESS);
    }

    private createPort(port: any, parentContainer: Container, parent: any): void {
        const portGraphics = new Graphics();
        portGraphics.circle(port.relX, port.relY, PORT_CONSTANTS.RADIUS);
        portGraphics.fill({ 
            color: PORT_CONSTANTS.FILL_COLOR, 
            alpha: PORT_CONSTANTS.ALPHA 
        });
        portGraphics.stroke({ 
            width: PORT_CONSTANTS.STROKE_WIDTH, 
            color: PORT_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        portGraphics.eventMode = 'static';
        portGraphics.cursor = 'pointer';
        portGraphics.on('click', () => this.onPortClick(port));

        // Mark for LOD system
        (portGraphics as any).userData = { 
            type: 'port', 
            port: port, 
            parent: parent 
        };

        parentContainer.addChild(portGraphics);
    }

    // =============================================================================
    // WIRE CREATION
    // =============================================================================

    private createInternalWire(wireGeometry: WireGeometry, tileContainer: Container): void {
        if (!wireGeometry.path || wireGeometry.path.length < 2) return;

        const wireGraphics = new Graphics();
        
        // Store wire geometry for dynamic redrawing
        (wireGraphics as any).wireGeometry = wireGeometry;
        (wireGraphics as any).currentThickness = WIRE_CONSTANTS.DEFAULT_WIDTH;
        
        // Draw initial wire with default thickness
        this.drawWirePath(wireGraphics, wireGeometry, WIRE_CONSTANTS.DEFAULT_WIDTH);

        // Make interactive
        wireGraphics.eventMode = 'static';
        wireGraphics.cursor = 'pointer';
        wireGraphics.on('click', () => this.onInternalWireClick(wireGeometry));

        // Mark for LOD system
        (wireGraphics as any).userData = { 
            type: 'internalWire', 
            wireName: wireGeometry.name,
            wireType: 'internal'
        };

        tileContainer.addChild(wireGraphics);
    }

    private drawWirePath(wireGraphics: Graphics, wireGeometry: WireGeometry, thickness: number): void {
        // Clear existing path
        wireGraphics.clear();
        
        // Draw wire path as continuous line with specified thickness
        wireGraphics.moveTo(wireGeometry.path[0].x, wireGeometry.path[0].y);
        
        // Connect all subsequent points with lineTo (no moveTo calls)
        for (let i = 1; i < wireGeometry.path.length; i++) {
            wireGraphics.lineTo(wireGeometry.path[i].x, wireGeometry.path[i].y);
        }
        
        wireGraphics.stroke({ 
            width: thickness, 
            color: WIRE_CONSTANTS.DEFAULT_COLOR,
            alpha: WIRE_CONSTANTS.DEFAULT_ALPHA 
        });
    }

    // =============================================================================
    // LOW-LOD SUBSTITUTES
    // =============================================================================

    private createLowLodSubstitute(smGeometry: any, tileContainer: Container): void {
        const lowLodRect = new Graphics();
        lowLodRect.roundRect(
            smGeometry.relX, 
            smGeometry.relY, 
            smGeometry.width, 
            smGeometry.height,
            SWITCH_MATRIX_CONSTANTS.CORNER_RADIUS
        );
        lowLodRect.fill({ color: SWITCH_MATRIX_CONSTANTS.LOW_LOD_FILL_COLOR });
        lowLodRect.stroke({ 
            width: SWITCH_MATRIX_CONSTANTS.STROKE_WIDTH, 
            color: SWITCH_MATRIX_CONSTANTS.LOW_LOD_STROKE_COLOR 
        });

        lowLodRect.visible = false; // Initially hidden, controlled by LOD system

        // Mark for LOD system
        (lowLodRect as any).userData = { type: 'lowLodSubstitute' };

        tileContainer.addChild(lowLodRect);
    }

    private createLowLodWiresGroup(tileGeometry: TileGeometry, tileContainer: Container): void {
        const lowLodWiresContainer = new Container();

        // Create low-LOD wire rectangles
        for (const lowLodWire of tileGeometry.lowLodWiresGeoms) {
            const wireRect = new Graphics();
            wireRect.rect(lowLodWire.relX, lowLodWire.relY, lowLodWire.width, lowLodWire.height);
            wireRect.fill({ color: LOW_LOD_COLORS.WIRES_FILL });
            wireRect.stroke({ 
                width: LOW_LOD_COLORS.STROKE_WIDTH, 
                color: LOW_LOD_COLORS.WIRES_STROKE 
            });
            lowLodWiresContainer.addChild(wireRect);
        }

        // Create low-LOD overlay rectangles
        for (const lowLodOverlay of tileGeometry.lowLodOverlays) {
            const overlayRect = new Graphics();
            overlayRect.rect(lowLodOverlay.relX, lowLodOverlay.relY, lowLodOverlay.width, lowLodOverlay.height);
            overlayRect.fill({ color: LOW_LOD_COLORS.OVERLAY_FILL });
            overlayRect.stroke({ 
                width: LOW_LOD_COLORS.STROKE_WIDTH, 
                color: LOW_LOD_COLORS.OVERLAY_STROKE 
            });
            lowLodWiresContainer.addChild(overlayRect);
        }

        lowLodWiresContainer.visible = false; // Initially hidden, controlled by LOD system

        // Mark for LOD system
        (lowLodWiresContainer as any).userData = { type: 'lowLodWires' };

        tileContainer.addChild(lowLodWiresContainer);
    }

    // =============================================================================
    // FABRIC MARKERS
    // =============================================================================

    private buildMarkers(): void {
        if (!this.currentGeometry) return;

        const markerContainer = new Container();
        
        // Create corner markers for fabric boundaries
        const corners = [
            { x: 0, y: 0 }, // Top-left
            { x: this.currentGeometry.width, y: 0 }, // Top-right
            { x: 0, y: this.currentGeometry.height }, // Bottom-left
            { x: this.currentGeometry.width, y: this.currentGeometry.height } // Bottom-right
        ];

        for (const corner of corners) {
            const marker = new Graphics();
            marker.rect(
                corner.x - TILE_CONSTANTS.MARKER_SIZE / 2, 
                corner.y - TILE_CONSTANTS.MARKER_SIZE / 2,
                TILE_CONSTANTS.MARKER_SIZE, 
                TILE_CONSTANTS.MARKER_SIZE
            );
            marker.fill({ color: TILE_CONSTANTS.MARKER_COLOR });
            markerContainer.addChild(marker);
        }

        this.fabricContainer.addChild(markerContainer);
    }

    // =============================================================================
    // COLOR UTILITIES
    // =============================================================================

    private getTileColor(tileName: string): number {
        // Generate consistent color based on tile name
        const hash = simpleHash(tileName);
        const hue = (hash * TILE_COLOR_CONSTANTS.HUE_MULTIPLIER) % TILE_COLOR_CONSTANTS.HUE_MODULO;
        return hslToHex(hue, TILE_COLOR_CONSTANTS.SATURATION, TILE_COLOR_CONSTANTS.LIGHTNESS);
    }

    // =============================================================================
    // EVENT CALLBACKS
    // =============================================================================

    public setTileClickCallback(callback: TileClickCallback): void {
        this.onTileClickCallback = callback;
    }

    public setSwitchMatrixClickCallback(callback: SwitchMatrixClickCallback): void {
        this.onSwitchMatrixClickCallback = callback;
    }

    public setBelClickCallback(callback: BelClickCallback): void {
        this.onBelClickCallback = callback;
    }

    public setPortClickCallback(callback: PortClickCallback): void {
        this.onPortClickCallback = callback;
    }

    public setWireClickCallback(callback: WireClickCallback): void {
        this.onWireClickCallback = callback;
    }

    private onTileClick(tileGeometry: TileGeometry, x: number, y: number): void {
        this.onTileClickCallback?.(tileGeometry, x, y);
    }

    private onSwitchMatrixClick(smGeometry: any): void {
        this.onSwitchMatrixClickCallback?.(smGeometry);
    }

    private onBelClick(belGeometry: any): void {
        this.onBelClickCallback?.(belGeometry);
    }

    private onPortClick(port: any): void {
        this.onPortClickCallback?.(port);
    }

    private onSwitchMatrixPortClick(port: any, portType: 'regular' | 'jump'): void {
        this.onPortClickCallback?.(port);
    }

    private onInternalWireClick(wireGeometry: WireGeometry): void {
        this.onWireClickCallback?.(wireGeometry);
    }

    private onSwitchMatrixWireClick(wireGeometry: SwitchMatrixWireGeometry): void {
        // For now, treat switch matrix wire clicks the same as regular wires
        // Could have separate callback in the future
        console.log(`Switch matrix wire clicked: ${wireGeometry.name} (${wireGeometry.sourcePort} → ${wireGeometry.destPort})`);
    }

    // =============================================================================
    // WIRE THICKNESS UPDATE
    // =============================================================================

    public updateWireThickness(tileWireThickness: number, switchMatrixWireThickness: number): void {
        // Update thickness for all tiles
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (tileContainer && tileContainer.visible) {
                    this.updateTileWireThickness(tileContainer, tileWireThickness, switchMatrixWireThickness);
                }
            }
        }
    }

    private updateTileWireThickness(tileContainer: Container, tileWireThickness: number, switchMatrixWireThickness: number): void {
        for (const child of tileContainer.children) {
            if (!child.userData) continue;
            
            const childType = child.userData.type;
            if (childType === 'internalWire' && child instanceof Graphics) {
                // Update tile-level internal wire thickness
                this.updateInternalWireThickness(child, tileWireThickness);
            } else if (childType === 'switchMatrix' && child instanceof Container) {
                // Update switch matrix wire thickness
                this.updateSwitchMatrixWireThickness(child, switchMatrixWireThickness);
            }
        }
    }

    private updateInternalWireThickness(wireGraphics: Graphics, thickness: number): void {
        const currentThickness = (wireGraphics as any).currentThickness;
        if (Math.abs(currentThickness - thickness) > 0.05) { // Only redraw if thickness changed significantly
            const wireGeometry = (wireGraphics as any).wireGeometry;
            if (wireGeometry) {
                this.drawWirePath(wireGraphics, wireGeometry, thickness);
                (wireGraphics as any).currentThickness = thickness;
            }
        }
    }

    private updateSwitchMatrixWireThickness(switchMatrixContainer: Container, thickness: number): void {
        for (const child of switchMatrixContainer.children) {
            if (child.userData?.type === 'switchMatrixWire' && child instanceof Graphics) {
                const currentThickness = (child as any).currentThickness;
                if (Math.abs(currentThickness - thickness) > 0.05) { // Only redraw if thickness changed significantly
                    const routingPath = (child as any).routingPath;
                    if (routingPath) {
                        this.drawSwitchMatrixWireRoutingPath(child, routingPath, thickness);
                        (child as any).currentThickness = thickness;
                    }
                }
            }
        }
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    public getTileContainers(): Container[][] {
        return this.tileContainers;
    }

    public getCurrentGeometry(): FabricGeometry | null {
        return this.currentGeometry;
    }

    // =============================================================================
    // ELEMENT HIGHLIGHTING
    // =============================================================================

    private highlightedElements: Set<Graphics> = new Set();
    private readonly HIGHLIGHT_COLOR = 0x00FFFF; // Cyan
    private readonly HIGHLIGHT_ALPHA = 0.8;

    public clearAllHighlights(): void {
        for (const element of this.highlightedElements) {
            this.removeHighlight(element);
        }
        this.highlightedElements.clear();
    }

    public highlightTileByPosition(x: number, y: number): void {
        if (!this.currentGeometry || y >= this.tileContainers.length || x >= this.tileContainers[y].length) {
            return;
        }

        const tileContainer = this.tileContainers[y][x];
        if (tileContainer) {
            this.highlightContainer(tileContainer);
        }
    }

    public highlightBelInTile(tileX: number, tileY: number, belName: string): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) return;

        for (const child of tileContainer.children) {
            if (child.userData?.type === 'bel' && child.userData?.name === belName) {
                this.highlightContainer(child as Container);
                break;
            }
        }
    }

    public highlightSwitchMatrixInTile(tileX: number, tileY: number): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) return;

        for (const child of tileContainer.children) {
            if (child.userData?.type === 'switchMatrix') {
                this.highlightContainer(child as Container);
                break;
            }
        }
    }

    public highlightPortInTile(tileX: number, tileY: number, portName: string, parentName?: string): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) return;

        // Find the port in BELs or switch matrix
        this.findAndHighlightPort(tileContainer, portName, parentName);
    }

    public highlightWireInTile(tileX: number, tileY: number, wireName: string): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) return;

        for (const child of tileContainer.children) {
            if (child.userData?.type === 'internalWire' && child.userData?.name === wireName) {
                this.highlightGraphics(child as Graphics);
                break;
            }
        }
    }

    private getTileContainer(x: number, y: number): Container | null {
        if (y >= 0 && y < this.tileContainers.length && 
            x >= 0 && x < this.tileContainers[y].length) {
            return this.tileContainers[y][x];
        }
        return null;
    }

    private highlightContainer(container: Container): void {
        // Create a highlight border around the container
        const bounds = container.getBounds();
        const highlightGraphics = new Graphics();
        
        highlightGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        highlightGraphics.stroke({ 
            width: 3, 
            color: this.HIGHLIGHT_COLOR, 
            alpha: this.HIGHLIGHT_ALPHA 
        });
        
        container.addChild(highlightGraphics);
        this.highlightedElements.add(highlightGraphics);
        
        // Mark for easy removal
        (highlightGraphics as any).isHighlight = true;
    }

    private highlightGraphics(graphics: Graphics): void {
        // Store original color
        if (!(graphics as any).originalColor) {
            (graphics as any).originalColor = graphics.tint || 0xFFFFFF;
        }
        
        // Apply highlight tint
        graphics.tint = this.HIGHLIGHT_COLOR;
        graphics.alpha = this.HIGHLIGHT_ALPHA;
        
        this.highlightedElements.add(graphics);
    }

    private findAndHighlightPort(container: Container, portName: string, parentName?: string): void {
        // Recursively search for the port
        for (const child of container.children) {
            if (child.userData?.type === 'port' && child.userData?.name === portName) {
                // Check if parent matches if specified
                if (!parentName || child.parent?.userData?.name === parentName) {
                    this.highlightGraphics(child as Graphics);
                    return;
                }
            } else if (child instanceof Container) {
                this.findAndHighlightPort(child, portName, parentName);
            }
        }
    }

    private removeHighlight(element: Graphics): void {
        if ((element as any).isHighlight) {
            // Remove highlight border
            element.parent?.removeChild(element);
        } else {
            // Restore original color
            const originalColor = (element as any).originalColor;
            if (originalColor !== undefined) {
                element.tint = originalColor;
                element.alpha = 1.0;
                delete (element as any).originalColor;
            }
        }
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        this.clearFabric();
        this.currentGeometry = null;
        this.tileContainers = [];
    }
}