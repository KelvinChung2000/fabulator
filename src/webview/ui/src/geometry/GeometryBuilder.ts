import { FabricData, RawSerializedFabricMinimal, UpstreamFabricJSON, UpstreamBel, UpstreamPort, UpstreamTileDefinition } from "../types/FabricData";
import { TileGeometry, BelGeometry, SwitchMatrixGeometry, IO, Side, WireGeometry, LowLodWiresGeometry, PortGeometry, SwitchMatrixWireGeometry } from "../types/geometry";

// Base sizing constants (dynamic growth will be applied per tile)
const TILE_BASE_WIDTH = 120;
const TILE_BASE_HEIGHT = 120;
const SM_BASE_WIDTH = 80;
const SM_BASE_HEIGHT = 80;
const SM_MARGIN_X = 20;
const SM_MARGIN_Y = 20;
const BEL_BASE_WIDTH = 40;
const BEL_BASE_HEIGHT = 12;
const BEL_V_SPACING = 3;
const BEL_PIN_HEIGHT_FACTOR = 2; // px per pin beyond baseline
const BEL_PIN_WIDTH_FACTOR = 3;  // px per pin beyond baseline
const TILE_SIDE_MARGIN = 8;
const TILE_INTERNAL_GAP = 10;

export class GeometryBuilder {
  static build(raw: RawSerializedFabricMinimal | UpstreamFabricJSON): FabricData {
    // Detect format and delegate to appropriate parser
    if (this.isUpstreamFormat(raw)) {
      return this.buildFromUpstream(raw as UpstreamFabricJSON);
    } else {
      return this.buildFromLegacy(raw as RawSerializedFabricMinimal);
    }
  }

  private static isUpstreamFormat(raw: any): boolean {
    // Upstream format has detailed tileDict with bels array
    return raw.tileDict && 
           Object.values(raw.tileDict).some((tile: any) => 
             tile && Array.isArray(tile.bels)
           );
  }

  private static buildFromUpstream(raw: UpstreamFabricJSON): FabricData {
    console.log('GeometryBuilder.buildFromUpstream called with:', {
      hasName: !!raw.name,
      hasWidth: !!raw.width,
      hasHeight: !!raw.height,
      hasTiles: !!raw.tiles,
      hasTileDict: !!raw.tileDict,
      hasWireDict: !!raw.wireDict,
      tileTypes: Object.keys(raw.tileDict || {})
    });
    
    if (!raw.width || !raw.height) {
      throw new Error(`Missing required properties: width=${raw.width}, height=${raw.height}`);
    }
    
    const tileGeomMap: { [k: string]: TileGeometry } = {};
    let maxTileWidth = TILE_BASE_WIDTH;
    let maxTileHeight = TILE_BASE_HEIGHT;

    // Process each tile type from upstream tileDict
    for (const [tileType, tileDef] of Object.entries(raw.tileDict || {})) {
      console.log(`Processing tile type: ${tileType} with ${tileDef.bels.length} BELs`);
      
      const tileGeometry = this.createTileGeometryFromUpstream(tileType, tileDef);
      
      maxTileWidth = Math.max(maxTileWidth, tileGeometry.width);
      maxTileHeight = Math.max(maxTileHeight, tileGeometry.height);
      
      tileGeomMap[tileType] = tileGeometry;
    }

    // Generate tile locations using uniform grid
    const tileLocations: ({ x: number; y: number } | null)[][] = [];
    for (let r = 0; r < raw.height; r++) {
      const row: ({ x: number; y: number } | null)[] = [];
      for (let c = 0; c < raw.width; c++) {
        const tName = raw.tiles[r][c];
        if (tName) {
          // Handle multi-tile entities using _subTileToTile mapping
          let geom = tileGeomMap[tName];
          if (!geom && raw._subTileToTile && raw._subTileToTile[tName]) {
            const baseTileName = raw._subTileToTile[tName];
            geom = tileGeomMap[baseTileName];
            if (geom) {
              console.log(`Using base tile geometry '${baseTileName}' for sub-tile '${tName}'`);
            }
          }
          
          if (!geom) {
            console.warn(`Missing geometry for tile type: ${tName}`);
            row.push({ x: c * maxTileWidth, y: r * maxTileHeight });
          } else {
            const offsetX = (maxTileWidth - geom.width) / 2;
            const offsetY = (maxTileHeight - geom.height) / 2;
            row.push({ x: c * maxTileWidth + offsetX, y: r * maxTileHeight + offsetY });
          }
        } else {
          row.push(null);
        }
      }
      tileLocations.push(row);
    }

    return new (FabricData as any)({
      name: raw.name,
      numberOfRows: raw.height,
      numberOfColumns: raw.width,
      width: raw.width * maxTileWidth,
      height: raw.height * maxTileHeight,
      numberOfLines: this.calculateWireCount(raw.wireDict),
      tiles: raw.tiles,
      tileNames: raw.tiles,
      tileDict: raw.tileDict,
      wireDict: raw.wireDict,
      _subTileToTile: raw._subTileToTile,
      tileGeomMap,
      tileLocations,
      meta: raw,
      tilePixelWidth: maxTileWidth,
      tilePixelHeight: maxTileHeight
    });
  }

  private static calculateWireCount(wireDict: Record<string, any>): number {
    let count = 0;
    for (const [_key, wires] of Object.entries(wireDict || {})) {
      if (Array.isArray(wires)) {
        count += wires.length;
      }
    }
    return count;
  }

  private static createTileGeometryFromUpstream(tileType: string, tileDef: UpstreamTileDefinition): TileGeometry {
    // Create BEL geometries from upstream BEL data
    const belGeometryList: BelGeometry[] = [];
    
    for (let i = 0; i < tileDef.bels.length; i++) {
      const upstreamBel = tileDef.bels[i];
      const belGeom = this.createBelGeometryFromUpstream(upstreamBel, i, tileType);
      belGeometryList.push(belGeom);
    }

    // Create switch matrix geometry
    const smGeometry = this.createSwitchMatrixFromUpstream(tileType, tileDef, belGeometryList);

    // Generate internal tile wires (connecting BELs to switch matrix)
    const wireGeometryList = this.generateInternalWires(belGeometryList, smGeometry);

    // Generate low LOD representations
    const lowLodWiresGeoms = this.generateLowLodGeometry(belGeometryList, smGeometry);

    // Calculate tile dimensions based on contents
    const tileDimensions = this.calculateTileDimensions(tileType, belGeometryList, smGeometry);

    return {
      name: tileType,
      width: tileDimensions.width,
      height: tileDimensions.height,
      smGeometry,
      belGeometryList,
      wireGeometryList,
      lowLodWiresGeoms,
      lowLodOverlays: []
    };
  }

  private static createBelGeometryFromUpstream(upstreamBel: UpstreamBel, belIndex: number, tileType: string): BelGeometry {
    // Calculate BEL position based on type and index
    const layout = this.getTileLayout(tileType);
    const position = this.calculateBelPosition(belIndex, layout);
    const size = this.calculateBelSize(upstreamBel, layout);

    // Create port geometries for the BEL
    const portGeometryList: PortGeometry[] = [];
    
    // Add input ports (left side)
    upstreamBel.inputs.forEach((port, idx) => {
      portGeometryList.push({
        name: port.name,
        relX: 0,
        relY: (idx + 1) * (size.height / (upstreamBel.inputs.length + 1)),
        io: IO.INPUT,
        side: Side.WEST
      });
    });

    // Add output ports (right side)
    upstreamBel.outputs.forEach((port, idx) => {
      portGeometryList.push({
        name: port.name,
        relX: size.width,
        relY: (idx + 1) * (size.height / (upstreamBel.outputs.length + 1)),
        io: IO.OUTPUT,
        side: Side.EAST
      });
    });

    return {
      name: upstreamBel.name,
      relX: position.x,
      relY: position.y,
      width: size.width,
      height: size.height,
      src: upstreamBel.src,
      portGeometryList
    };
  }

  private static createSwitchMatrixFromUpstream(
    tileType: string, 
    tileDef: UpstreamTileDefinition, 
    belGeometryList: BelGeometry[]
  ): SwitchMatrixGeometry {
    
    const smGeometry: SwitchMatrixGeometry = {
      name: `${tileType}_SM`,
      relX: SM_MARGIN_X,
      relY: SM_MARGIN_Y,
      width: SM_BASE_WIDTH,
      height: SM_BASE_HEIGHT,
      portGeometryList: [],
      jumpPortGeometryList: [],
      switchMatrixWires: []
    };

    // Generate switch matrix ports based on tile ports and BEL connections
    const smPorts: PortGeometry[] = [];
    
    // Add tile-level ports from upstream data
    for (const [portGroupName, ports] of Object.entries(tileDef.ports || {})) {
      ports.forEach((port, idx) => {
        const side = this.sideFromString(port.sideOfTile || "NORTH");
        const position = this.calculatePortPosition(side, idx, ports.length, smGeometry);
        
        smPorts.push({
          name: port.name,
          relX: position.x,
          relY: position.y,
          io: port.ioDirection === "input" ? IO.INPUT : IO.OUTPUT,
          side: side
        });
      });
    }

    // Add BEL connection ports
    belGeometryList.forEach((bel, belIdx) => {
      const baseY = SM_MARGIN_Y + 8 + (belIdx * (BEL_BASE_HEIGHT + BEL_V_SPACING));
      
      // Input connection
      smPorts.push({
        name: `${bel.name}_SM_IN`,
        relX: 4,
        relY: baseY,
        io: IO.INPUT,
        side: Side.WEST
      });

      // Output connection  
      smPorts.push({
        name: `${bel.name}_SM_OUT`,
        relX: smGeometry.width - 4,
        relY: baseY,
        io: IO.OUTPUT,
        side: Side.EAST
      });
    });

    smGeometry.portGeometryList = smPorts;

    // Generate switch matrix internal wires
    smGeometry.switchMatrixWires = this.generateSwitchMatrixWires(smGeometry);

    return smGeometry;
  }

  private static sideFromString(sideStr: string): Side {
    switch (sideStr.toUpperCase()) {
      case "NORTH": return Side.NORTH;
      case "SOUTH": return Side.SOUTH;
      case "EAST": return Side.EAST;
      case "WEST": return Side.WEST;
      default: return Side.NORTH;
    }
  }

  private static calculatePortPosition(side: Side, index: number, total: number, smGeom: SwitchMatrixGeometry) {
    const spacing = side === Side.NORTH || side === Side.SOUTH 
      ? smGeom.width / (total + 1) 
      : smGeom.height / (total + 1);
    
    switch (side) {
      case Side.NORTH:
        return { x: (index + 1) * spacing, y: 0 };
      case Side.SOUTH:
        return { x: (index + 1) * spacing, y: smGeom.height };
      case Side.EAST:
        return { x: smGeom.width, y: (index + 1) * spacing };
      case Side.WEST:
        return { x: 0, y: (index + 1) * spacing };
      default:
        return { x: 0, y: 0 };
    }
  }

  private static getTileLayout(tileType: string) {
    if (tileType.startsWith('E_Mem')) {
      return {
        type: 'memory',
        belStartX: SM_MARGIN_X + SM_BASE_WIDTH + 15,
        belStartY: SM_MARGIN_Y + 5,
        belSpacingY: BEL_V_SPACING + 2,
        belWidth: BEL_BASE_WIDTH + 10,
        belHeight: BEL_BASE_HEIGHT + 4
      };
    } else if (tileType.includes('IO')) {
      return {
        type: 'io',
        belStartX: SM_MARGIN_X + SM_BASE_WIDTH + 8,
        belStartY: SM_MARGIN_Y + 2,
        belSpacingY: BEL_V_SPACING,
        belWidth: BEL_BASE_WIDTH - 5,
        belHeight: BEL_BASE_HEIGHT
      };
    } else {
      return {
        type: 'pe',
        belStartX: SM_MARGIN_X + SM_BASE_WIDTH + TILE_INTERNAL_GAP,
        belStartY: SM_MARGIN_Y,
        belSpacingY: BEL_V_SPACING,
        belWidth: BEL_BASE_WIDTH,
        belHeight: BEL_BASE_HEIGHT
      };
    }
  }

  private static calculateBelPosition(belIndex: number, layout: any) {
    return {
      x: layout.belStartX,
      y: layout.belStartY + (belIndex * (layout.belHeight + layout.belSpacingY))
    };
  }

  private static calculateBelSize(belData: UpstreamBel, layout: any) {
    let width = layout.belWidth;
    let height = layout.belHeight;

    const portCount = belData.inputs.length + belData.outputs.length;
    if (portCount > 4) {
      height += Math.ceil((portCount - 4) / 2) * BEL_PIN_HEIGHT_FACTOR;
      width += Math.min(portCount * BEL_PIN_WIDTH_FACTOR, 15);
    }

    return { width, height };
  }

  private static calculateTileDimensions(
    tileType: string, 
    belGeometryList: BelGeometry[], 
    smGeometry: SwitchMatrixGeometry
  ) {
    const belCount = belGeometryList.length;
    
    if (belCount === 0) {
      return {
        width: Math.max(TILE_BASE_WIDTH, SM_MARGIN_X + smGeometry.width + SM_MARGIN_X),
        height: Math.max(TILE_BASE_HEIGHT, SM_MARGIN_Y + smGeometry.height + SM_MARGIN_Y)
      };
    }

    const rightmostBel = belGeometryList.reduce((max, bel) => 
      Math.max(max, bel.relX + bel.width), 0);
    const requiredWidth = rightmostBel + TILE_SIDE_MARGIN;

    const bottommostBel = belGeometryList.reduce((max, bel) => 
      Math.max(max, bel.relY + bel.height), 0);
    const requiredHeight = Math.max(
      bottommostBel + SM_MARGIN_Y,
      SM_MARGIN_Y + smGeometry.height + SM_MARGIN_Y
    );

    if (tileType.startsWith('E_Mem')) {
      return {
        width: Math.max(TILE_BASE_WIDTH + 40, requiredWidth),
        height: Math.max(TILE_BASE_HEIGHT + 20, requiredHeight)
      };
    } else if (tileType.includes('IO')) {
      return {
        width: Math.max(TILE_BASE_WIDTH - 10, requiredWidth),
        height: Math.max(TILE_BASE_HEIGHT, requiredHeight)
      };
    } else {
      return {
        width: Math.max(TILE_BASE_WIDTH, requiredWidth),
        height: Math.max(TILE_BASE_HEIGHT, requiredHeight)
      };
    }
  }

  private static generateInternalWires(
    belGeometryList: BelGeometry[], 
    smGeometry: SwitchMatrixGeometry
  ): WireGeometry[] {
    const wires: WireGeometry[] = [];
    
    belGeometryList.forEach(bel => {
      const inPort = bel.portGeometryList.find(p => p.io === IO.INPUT);
      const outPort = bel.portGeometryList.find(p => p.io === IO.OUTPUT);
      
      const smInPort = smGeometry.portGeometryList.find(p => p.name === `${bel.name}_SM_IN`);
      const smOutPort = smGeometry.portGeometryList.find(p => p.name === `${bel.name}_SM_OUT`);
      
      if (outPort && smOutPort) {
        wires.push({
          name: `${bel.name}_OUT_wire`,
          path: this.manhattanPath(
            { x: bel.relX + outPort.relX, y: bel.relY + outPort.relY },
            { x: SM_MARGIN_X + smOutPort.relX, y: SM_MARGIN_Y + smOutPort.relY }
          )
        });
      }
      
      if (inPort && smInPort) {
        wires.push({
          name: `${bel.name}_IN_wire`,
          path: this.manhattanPath(
            { x: SM_MARGIN_X + smInPort.relX, y: SM_MARGIN_Y + smInPort.relY },
            { x: bel.relX + inPort.relX, y: bel.relY + inPort.relY }
          )
        });
      }
    });
    
    return wires;
  }

  private static generateSwitchMatrixWires(sm: SwitchMatrixGeometry): SwitchMatrixWireGeometry[] {
    const wires: SwitchMatrixWireGeometry[] = [];
    const left = sm.portGeometryList.filter(p => p.side === Side.WEST);
    const right = sm.portGeometryList.filter(p => p.side === Side.EAST);
    const top = sm.portGeometryList.filter(p => p.side === Side.NORTH);
    const bottom = sm.portGeometryList.filter(p => p.side === Side.SOUTH);
    
    // Horizontal connections
    const pairCount = Math.min(3, left.length, right.length);
    for (let i = 0; i < pairCount; i++) {
      const l = left[i];
      const r = right[i];
      wires.push({ 
        name: `${l.name}->${r.name}`, 
        sourcePort: l.name, 
        destPort: r.name, 
        path: [] 
      });
    }
    
    // Vertical connections
    const verticalPairs = Math.min(2, top.length, bottom.length);
    for (let i = 0; i < verticalPairs; i++) {
      const t = top[i];
      const b = bottom[i];
      wires.push({ 
        name: `${t.name}->${b.name}`, 
        sourcePort: t.name, 
        destPort: b.name, 
        path: [] 
      });
    }
    
    return wires;
  }

  private static generateLowLodGeometry(
    belGeometryList: BelGeometry[], 
    smGeometry: SwitchMatrixGeometry
  ): LowLodWiresGeometry[] {
    const lowLod: LowLodWiresGeometry[] = [];
    
    // BEL stack representation
    if (belGeometryList.length > 0) {
      const top = belGeometryList[0].relY;
      const bottom = belGeometryList[belGeometryList.length - 1].relY + 
                    belGeometryList[belGeometryList.length - 1].height;
      const belStackX = belGeometryList[0].relX;
      const maxBelWidth = belGeometryList.reduce((max, bel) => Math.max(max, bel.width), 0);
      
      lowLod.push({ 
        relX: belStackX - 2, 
        relY: top, 
        width: maxBelWidth + 4, 
        height: bottom - top 
      });
    }
    
    // Switch matrix representation
    lowLod.push({ 
      relX: SM_MARGIN_X, 
      relY: SM_MARGIN_Y, 
      width: smGeometry.width, 
      height: smGeometry.height 
    });
    
    return lowLod;
  }

  private static manhattanPath(a: {x: number, y: number}, b: {x: number, y: number}): {x: number, y: number}[] {
    if (a.x === b.x || a.y === b.y) { 
      return [a, b]; 
    }
    
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    
    if (dx < dy) {
      return [a, { x: a.x, y: b.y }, b];
    } else {
      return [a, { x: b.x, y: a.y }, b];
    }
  }

  // Legacy format support (keeping existing implementation)
  private static buildFromLegacy(raw: RawSerializedFabricMinimal): FabricData {
    // Keep existing legacy implementation for backward compatibility
    console.log('Using legacy format builder');
    
    if (!raw.width || !raw.height) {
      throw new Error(`Missing required properties: width=${raw.width}, height=${raw.height}`);
    }
    
    // Simple fallback implementation
    return new (FabricData as any)({
      name: raw.name,
      numberOfRows: raw.height,
      numberOfColumns: raw.width,
      width: raw.width * TILE_BASE_WIDTH,
      height: raw.height * TILE_BASE_HEIGHT,
      numberOfLines: 0,
      tiles: raw.tiles,
      tileNames: raw.tiles,
      tileDict: raw.tileDict,
      wireDict: raw.wireDict,
      _subTileToTile: raw._subTileToTile,
      tileGeomMap: {},
      tileLocations: [],
      meta: raw,
      tilePixelWidth: TILE_BASE_WIDTH,
      tilePixelHeight: TILE_BASE_HEIGHT
    });
  }
}

export function buildGeometry(raw: RawSerializedFabricMinimal | UpstreamFabricJSON): FabricData { 
  return GeometryBuilder.build(raw); 
}