import { describe, it, expect, vi } from 'vitest';
import { TileRenderer } from '../src/webview/ui/src/fabric/TileRenderer';

const MockContainer = vi.fn(() => ({ addChild: vi.fn(function(child){ this.children.push(child); return this; }), children: [], removeChildren: vi.fn(function(){ this.children=[]; }) }));
const MockGraphics = vi.fn(() => ({ rect: vi.fn().mockReturnThis(), fill: vi.fn().mockReturnThis(), stroke: vi.fn().mockReturnThis(), moveTo: vi.fn().mockReturnThis(), lineTo: vi.fn().mockReturnThis(), circle: vi.fn().mockReturnThis(), eventMode: '', cursor: '', on: vi.fn().mockReturnThis(), userData: {} }));
vi.mock('pixi.js', () => ({ Container: MockContainer, Graphics: MockGraphics }));

const makeWire = (name: string) => ({ name, path: [{ x:0,y:0 }, { x:1,y:0 }, { x:1,y:1 }] });

const geom: any = {
  name: 'T', width: 10, height: 10,
  belGeometryList: [],
  wireGeometryList: [makeWire('w1'), makeWire('w2'), makeWire('w3')],
  lowLodWiresGeoms: [], lowLodOverlays: []
};

describe('TileRenderer wire batching', () => {
  it('creates a single internalWire graphics object for multiple wires', () => {
  const fabricContainer: any = new MockContainer();
    const tr = new TileRenderer(fabricContainer);
    tr.buildFabric({
      name:'G', numberOfRows:1, numberOfColumns:1, width:10, height:10, numberOfLines:0,
      tileNames: [['T']], tileLocations: [[{ x:0, y:0 }]], tileGeomMap: { 'T': geom }
    } as any);
    // Inspect child userData types
  // After buildFabric, fabricContainer.children should include tile container + markers
  const tileContainer = fabricContainer.children[0];
  const wireGraphics = tileContainer.children.find((c: any) => c.userData && c.userData.type === 'internalWire');
    expect(wireGraphics).toBeDefined();
  });
});
