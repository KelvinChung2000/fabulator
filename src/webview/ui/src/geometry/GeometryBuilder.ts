import { FabricData, RawSerializedFabricMinimal } from "../types/FabricData";
import { TileGeometry, BelGeometry, SwitchMatrixGeometry, IO, Side, WireGeometry, LowLodWiresGeometry, PortGeometry, SwitchMatrixWireGeometry } from "../types/geometry";

// Default sizing constants (initial heuristic; will be replaced with full algorithmic layout ported from Java/Python)
const TILE_DEFAULT_WIDTH = 120;
const TILE_DEFAULT_HEIGHT = 120;
const SM_DEFAULT_WIDTH = 80;
const SM_DEFAULT_HEIGHT = 80;
const SM_MARGIN_X = 20;
const SM_MARGIN_Y = 20;
const BEL_WIDTH = 40;
const BEL_HEIGHT = 12;
const BEL_V_SPACING = 2;

export class GeometryBuilder {
  static build(raw: RawSerializedFabricMinimal): FabricData {
    const tileGeomMap: { [k: string]: TileGeometry } = {};

  for (const [tileType, def] of Object.entries(raw.tileDict || {})) {
      const smGeometry: SwitchMatrixGeometry = {
        name: `${tileType}_SM`,
        relX: SM_MARGIN_X,
        relY: SM_MARGIN_Y,
        width: SM_DEFAULT_WIDTH,
        height: SM_DEFAULT_HEIGHT,
    portGeometryList: [],
    jumpPortGeometryList: [],
    switchMatrixWires: []
      };

      const belGeometryList: BelGeometry[] = [];
      const bels: any[] = Array.isArray((def as any).bels) ? (def as any).bels : [];
      let belY = SM_MARGIN_Y;
      for (let i = 0; i < bels.length; i++) {
        const b = bels[i];
        const belGeom: BelGeometry = {
          name: b && b.name ? String(b.name) : `${tileType}_BEL_${b?.z ?? i}`,
          relX: 8,
          relY: belY,
          width: BEL_WIDTH,
          height: BEL_HEIGHT,
          src: b?.src,
          portGeometryList: []
        };
        belGeometryList.push(belGeom);
        belY += BEL_HEIGHT + BEL_V_SPACING;
      }

      // Synthesize simple BEL ports (IN/OUT) until raw JSON includes explicit port lists
      belGeometryList.forEach(bel => {
        if (!bel.portGeometryList.length) {
          bel.portGeometryList.push(
            { name: `${bel.name}_IN`, relX: 0, relY: bel.height / 2, io: IO.INPUT, side: Side.WEST },
            { name: `${bel.name}_OUT`, relX: bel.width, relY: bel.height / 2, io: IO.OUTPUT, side: Side.EAST }
          );
        }
      });

      // Synthesize switch matrix ports based on BEL ports (aggregate) & tile IO placeholder
      const smPorts: PortGeometry[] = [];
      const leftPorts: PortGeometry[] = []; // WEST (inputs)
      const rightPorts: PortGeometry[] = []; // EAST (outputs)
      const topPorts: PortGeometry[] = []; // NORTH (inout / control)
      const bottomPorts: PortGeometry[] = []; // SOUTH (in)

      belGeometryList.forEach((bel, idx) => {
        bel.portGeometryList.forEach(p => {
          const isOut = p.io === IO.OUTPUT;
          const relY = SM_MARGIN_Y + 8 + (idx * (BEL_HEIGHT + BEL_V_SPACING));
          if (isOut) {
            rightPorts.push({ name: `${bel.name}_${p.name}_SM_OUT`, relX: SM_DEFAULT_WIDTH - 4, relY, side: Side.EAST });
          } else {
            leftPorts.push({ name: `${bel.name}_${p.name}_SM_IN`, relX: 4, relY, side: Side.WEST });
          }
        });
      });
      // Add a few pseudo tile IOs
      for (let i = 0; i < 2; i++) {
        topPorts.push({ name: `${tileType}_CTRL_${i}`, relX: (SM_DEFAULT_WIDTH / 3) * (i + 1), relY: -4, side: Side.NORTH });
        bottomPorts.push({ name: `${tileType}_DATA_${i}`, relX: (SM_DEFAULT_WIDTH / 3) * (i + 1), relY: SM_DEFAULT_HEIGHT + 4, side: Side.SOUTH });
      }
  const distributeVertical = (ports: PortGeometry[], x: number) => {
  if (!ports.length) { return; }
        const gap = (SM_DEFAULT_HEIGHT - 8) / (ports.length + 1);
        ports.sort((a,b)=>a.name.localeCompare(b.name));
        ports.forEach((p,i)=>{ p.relX = x; p.relY = 8 + gap * (i+1); });
      };
      distributeVertical(leftPorts, 4);
      distributeVertical(rightPorts, SM_DEFAULT_WIDTH - 4);
      // Horizontal distribution for top/bottom already set
      smPorts.push(...topPorts, ...rightPorts, ...bottomPorts, ...leftPorts);
      smGeometry.portGeometryList = smPorts;

      // Generate switch matrix wires with Manhattan heuristic (pair some left->right, top->bottom, cross)
      smGeometry.switchMatrixWires = GeometryBuilder.generateSwitchMatrixWires(smGeometry);

      // Internal tile wires: connect each BEL OUT to first SM right port and each BEL IN to first SM left port
      const internalWires: WireGeometry[] = [];
      const leftAnchor = smGeometry.portGeometryList.find(p=>p.side===Side.WEST);
      const rightAnchor = smGeometry.portGeometryList.find(p=>p.side===Side.EAST);
      belGeometryList.forEach(bel => {
        const inPort = bel.portGeometryList.find(p=>p.io===IO.INPUT);
        const outPort = bel.portGeometryList.find(p=>p.io===IO.OUTPUT);
        if (outPort && rightAnchor) {
          internalWires.push({
            name: `${bel.name}_OUT_to_${rightAnchor.name}`,
            path: GeometryBuilder.manhattanPath(
              { x: bel.relX + outPort.relX, y: bel.relY + outPort.relY },
              { x: SM_MARGIN_X + rightAnchor.relX, y: SM_MARGIN_Y + rightAnchor.relY }
            )
          });
        }
        if (inPort && leftAnchor) {
          internalWires.push({
            name: `${leftAnchor.name}_to_${bel.name}_IN`,
            path: GeometryBuilder.manhattanPath(
              { x: SM_MARGIN_X + leftAnchor.relX, y: SM_MARGIN_Y + leftAnchor.relY },
              { x: bel.relX + inPort.relX, y: bel.relY + inPort.relY }
            )
          });
        }
      });

      // Low LOD rectangles: summarize BEL stack and SM area, plus wires band
      const lowLod: LowLodWiresGeometry[] = [];
      if (belGeometryList.length) {
        const top = belGeometryList[0].relY;
        const bottom = belGeometryList[belGeometryList.length-1].relY + BEL_HEIGHT;
        lowLod.push({ relX: 6, relY: top, width: BEL_WIDTH+4, height: bottom-top });
      }
      lowLod.push({ relX: SM_MARGIN_X, relY: SM_MARGIN_Y, width: SM_DEFAULT_WIDTH, height: SM_DEFAULT_HEIGHT });
      if (internalWires.length) {
        lowLod.push({ relX: SM_MARGIN_X - 4, relY: SM_MARGIN_Y - 4, width: SM_DEFAULT_WIDTH + 8, height: SM_DEFAULT_HEIGHT + 8 });
      }

      const width = TILE_DEFAULT_WIDTH;
      const height = Math.max(TILE_DEFAULT_HEIGHT, belY + SM_MARGIN_Y);

      tileGeomMap[tileType] = {
        name: tileType,
        width,
        height,
        smGeometry,
        belGeometryList,
        wireGeometryList: internalWires,
        lowLodWiresGeoms: lowLod,
        lowLodOverlays: []
      };
    }

    // Uniform grid positioning for now
    const tileLocations: ({ x: number; y: number } | null)[][] = [];
    for (let r = 0; r < raw.height; r++) {
      const row: ({ x: number; y: number } | null)[] = [];
      for (let c = 0; c < raw.width; c++) {
        const tName = raw.tiles[r][c];
        row.push(tName ? { x: c * TILE_DEFAULT_WIDTH, y: r * TILE_DEFAULT_HEIGHT } : null);
      }
      tileLocations.push(row);
    }

    return new (FabricData as any)({
      name: raw.name,
      numberOfRows: raw.height,
      numberOfColumns: raw.width,
      width: raw.width * TILE_DEFAULT_WIDTH,
      height: raw.height * TILE_DEFAULT_HEIGHT,
      numberOfLines: 0,
      tiles: raw.tiles,
      tileNames: raw.tiles,
      tileDict: raw.tileDict,
      wireDict: raw.wireDict,
      _subTileToTile: raw._subTileToTile,
      tileGeomMap,
      tileLocations,
      meta: raw,
      tilePixelWidth: TILE_DEFAULT_WIDTH,
      tilePixelHeight: TILE_DEFAULT_HEIGHT
    });
  }

  private static manhattanPath(a: {x:number,y:number}, b: {x:number,y:number}): {x:number,y:number}[] {
  if (a.x === b.x || a.y === b.y) { return [a,b]; }
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx < dy) {
      return [a, { x: a.x, y: b.y }, b];
    } else {
      return [a, { x: b.x, y: a.y }, b];
    }
  }

  private static generateSwitchMatrixWires(sm: SwitchMatrixGeometry): SwitchMatrixWireGeometry[] {
    const wires: SwitchMatrixWireGeometry[] = [];
    const left = sm.portGeometryList.filter(p=>p.side===Side.WEST);
    const right = sm.portGeometryList.filter(p=>p.side===Side.EAST);
    const top = sm.portGeometryList.filter(p=>p.side===Side.NORTH);
    const bottom = sm.portGeometryList.filter(p=>p.side===Side.SOUTH);
    const pairCount = Math.min(3, left.length, right.length);
    for (let i=0;i<pairCount;i++) {
      const l = left[i]; const r = right[i];
      wires.push({ name: `${l.name}->${r.name}`, sourcePort: l.name, destPort: r.name, path: [] });
    }
    const verticalPairs = Math.min(2, top.length, bottom.length);
    for (let i=0;i<verticalPairs;i++) {
      const t = top[i]; const b = bottom[i];
      wires.push({ name: `${t.name}->${b.name}`, sourcePort: t.name, destPort: b.name, path: [] });
    }
    // Cross connections
    if (left.length && bottom.length) {
      wires.push({ name: `${left[0].name}->${bottom[0].name}`, sourcePort: left[0].name, destPort: bottom[0].name, path: [] });
    }
    if (right.length && top.length) {
      wires.push({ name: `${right[0].name}->${top[0].name}`, sourcePort: right[0].name, destPort: top[0].name, path: [] });
    }
    return wires;
  }
}

export function buildGeometry(raw: RawSerializedFabricMinimal): FabricData { return GeometryBuilder.build(raw); }
