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
import { FabricDataShape } from '../types/FabricData';
import { 
    TILE_CONSTANTS,
    SWITCH_MATRIX_CONSTANTS,
    SWITCH_MATRIX_WIRE_CONSTANTS,
    RENDER_MODES,
    SM_DIRECT_WIRE_STYLE,
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
    private currentGeometry: FabricDataShape | null = null;
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

    public buildFabric(geometry: FabricDataShape): Container[][] {
    // Build fabric tiles
        
        this.currentGeometry = geometry;
        this.clearFabric();
        this.tileContainers = this.initializeTileContainers(geometry);
        
        let tilesWithSwitchMatrix = 0;
        
        // Create all tiles
        const tileGeomMapAny: any = geometry.tileGeomMap as any; // allow object or Map-like
        for (let y = 0; y < geometry.numberOfRows; y++) {
            for (let x = 0; x < geometry.numberOfColumns; x++) {
                const tileName = geometry.tileNames[y][x];
                const mapObj: any = tileGeomMapAny as any;
                const key = String(tileName);
                const tileGeometry = tileGeomMapAny instanceof Map ? tileGeomMapAny.get(key) : mapObj[key];
                const location = geometry.tileLocations[y][x];

                if (!tileGeometry) {
                    console.warn(`⚠️ Missing tile geometry for name '${tileName}' at (${x},${y}). Available keys:`, tileGeomMapAny instanceof Map ? Array.from(tileGeomMapAny.keys()).slice(0,10) : Object.keys(tileGeomMapAny).slice(0,10));
                }

                if (tileGeometry && location) {
                    if (tileGeometry.smGeometry) { tilesWithSwitchMatrix++; }
                    this.createTile(tileGeometry, location, x, y);
                }
            }
        }
        
    // Build complete summary
        
        // Debug: Check a few tile geometries for switch matrix info
    // Sample tile stats removed

        // Build fabric markers
        this.buildMarkers();

        return this.tileContainers;
    }

    private initializeTileContainers(geometry: FabricDataShape): Container[][] {
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
    // Creating tile
        
        const tileContainer = this.tileContainers[fabricY][fabricX];
        tileContainer.x = location.x;
        tileContainer.y = location.y;

        // Create main tile rectangle
        const tileRect = this.createTileRectangle(tileGeometry, fabricX, fabricY);
        tileContainer.addChild(tileRect);

        // Create switch matrix if present
        if (tileGeometry.smGeometry) {
            // Creating switch matrix for tile
            this.createSwitchMatrix(tileGeometry.smGeometry, tileContainer);
            this.createLowLodSubstitute(tileGeometry.smGeometry, tileContainer);
        }

        // Create BELs
        for (const belGeometry of tileGeometry.belGeometryList) {
            this.createBel(belGeometry, tileContainer);
        }

        // Create internal wires (BEL-to-port connections) using batching for performance
        if (tileGeometry.wireGeometryList && tileGeometry.wireGeometryList.length) {
            this.createInternalWireBatch(tileGeometry.wireGeometryList, tileContainer);
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
    // Create switch matrix
        
    const smContainer = new Container();
    smContainer.sortableChildren = true;
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

    smRect.zIndex = 0;
    smContainer.addChild(smRect);

    // Auto-layout ports if they collapse (same coordinate) or no layout given
    this.autoLayoutSwitchMatrixPorts(smGeometry);

    // Create ports (above wires)
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

    // Create switch matrix wires
        
        // Create switch matrix internal wires
    this.createSwitchMatrixWires(smGeometry, smContainer);

        // Mark for LOD system and store geometry for wire creation
        (smContainer as any).userData = { type: 'switchMatrix', smGeometry };

        tileContainer.addChild(smContainer);
    }

    private autoLayoutSwitchMatrixPorts(smGeometry: SwitchMatrixGeometry): void {
        const ports = smGeometry.portGeometryList;
        if (!ports || ports.length === 0) { return; }
        const uniquePos = new Set(ports.map(p => `${p.relX},${p.relY}`));
        const needLayout = uniquePos.size < Math.max(3, Math.floor(ports.length * 0.3));
        if (!needLayout) { return; }
        const width = smGeometry.width || 120;
        const height = smGeometry.height || 120;
        const margin = 4;
        const leftSources = ports.filter(p => /beg/i.test(p.name));
        const rightDests = ports.filter(p => /(end|mid)/i.test(p.name));
        const others = ports.filter(p => !leftSources.includes(p) && !rightDests.includes(p));
        const placeVertical = (list: PortGeometry[], x: number) => {
            const step = (height - 2 * margin) / (list.length + 1);
            list.sort((a,b) => a.name.localeCompare(b.name));
            list.forEach((p,i) => { p.relX = x; p.relY = margin + step * (i+1); });
        };
        placeVertical(leftSources, margin);
        placeVertical(rightDests, width - margin);
        // Distribute others along bottom if any
        if (others.length) {
            const stepX = (width - 2 * margin) / (others.length + 1);
            others.sort((a,b) => a.name.localeCompare(b.name));
            others.forEach((p,i) => { p.relX = margin + stepX * (i+1); p.relY = height - margin; });
        }
    // Auto-laid out SM ports
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

    (portGraphics as any).zIndex = 3;
    smContainer.addChild(portGraphics);
    }

    private createSwitchMatrixWires(smGeometry: SwitchMatrixGeometry, smContainer: Container): void {
    // Creating switch matrix wires details removed
        
        const allPorts = [...smGeometry.portGeometryList, ...smGeometry.jumpPortGeometryList];
        
        // Debug: Print all port positions
        allPorts.forEach((port, i) => {
            // Port detail
        });

        // Use real switch matrix wires from CSV parsing if available
        if (!smGeometry.switchMatrixWires || smGeometry.switchMatrixWires.length === 0) {
            console.log(`    - No parsed wires found, generating fallback visualization`);
            // Generate basic internal wiring visualization as fallback
            smGeometry.switchMatrixWires = this.generateSwitchMatrixWires(smGeometry);
        } else {
            console.log(`    - Using ${smGeometry.switchMatrixWires.length} parsed switch matrix wires`);
        }

        const WIRES = smGeometry.switchMatrixWires;
        console.log(`    - Creating ${WIRES.length} visual wire representations...`);

        // Simplified mode: straight gray connections for clarity
        if (RENDER_MODES.SIMPLIFIED_SM_DIRECT) {
            const straight = new Graphics();
            // Collect port positions by name for fast lookup
            const findPort = (name: string): PortGeometry | null => this.findPortInSwitchMatrix(name, smGeometry);
            let count = 0;
            for (const w of WIRES) {
                const s = findPort(w.sourcePort); const d = findPort(w.destPort);
                if (!s || !d) {
                    console.warn(`SM direct: missing port(s) for ${w.sourcePort} -> ${w.destPort}`, { s, d, sm: smGeometry.name });
                    continue;
                }
                // Direct straight line
                straight.moveTo(s.relX, s.relY);
                straight.lineTo(d.relX, d.relY);
                count++;
            }
            straight.stroke({ width: SM_DIRECT_WIRE_STYLE.WIDTH, color: SM_DIRECT_WIRE_STYLE.COLOR, alpha: SM_DIRECT_WIRE_STYLE.ALPHA });
            (straight as any).userData = { type: 'switchMatrixWire' };
            (straight as any).zIndex = 2;
            (straight as any).currentThickness = SM_DIRECT_WIRE_STYLE.WIDTH;
            smContainer.addChild(straight);
            console.log(`      ✅ Drawn ${count} simplified direct SM wires`);
        } else if (WIRES.length > 300) {
            const batch = new Graphics();
            let count = 0;
            for (const wire of WIRES) {
                const src = this.findPortInSwitchMatrix(wire.sourcePort, smGeometry);
                const dst = this.findPortInSwitchMatrix(wire.destPort, smGeometry);
                if (!src || !dst) {
                    console.warn(`SM batch: missing port(s) for ${wire.sourcePort} -> ${wire.destPort}`, { src, dst, sm: smGeometry.name });
                    continue; }
                const path = this.calculateSwitchMatrixRoutingPath(src, dst, smGeometry);
                if (path.length < 2) { continue; }
                batch.moveTo(path[0].x, path[0].y);
                for (let i = 1; i < path.length; i++) { batch.lineTo(path[i].x, path[i].y); }
                count++;
            }
            batch.stroke({ width: SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH, color: SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_COLOR, alpha: SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_ALPHA });
            (batch as any).userData = { type: 'switchMatrixWire' };
            (batch as any).zIndex = 2;
            (batch as any).currentThickness = SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH;
            smContainer.addChild(batch);
            console.log(`      ✅ Batched ${count} SM wires`);
    } else {
            for (const wire of WIRES) {
                this.createSwitchMatrixWire(wire, smContainer, smGeometry);
            }
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

    (wireGraphics as any).zIndex = 2;
    smContainer.addChild(wireGraphics);
        console.log(`      ✅ Wire added to switch matrix container. Container now has ${smContainer.children.length} children`);
    }

    private findPortInSwitchMatrix(portName: string, smGeometry: SwitchMatrixGeometry): PortGeometry | null {
        const normalize = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normalize(portName);

        const candidates: PortGeometry[] = [
            ...smGeometry.portGeometryList,
            ...smGeometry.jumpPortGeometryList
        ];

        // 1) Exact match on name
        for (const p of candidates) { if (p.name === portName) { return p; } }

        // 2) Match on sourceName/destName
        for (const p of candidates) { if (p.sourceName === portName || p.destName === portName) { return p; } }

        // 3) Normalized match (strip punctuation/case)
        for (const p of candidates) {
            if (normalize(p.name) === target || normalize(p.sourceName) === target || normalize(p.destName) === target) {
                return p;
            }
        }

        // 4) Suffix match (handle tile prefixes)
        for (const p of candidates) {
            const pn = normalize(p.name);
            if (target.endsWith(pn) || pn.endsWith(target)) { return p; }
        }

        // Not found
        return null;
    }

    private calculateSwitchMatrixRoutingPath(sourcePort: PortGeometry, destPort: PortGeometry, smGeometry: SwitchMatrixGeometry): Location[] {
        // Implement Java-like smart routing logic with bias towards Manhattan paths for clarity
        const BORDER_INSET = 2; // px inset to keep wires off the SM border stroke
        const clampIn = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const insetPoint = (pt: {x:number,y:number}) => ({
            x: clampIn(pt.x, BORDER_INSET, Math.max(BORDER_INSET, smGeometry.width - BORDER_INSET)),
            y: clampIn(pt.y, BORDER_INSET, Math.max(BORDER_INSET, smGeometry.height - BORDER_INSET))
        });
        const sourceLocation = insetPoint({ x: sourcePort.relX, y: sourcePort.relY });
        const destLocation = insetPoint({ x: destPort.relX, y: destPort.relY });
        
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
        
    // Prefer Manhattan path unless strictly aligned to minimize diagonal clutter
        const preferManhattan = !(sourceLocation.x === destLocation.x || sourceLocation.y === destLocation.y);
        if (preferManhattan) {
            // Choose L-shaped route using smaller delta first
            const dx = Math.abs(destLocation.x - sourceLocation.x);
            const dy = Math.abs(destLocation.y - sourceLocation.y);
            const lanes = 7; // odd number to keep a centered lane
            const laneSpacing = 2; // px
            const hash = (s: string) => {
                let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
                return Math.abs(h);
            };
            const laneIndex = (hash(sourcePort.name + '->' + destPort.name) % lanes) - Math.floor(lanes/2);
            const offset = laneIndex * laneSpacing;

            if (dx <= dy) {
                // Vertical then horizontal: elbow at (sx, dy)
                const elbow = { x: sourceLocation.x, y: destLocation.y };
                // Offset elbow horizontally to separate parallel bundles
                const elbowOffset = {
                    x: Math.max(1, Math.min(smGeometry.width - 1, elbow.x + offset)),
                    y: elbow.y
                };
                return [sourceLocation, elbowOffset, destLocation];
            } else {
                // Horizontal then vertical: elbow at (dx, sy)
                const elbow = { x: destLocation.x, y: sourceLocation.y };
                // Offset elbow vertically to separate parallel bundles
                const elbowOffset = {
                    x: elbow.x,
                    y: Math.max(1, Math.min(smGeometry.height - 1, elbow.y + offset))
                };
                return [sourceLocation, elbowOffset, destLocation];
            }
        }
        // Simple direct connection when aligned
        return [sourceLocation, destLocation];
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

    private createInternalWireBatch(wireGeometries: WireGeometry[], tileContainer: Container): void {
        const batchGraphics = new Graphics();
        const segments: { name: string; geometry: WireGeometry; }[] = [];
        const thickness = WIRE_CONSTANTS.DEFAULT_WIDTH;

        // Determine optional clipping region: use union of BEL geometries if present
        const belBounds = { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity };
        for (const child of tileContainer.children) {
            const anyChild: any = child as any;
            if (anyChild.userData?.type === 'bel') {
                const g = child as Container;
                const localBounds = g.getBounds();
                belBounds.x = Math.min(belBounds.x, localBounds.x);
                belBounds.y = Math.min(belBounds.y, localBounds.y);
                belBounds.right = Math.max(belBounds.right, localBounds.x + localBounds.width);
                belBounds.bottom = Math.max(belBounds.bottom, localBounds.y + localBounds.height);
            }
        }
        const hasBelBounds = belBounds.right > belBounds.x && belBounds.bottom > belBounds.y;

        // Optional routing helper to avoid single straight diagonal lines (convert to Manhattan)
        const manhattanize = (path: {x:number,y:number}[]): {x:number,y:number}[] => {
            if (path.length !== 2) { return path; } // only adjust trivial two-point wires
            const [a,b] = path;
            if (a.x === b.x || a.y === b.y) { return path; } // already orthogonal
            // Insert an L-turn choosing axis with smaller delta first
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            if (dx < dy) {
                return [a, { x: a.x, y: b.y }, b];
            } else {
                return [a, { x: b.x, y: a.y }, b];
            }
        };

        for (const wg of wireGeometries) {
            if (!wg.path || wg.path.length < 2) { continue; }
            const path = manhattanize(wg.path);
            batchGraphics.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                batchGraphics.lineTo(path[i].x, path[i].y);
            }
            segments.push({ name: wg.name, geometry: wg });
        }

        batchGraphics.stroke({
            width: thickness,
            color: WIRE_CONSTANTS.DEFAULT_COLOR,
            alpha: WIRE_CONSTANTS.DEFAULT_ALPHA
        });

        // Store metadata for thickness update & potential hit detection upgrades
        (batchGraphics as any).wireBatch = segments;
        (batchGraphics as any).currentThickness = thickness;
        (batchGraphics as any).userData = { type: 'internalWireBatch', wireType: 'internalBatch' };

        batchGraphics.eventMode = 'static';
        batchGraphics.cursor = 'pointer';
        batchGraphics.on('click', () => {
            // For now just emit first wire info if exists
            if (segments.length) { this.onInternalWireClick(segments[0].geometry); }
        });

        tileContainer.addChild(batchGraphics);

        if (hasBelBounds) {
            // Apply a mask so internal wires do not extend outside BEL(s)
            const mask = new Graphics();
            mask.rect(belBounds.x, belBounds.y, belBounds.right - belBounds.x, belBounds.bottom - belBounds.y);
            mask.fill({ color: 0xffffff, alpha: 1 });
            tileContainer.addChild(mask);
            batchGraphics.mask = mask;
        }
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
    if (!this.currentGeometry) { return; }

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
            const anyChild: any = child as any;
            if (!anyChild.userData) { continue; }
            
            const childType = anyChild.userData.type;
            if (childType === 'internalWire' && child instanceof Graphics) {
                // Legacy single wire (should be rare after batching)
                this.updateInternalWireThickness(child, tileWireThickness);
            } else if (childType === 'internalWireBatch' && child instanceof Graphics) {
                this.updateInternalWireBatchThickness(child, tileWireThickness);
            } else if (childType === 'switchMatrix' && child instanceof Container) {
                // Update switch matrix wire thickness
                this.updateSwitchMatrixWireThickness(child, switchMatrixWireThickness);
            }
        }
    }

    private updateInternalWireBatchThickness(batchGraphics: Graphics, thickness: number): void {
        const currentThickness = (batchGraphics as any).currentThickness;
    if (Math.abs(currentThickness - thickness) <= 0.05) { return; }

        const batch = (batchGraphics as any).wireBatch as { geometry: WireGeometry }[];
    if (!batch || !batch.length) { return; }

        // Redraw all segments with new thickness
        batchGraphics.clear();
        for (const seg of batch) {
            const path = seg.geometry.path;
            if (!path || path.length < 2) { continue; }
            batchGraphics.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                batchGraphics.lineTo(path[i].x, path[i].y);
            }
        }
        batchGraphics.stroke({
            width: thickness,
            color: WIRE_CONSTANTS.DEFAULT_COLOR,
            alpha: WIRE_CONSTANTS.DEFAULT_ALPHA
        });
        (batchGraphics as any).currentThickness = thickness;
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
            const c: any = child as any;
            if (c.userData?.type === 'switchMatrixWire' && child instanceof Graphics) {
                const currentThickness = (child as any).currentThickness;
                if (Math.abs(currentThickness - thickness) > 0.05) { // Only redraw if thickness changed significantly
                    const routingPath = (child as any).routingPath;
                    if (routingPath) {
                        // Per-wire instance
                        this.drawSwitchMatrixWireRoutingPath(child, routingPath, thickness);
                        (child as any).currentThickness = thickness;
                    } else {
                        // Batched instance: re-stroke with new thickness (path is already in graphics buffers)
                        // Clear only stroke style by redrawing stroke over existing path definitions
                        // Note: Pixi Graphics does not preserve vector path after clear, so we only restroke if not cleared
                        // For now, do nothing (will pick up new thickness on rebuild). Optionally could rebuild batch here.
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

    public getCurrentGeometry(): FabricDataShape | null {
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
        if (!tileContainer) { return; }

        for (const child of tileContainer.children) {
            const anyChild: any = child as any;
            if (anyChild.userData?.type === 'bel' && anyChild.userData?.name === belName) {
                this.highlightContainer(child as Container);
                break;
            }
        }
    }

    public highlightSwitchMatrixInTile(tileX: number, tileY: number): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) { return; }

        for (const child of tileContainer.children) {
            const anyChild: any = child as any;
            if (anyChild.userData?.type === 'switchMatrix') {
                this.highlightContainer(child as Container);
                break;
            }
        }
    }

    public highlightPortInTile(tileX: number, tileY: number, portName: string, parentName?: string): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) { return; }

        // Find the port in BELs or switch matrix
        this.findAndHighlightPort(tileContainer, portName, parentName);
    }

    public highlightWireInTile(tileX: number, tileY: number, wireName: string): void {
        const tileContainer = this.getTileContainer(tileX, tileY);
        if (!tileContainer) { return; }

        for (const child of tileContainer.children) {
            const anyChild: any = child as any;
            if (anyChild.userData?.type === 'internalWire' && anyChild.userData?.name === wireName) {
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
            const anyChild: any = child as any;
            if (anyChild.userData?.type === 'port' && anyChild.userData?.name === portName) {
                // Check if parent matches if specified
                const parentUserData: any = (child.parent as any)?.userData;
                if (!parentName || parentUserData?.name === parentName) {
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