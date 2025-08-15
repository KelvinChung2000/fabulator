/**
 * FabricRenderer.ts - Refactored Main Renderer
 * 
 * Main orchestrator for fabric visualization. This class coordinates between:
 * - ViewportManager: Handles viewport controls and events
 * - ViewportCullingLODManager: Manages culling and level of detail
 * - TileRenderer: Creates and renders fabric tiles
 * - DesignRenderer: Handles design overlay rendering
 * 
 * This refactored version provides better separation of concerns and maintainability.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { TileGeometry, WireGeometry } from '../types/geometry';
import { FabricData, FabricDataShape } from '../types/FabricData';
import { DesignData, DiscreteLocation, ConnectedPorts } from '../types/design';

// Import all the new modular components
import { ViewportManager, ViewportChangeCallback } from './ViewportManager';
import { ViewportCullingLODManager } from './ViewportCullingLODManager';
import { TileRenderer } from './TileRenderer';
import { DesignRenderer } from './DesignRenderer';

// Import constants
import { 
    VIEWPORT_INITIAL_UPDATE_DELAY_MS,
    DEBUG_CONSTANTS,
    PERFORMANCE_CONSTANTS 
} from './FabricConstants';

// Hard safety flag: disable cross-tile overlay to prevent startup crashes during investigation.
const DISABLE_CROSS_TILE_OVERLAY = true;

export class FabricRenderer {
    private app: Application;
    
    // Main containers
    private fabricContainer: Container;
    private designContainer: Container;
    private crossTileLayer: Container | null = null;
    private tooltipLayer: Container | null = null;
    private tooltip?: { container: Container; bg: Graphics; text: any };
    
    // Modular managers
    private viewportManager: ViewportManager;
    private cullingLODManager: ViewportCullingLODManager;
    private tileRenderer: TileRenderer;
    private designRenderer: DesignRenderer;
    
    // State tracking
    private currentGeometry: FabricDataShape | null = null;
    private currentDesign: DesignData | null = null;
    private tileContainers: Container[][] = [];

    constructor(app: Application) {
        this.app = app;
        
        // Initialize managers
        this.viewportManager = new ViewportManager(app);
        this.cullingLODManager = new ViewportCullingLODManager(this.viewportManager.getViewport());
        
        // Create main containers within viewport
        this.fabricContainer = new Container();
        this.designContainer = new Container();
        this.viewportManager.getViewport().addChild(this.fabricContainer);
        this.viewportManager.getViewport().addChild(this.designContainer);
        
        // Initialize renderers
        this.tileRenderer = new TileRenderer(this.fabricContainer);
        this.designRenderer = new DesignRenderer(this.designContainer);

    // Tooltip overlay layer (above fabric, below design overlay for now)
    this.tooltipLayer = new Container();
    this.viewportManager.getViewport().addChild(this.tooltipLayer);
    this.createTooltip();
        
        // Set up wire thickness update callback for LOD manager
        this.cullingLODManager.setWireThicknessUpdateCallback((tileThickness, smThickness) => {
            this.tileRenderer.updateWireThickness(tileThickness, smThickness);
        });
        
        // Set up viewport change callback to update LOD and culling
        this.viewportManager.setViewportChangeCallback((bounds, zoom) => {
            this.cullingLODManager.updateLOD();
            this.onViewportChangeCallback?.(bounds, zoom);
            this.updateCrossTileBundleThickness();
        });
        
        // Set up tile renderer callbacks
        this.setupTileRendererCallbacks();
        this.setupDesignRendererCallbacks();
    }

    // =============================================================================
    // CALLBACK SETUP
    // =============================================================================

    private setupTileRendererCallbacks(): void {
        this.tileRenderer.setTileClickCallback((tileGeometry, x, y) => {
            this.onTileClick(tileGeometry, x, y);
        });

        this.tileRenderer.setSwitchMatrixClickCallback((smGeometry) => {
            this.onSwitchMatrixClick(smGeometry);
        });

        this.tileRenderer.setBelClickCallback((belGeometry) => {
            this.onBelClick(belGeometry);
        });

        this.tileRenderer.setPortClickCallback((port) => {
            this.onPortClick(port);
        });

        this.tileRenderer.setWireClickCallback((wireGeometry) => {
            this.onInternalWireClick(wireGeometry);
        });
    }

    private setupDesignRendererCallbacks(): void {
        this.designRenderer.setDesignConnectionClickCallback((ports, location) => {
            this.onDesignConnectionClick(ports, location);
        });
    }

    // =============================================================================
    // FABRIC LOADING
    // =============================================================================

    public loadFabric(geometry: FabricDataShape): void {
        const t0 = performance.now();
        try {
            // Validate required serialized fields (strict mode)
            const requiredKeys: (keyof FabricDataShape)[] = ['tiles','tileDict','wireDict','_subTileToTile'];
            for (const k of requiredKeys) {
                if ((geometry as any)[k] === undefined) { throw new Error(`Serialized fabric missing required field: ${String(k)}`); }
            }
            // Dimension validation
            if (geometry.tiles.length !== geometry.numberOfRows) { throw new Error(`tiles length ${geometry.tiles.length} != numberOfRows ${geometry.numberOfRows}`); }
            if (geometry.tiles.some(row => row.length !== geometry.numberOfColumns)) { throw new Error(`row length mismatch numberOfColumns ${geometry.numberOfColumns}`); }
            this.currentGeometry = geometry;
            this.clearFabric();

        // Validate that every tile name appearing in tiles matrix has an entry in tileGeomMap
        const missing = new Map<string, number>();
        for (let r=0;r<geometry.numberOfRows;r++) {
            for (let c=0;c<geometry.numberOfColumns;c++) {
                const tName = geometry.tileNames[r][c];
                if (!tName) { continue; }
                if (!geometry.tileGeomMap[tName]) {
                    missing.set(tName, (missing.get(tName)||0)+1);
                }
            }
        }
        if (missing.size) {
            console.warn("⚠️ Missing tile geometry definitions detected:", Array.from(missing.entries()));
            // Create lightweight placeholder geometries so rendering does not crash
            for (const [name] of missing.entries()) {
                geometry.tileGeomMap[name] = {
                    name,
                    width: 40,
                    height: 40,
                    smGeometry: undefined as any,
                    belGeometryList: [],
                    wireGeometryList: [],
                    lowLodWiresGeoms: [],
                    lowLodOverlays: []
                } as any;
            }
        }
        
            const tTilesStart = performance.now();
            this.tileContainers = this.tileRenderer.buildFabric(geometry);
            const tTilesEnd = performance.now();

            const tOverlayStart = performance.now();
            this.buildCrossTileOverlay(geometry);
            const tOverlayEnd = performance.now();
        
            this.cullingLODManager.initializeForGeometry(geometry, this.tileContainers);
            this.designRenderer.initializeForGeometry(geometry, this.tileContainers);
        
            this.centerFabric();
        
            setTimeout(() => {
                this.cullingLODManager.updateLOD();
                this.viewportManager.forceViewportUpdate();
            }, VIEWPORT_INITIAL_UPDATE_DELAY_MS);
            const t1 = performance.now();
            console.info(`Fabric load timing tiles=${(tTilesEnd-tTilesStart).toFixed(1)}ms overlay=${(tOverlayEnd-tOverlayStart).toFixed(1)}ms total=${(t1-t0).toFixed(1)}ms`);
        } catch (e) {
            console.error('Fabric load error', e);
            this.currentGeometry = null;
            throw e;
        }
    }

    private buildCrossTileOverlay(geometry: FabricDataShape): void {
    if (DISABLE_CROSS_TILE_OVERLAY) { console.warn('Cross-tile overlay disabled (safe mode flag)'); return; }
    if (this.crossTileLayer) { this.crossTileLayer.destroy({ children: true }); }
    this.crossTileLayer = new Container();
    (this.crossTileLayer as any).userData = { type: 'crossTileLayer' };
    // Insert at index 0 so tiles render above bundles
    this.fabricContainer.addChildAt(this.crossTileLayer, 0);

        // Use wireDict for richer aggregate cross-tile representation
        // wireDict keys like "(dx, dy)" contain array entries with wireCount and metadata
        // We'll aggregate per origin tile using relative offsets from geometry.tiles grid
        const baseStroke = 0.6;
        const totalTiles = geometry.numberOfRows * geometry.numberOfColumns;
        const MAX_GLOBAL_BUNDLES = (PERFORMANCE_CONSTANTS as any)?.CROSS_TILE_MAX_GLOBAL_LINES || 4000;
        const SKIP_THRESHOLD_TILES = 2500; // heuristic
        if (totalTiles > SKIP_THRESHOLD_TILES) {
            console.warn('Skipping cross-tile overlay (too many tiles)', { totalTiles });
            return;
        }
        const bundleAccumulator: { start: {r:number;c:number}; target: {r:number;c:number}; dx:number; dy:number; total:number; sample:any[] }[] = [];
        let globalBundles = 0;
        // Pre-group per tile with per-tile line limits
        for (let r = 0; r < geometry.numberOfRows; r++) {
            for (let c = 0; c < geometry.numberOfColumns; c++) {
                const loc = geometry.tileLocations[r][c];
                if (!loc) { continue; }
                let drawnForTile = 0;
                if (drawnForTile >= PERFORMANCE_CONSTANTS.CROSS_TILE_MAX_LINES_PER_TILE) { continue; }
                for (const deltaKey of Object.keys(geometry.wireDict)) {
                    if (drawnForTile >= PERFORMANCE_CONSTANTS.CROSS_TILE_MAX_LINES_PER_TILE) { break; }
                    const match = deltaKey.match(/\(([-0-9]+),\s*([-0-9]+)\)/);
                    if (!match) { continue; }
                    const dx = parseInt(match[1], 10);
                    const dy = parseInt(match[2], 10);
                    const targetRow = r + dy;
                    const targetCol = c + dx;
                    if (targetRow < 0 || targetRow >= geometry.numberOfRows || targetCol < 0 || targetCol >= geometry.numberOfColumns) { continue; }
                    const entries: any[] = geometry.wireDict[deltaKey];
                    if (!entries || !entries.length) { continue; }
                    let total = 0; for (const e of entries) { if (typeof e.wireCount === 'number') { total += e.wireCount; } }
                    if (!total) { continue; }
                    if (globalBundles < MAX_GLOBAL_BUNDLES) {
                        bundleAccumulator.push({ start: {r,c}, target: {r:targetRow,c:targetCol}, dx, dy, total, sample: entries.slice(0, PERFORMANCE_CONSTANTS.CROSS_TILE_GROUP_SAMPLE_LIMIT) });
                        drawnForTile++;
                        globalBundles++;
                    }
                }
                if (globalBundles >= MAX_GLOBAL_BUNDLES) { break; }
            }
            if (globalBundles >= MAX_GLOBAL_BUNDLES) { break; }
        }
        // Draw bundles
        console.info(`Cross-tile bundles drawn: ${bundleAccumulator.length}`);
    for (const bundle of bundleAccumulator) {
            const { start, target, dx, dy, total, sample } = bundle;
            const loc = geometry.tileLocations[start.r][start.c];
            const targetLoc = geometry.tileLocations[target.r][target.c];
            if (!loc || !targetLoc) { continue; }
            const startName = geometry.tileNames[start.r][start.c];
            const targetName = geometry.tileNames[target.r][target.c];
            const startGeom = startName ? geometry.tileGeomMap[startName] : undefined;
            const targetGeom = targetName ? geometry.tileGeomMap[targetName] : undefined;
            if (!startGeom || !targetGeom) { continue; }
            const tileW = startGeom.width ?? 0;
            const tileH = startGeom.height ?? 0;
            const tgtW = targetGeom.width ?? 0;
            const tgtH = targetGeom.height ?? 0;
            const startX = loc.x + (dx > 0 ? tileW : dx < 0 ? 0 : tileW / 2);
            const startY = loc.y + (dy > 0 ? tileH : dy < 0 ? 0 : tileH / 2);
            const endX = targetLoc.x + (dx > 0 ? 0 : dx < 0 ? tgtW : tgtW / 2);
            const endY = targetLoc.y + (dy > 0 ? 0 : dy < 0 ? tgtH : tgtH / 2);
            const g = new Graphics();
            const pathPoints: {x:number,y:number}[] = [];
            if (startX === endX || startY === endY) {
                pathPoints.push({x:startX,y:startY},{x:endX,y:endY});
            } else {
                const midX = startX + (endX - startX) * 0.5;
                pathPoints.push({x:startX,y:startY},{x:midX,y:startY},{x:midX,y:endY},{x:endX,y:endY});
            }
            g.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i=1;i<pathPoints.length;i++){ g.lineTo(pathPoints[i].x, pathPoints[i].y); }
            const rawWidth = baseStroke + Math.log10(total + 1) * 1.0;
            g.stroke({ width: rawWidth, color: 0xffa500, alpha: 0.18 });
            const startTileName = geometry.tileNames[start.r][start.c];
            const endTileName = geometry.tileNames[target.r][target.c];
            (g as any).userData = { 
                type: 'crossTileWireBundle', 
                totalWireCount: total, 
                dx, dy, 
                entries: sample, 
                startTileName, endTileName,
                baseWidth: rawWidth,
                compression: total / sample.length,
                sampleNames: sample.map(e => e.name || e.id || `${dx},${dy}`)
            };
            (g as any).originalPathPoints = pathPoints;
            g.eventMode = 'static'; g.cursor = 'pointer';
            g.on('pointerover', (ev: any) => this.showWireTooltip(ev.global.x, ev.global.y, g));
            g.on('pointermove', (ev: any) => this.moveTooltip(ev.global.x, ev.global.y));
            g.on('pointerout', () => this.hideTooltip());
            this.crossTileLayer.addChild(g);
        }
        // Put design overlay above cross-tile wires
        this.fabricContainer.setChildIndex(this.crossTileLayer, 0);
        // After creation, update dynamic thickness based on current zoom
        this.updateCrossTileBundleThickness();
    }

    // =============================================================================
    // TOOLTIP IMPLEMENTATION
    // =============================================================================

    private createTooltip() {
        if (!this.tooltipLayer) { return; }
        const container = new Container();
        container.visible = false;
        const bg = new Graphics();
        // We'll use PIXI Text via dynamic import to keep existing imports minimal
        // Lazy creation pattern: store plain object placeholder; real text assigned later.
        const anyContainer: any = container;
        anyContainer.label = null;
        container.addChild(bg);
        this.tooltipLayer.addChild(container);
        this.tooltip = { container, bg, text: null };
    }

    private ensureTooltipText() {
        if (!this.tooltip) { return; }
        if (this.tooltip.text) { return; }
        // Dynamic require to avoid top-level import churn if not already present.
        const { Text } = require('pixi.js');
        const textObj = new Text({ text: '', style: { fontSize: 12, fill: 0xffffff } });
        this.tooltip.container.addChild(textObj);
        this.tooltip.text = textObj;
    }

    private showWireTooltip(x: number, y: number, g: Graphics) {
        if (!this.tooltip) { return; }
        this.ensureTooltipText();
        const data = (g as any).userData;
        const lines: string[] = [];
        lines.push(`Bundle ${data.startTileName || ''}→${data.endTileName || ''}`.trim());
        if (typeof data.totalWireCount === 'number') { lines.push(`Total wires: ${data.totalWireCount}`); }
        if (data.compression && data.compression > 1) { lines.push(`Compression: ${data.compression.toFixed(1)}x`); }
        if (Array.isArray(data.sampleNames) && data.sampleNames.length) {
            lines.push(`Sample: ${data.sampleNames.slice(0,4).join(', ')}${data.sampleNames.length>4?'…':''}`);
        }
        // Upstream / downstream endpoints: treat start as upstream, end as downstream.
        const text = lines.join('\n');
        if (this.tooltip.text) { this.tooltip.text.text = text; }
        // Resize background
        this.tooltip.bg.clear();
        const padding = 6;
        const w = this.tooltip.text ? this.tooltip.text.width + padding * 2 : 40;
        const h = this.tooltip.text ? this.tooltip.text.height + padding * 2 : 20;
        this.tooltip.bg.roundRect(0, 0, w, h, 4).fill({ color: 0x000000, alpha: 0.75 }).stroke({ width: 1, color: 0xffa500, alpha: 0.9 });
        if (this.tooltip.text) { this.tooltip.text.x = padding; this.tooltip.text.y = padding; }
        this.tooltip.container.x = x + 12;
        this.tooltip.container.y = y + 12;
        this.tooltip.container.visible = true;
    }

    private moveTooltip(x: number, y: number) {
        if (!this.tooltip || !this.tooltip.container.visible) { return; }
        this.tooltip.container.x = x + 12;
        this.tooltip.container.y = y + 12;
    }

    private updateCrossTileBundleThickness() {
        if (!this.crossTileLayer) { return; }
        const zoom = this.viewportManager.getViewport().scale.x || 1;
        for (const child of this.crossTileLayer.children) {
            const anyChild: any = child as any;
            if (!anyChild.userData || anyChild.userData.type !== 'crossTileWireBundle') { continue; }
            const g = child as Graphics;
            const baseWidth = anyChild.userData.baseWidth || 0.6;
            // Dynamic scaling: sqrt(zoom) to moderate growth; clamp
            const scaled = Math.min(4, Math.max(0.2, baseWidth * Math.sqrt(zoom)));
            // Redraw path with new stroke width (reconstruct by reading geometry commands is non-trivial; we simply overdraw by clearing) 
            // For simplicity store original points? If not stored, skip.
            if (!anyChild.originalPathPoints) { continue; }
            g.clear();
            const pts: {x:number,y:number}[] = anyChild.originalPathPoints;
            g.moveTo(pts[0].x, pts[0].y);
            for (let i=1;i<pts.length;i++){ g.lineTo(pts[i].x, pts[i].y); }
            g.stroke({ width: scaled, color: 0xffa500, alpha: 0.18 });
        }
    }

    private hideTooltip() {
        if (!this.tooltip) { return; }
        this.tooltip.container.visible = false;
    }

    private edgePoint(x: number, y: number, w: number, h: number, dir: string) {
        switch (dir) {
            case 'NORTH': return { x: x + w / 2, y: y };
            case 'SOUTH': return { x: x + w / 2, y: y + h };
            case 'EAST': return { x: x + w, y: y + h / 2 };
            case 'WEST': return { x: x, y: y + h / 2 };
            default: return { x: x + w / 2, y: y + h / 2 };
        }
    }

    private oppositeDirection(dir: string) {
        switch (dir) {
            case 'NORTH': return 'SOUTH';
            case 'SOUTH': return 'NORTH';
            case 'EAST': return 'WEST';
            case 'WEST': return 'EAST';
            default: return dir;
        }
    }

    public loadDesign(designData: DesignData): void {
    // Loading design
        
        this.currentDesign = designData;
        this.clearDesign();
        
        if (this.currentGeometry) {
            // Building design overlay
            this.designRenderer.buildDesignOverlay(designData);
        } else {
            console.warn('⚠️  No geometry loaded - cannot display design overlay');
        }
        
    // Design loaded summary
    }

    // =============================================================================
    // CLEARING AND CLEANUP
    // =============================================================================

    private clearFabric(): void {
        this.tileRenderer.destroy();
        this.tileContainers = [];
    }

    public clearDesign(): void {
        this.designRenderer.clearDesign();
        this.currentDesign = null;
    }

    private centerFabric(): void {
        if (!this.currentGeometry) { return; }
        
        const bounds = {
            x: 0,
            y: 0,
            width: this.currentGeometry.width,
            height: this.currentGeometry.height
        };
        
        this.viewportManager.centerOnBounds(bounds);
    }

    // =============================================================================
    // VIEWPORT CONTROLS (Delegated to ViewportManager)
    // =============================================================================

    public zoomIn(): void {
        this.viewportManager.zoomIn();
    }

    public zoomOut(): void {
        this.viewportManager.zoomOut();
    }

    public zoomToFit(): void {
        this.viewportManager.zoomToFit();
    }

    public zoomReset(): void {
        this.viewportManager.zoomReset();
    }

    public getZoomLevel(): number {
        return this.viewportManager.getZoomLevel();
    }

    public panTo(x: number, y: number): void {
        this.viewportManager.panTo(x, y);
    }

    public panToImmediate(x: number, y: number): void {
        this.viewportManager.panToImmediate(x, y);
    }

    public getViewportBounds(): { x: number, y: number, width: number, height: number } {
        return this.viewportManager.getViewportBounds();
    }

    // =============================================================================
    // LOD AND CULLING CONTROLS (Delegated to ViewportCullingLODManager)
    // =============================================================================

    public updateLOD(): void {
        this.cullingLODManager.updateLOD();
    }

    public forceViewportUpdate(): void {
        this.viewportManager.forceViewportUpdate();
        this.cullingLODManager.updateLOD();
    }

    public forceCullingUpdate(): void {
        this.cullingLODManager.forceCullingUpdate();
    }

    public disableCulling(): void {
        this.cullingLODManager.disableCulling();
    }

    // =============================================================================
    // WIRE HIGHLIGHTING AND THICKNESS (Delegated to ViewportCullingLODManager)
    // =============================================================================

    public highlightWire(wire: Graphics, color: number): void {
        this.cullingLODManager.highlightWire(wire, color);
    }

    public unHighlightWire(wire: Graphics): void {
        this.cullingLODManager.unHighlightWire(wire);
    }

    public updateWireThickness(tileWireThickness: number, switchMatrixWireThickness: number): void {
        this.tileRenderer.updateWireThickness(tileWireThickness, switchMatrixWireThickness);
    }

    // =============================================================================
    // NET MANAGEMENT (Delegated to DesignRenderer)
    // =============================================================================

    public highlightNet(netName: string): void {
        this.designRenderer.highlightNet(netName);
    }

    public unHighlightAllNets(): void {
        this.designRenderer.unHighlightAllNets();
    }

    // =============================================================================
    // ELEMENT HIGHLIGHTING
    // =============================================================================

    public highlightElement(elementData: any): void {
        this.clearAllHighlights();
        
        switch (elementData.type) {
            case 'tile':
                this.highlightTile(elementData);
                break;
            case 'bel':
                this.highlightBel(elementData);
                break;
            case 'switchMatrix':
                this.highlightSwitchMatrix(elementData);
                break;
            case 'port':
                this.highlightPort(elementData);
                break;
            case 'wire':
                this.highlightWireElement(elementData);
                break;
            case 'net':
                this.highlightNet(elementData.name);
                break;
            default:
                // Unsupported highlight type
        }
    }

    public clearAllHighlights(): void {
        this.tileRenderer.clearAllHighlights();
        this.unHighlightAllNets();
    }

    private highlightTile(elementData: any): void {
    if (!this.currentGeometry || !elementData.position) { return; }
        
        const { tileLocations, tileGeomMap, tileNames } = this.currentGeometry;
        const tileLocation = tileLocations[elementData.position.y][elementData.position.x];
        const tileName = tileNames[elementData.position.y][elementData.position.x];
        
        if (tileLocation && tileName) {
            const tileGeometry = tileGeomMap[tileName];
            if (tileGeometry) {
                // Pan to tile center
                const centerX = tileLocation.x + tileGeometry.width / 2;
                const centerY = tileLocation.y + tileGeometry.height / 2;
                this.panTo(centerX, centerY);
                
                // Highlight the tile
                this.tileRenderer.highlightTileByPosition(elementData.position.x, elementData.position.y);
                
                // Highlighted tile centered
            }
        }
    }

    private highlightBel(elementData: any): void {
    if (!elementData.tilePosition) { return; }
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific BEL
        this.tileRenderer.highlightBelInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name
        );
        
    // Highlighted BEL
    }

    private highlightSwitchMatrix(elementData: any): void {
    if (!elementData.tilePosition) { return; }
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the switch matrix
        this.tileRenderer.highlightSwitchMatrixInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y
        );
        
    // Highlighted switch matrix
    }

    private highlightPort(elementData: any): void {
    if (!elementData.tilePosition) { return; }
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific port
        this.tileRenderer.highlightPortInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name,
            elementData.parentName // BEL or switch matrix name
        );
        
    // Highlighted port
    }

    private highlightWireElement(elementData: any): void {
    if (!elementData.tilePosition) { return; }
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific wire
        this.tileRenderer.highlightWireInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name
        );
        
    // Highlighted wire
    }

    // =============================================================================
    // EVENT CALLBACKS AND EXTERNAL INTERFACE
    // =============================================================================

    private onViewportChangeCallback?: ViewportChangeCallback;

    public setViewportChangeCallback(callback: ViewportChangeCallback): void {
        this.onViewportChangeCallback = callback;
    }

    // Tile interaction callbacks
    private onTileClick(tileGeometry: TileGeometry, x: number, y: number): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // Tile click
        }
        // Could emit events or call external callbacks here
    }

    private onSwitchMatrixClick(smGeometry: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // Switch matrix click
        }
        // Could emit events or call external callbacks here
    }

    private onBelClick(belGeometry: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // BEL click
        }
        // Could emit events or call external callbacks here
    }

    private onPortClick(port: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // Port click
        }
        // Could emit events or call external callbacks here
    }

    private onInternalWireClick(wireGeometry: WireGeometry): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // Internal wire click
        }
        // Could emit events or call external callbacks here
    }

    private onDesignConnectionClick(ports: ConnectedPorts, location: DiscreteLocation): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            // Design connection click
        }
        // Could emit events or call external callbacks here
    }

    // =============================================================================
    // STATISTICS AND DEBUG INFO
    // =============================================================================

    public getStatistics(): any {
        return {
            geometry: this.currentGeometry ? {
                name: this.currentGeometry.name,
                dimensions: `${this.currentGeometry.numberOfRows}×${this.currentGeometry.numberOfColumns}`,
                tileCount: this.currentGeometry.numberOfRows * this.currentGeometry.numberOfColumns
            } : null,
            
            design: this.designRenderer.getDesignStatistics(),
            
            rendering: {
                currentLOD: this.cullingLODManager.getCurrentLOD(),
                lodLevel: this.cullingLODManager.getCurrentLODLevel(),
                visibleTiles: this.cullingLODManager.getVisibleTileCount(),
                culledObjects: this.cullingLODManager.getCulledObjectsCount(),
                zoomLevel: this.viewportManager.getZoomLevel()
            }
        };
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    public getCurrentGeometry(): FabricDataShape | null {
        return this.currentGeometry;
    }

    public getCurrentDesign(): DesignData | null {
        return this.currentDesign;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
    // Destroying renderer
        
        // Destroy all managers
        this.viewportManager.destroy();
        this.cullingLODManager.destroy();
        this.tileRenderer.destroy();
        this.designRenderer.destroy();
        
        // Clear state
        this.currentGeometry = null;
        this.currentDesign = null;
        this.tileContainers = [];
        this.onViewportChangeCallback = undefined;
        
    // Destroy complete
    }
}