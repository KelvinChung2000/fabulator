import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewportCullingLODManager } from '../src/webview/ui/src/fabric/ViewportCullingLODManager';
import { LodLevel, LOD_HYSTERESIS_PCT, LOD_THRESHOLDS } from '../src/webview/ui/src/fabric/FabricConstants';

// Minimal mocks
const MockContainer = vi.fn(() => ({ addChild: vi.fn(), children: [], visible: true }));
const MockGraphics = vi.fn(() => ({ moveTo: vi.fn().mockReturnThis(), lineTo: vi.fn().mockReturnThis(), stroke: vi.fn(), eventMode: '', cursor: '', userData: {} }));
const MockViewport = vi.fn(() => ({ scale: { x: 1, y: 1 }, getVisibleBounds: vi.fn(() => ({ x:0,y:0,width:1000,height:1000 })) }));

vi.mock('pixi.js', () => ({ Container: MockContainer, Graphics: MockGraphics }));
vi.mock('pixi-viewport', () => ({ Viewport: MockViewport }));

function makeGeometry() {
  return {
    name: 'G', numberOfRows: 1, numberOfColumns: 1, width: 10, height: 10, numberOfLines: 0,
    tileNames: [['T']], tileLocations: [[{ x:0, y:0 }]],
    tileGeomMap: { 'T': { name:'T', width:10, height:10, belGeometryList:[], wireGeometryList:[], lowLodWiresGeoms:[], lowLodOverlays:[] } }
  } as any;
}

describe('ViewportCullingLODManager hysteresis', () => {
  let viewport: any; let mgr: ViewportCullingLODManager;
  beforeEach(() => {
    viewport = new MockViewport();
    mgr = new ViewportCullingLODManager(viewport);
    mgr.initializeForGeometry(makeGeometry(), [[new MockContainer()]]);
  });

  it('stays in LOW within hysteresis band when oscillating', () => {
    viewport.scale.x = LOD_THRESHOLDS.LOW_TO_MEDIUM * (1 + LOD_HYSTERESIS_PCT * 0.5); // inside band
    mgr.updateLOD();
    expect(mgr.getCurrentLODLevel()).toBe(LodLevel.LOW);
  });

  it('promotes to MEDIUM after exceeding upper band', () => {
    viewport.scale.x = LOD_THRESHOLDS.LOW_TO_MEDIUM * (1 + LOD_HYSTERESIS_PCT * 1.5);
    mgr.updateLOD();
    expect(mgr.getCurrentLODLevel()).toBe(LodLevel.MEDIUM);
  });
});
