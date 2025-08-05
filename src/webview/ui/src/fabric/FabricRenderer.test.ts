import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FabricRenderer } from './FabricRenderer';
import { FabricGeometry, TileGeometry, Location } from '../types/geometry';

// Mock Pixi.js
vi.mock('pixi.js', () => ({
  Application: vi.fn(() => ({
    stage: {
      addChild: vi.fn(),
      removeChild: vi.fn()
    },
    screen: {
      width: 800,
      height: 600
    }
  })),
  Container: vi.fn(() => ({
    addChild: vi.fn(),
    removeChild: vi.fn(),
    removeChildren: vi.fn(),
    destroy: vi.fn(),
    x: 0,
    y: 0,
    scale: {
      set: vi.fn()
    }
  })),
  Graphics: vi.fn(() => ({
    rect: vi.fn().mockReturnThis(),
    circle: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    eventMode: '',
    cursor: '',
    x: 0,
    y: 0
  }))
}));

describe('FabricRenderer', () => {
  let mockApp: any;
  let renderer: FabricRenderer;

  const createMockFabricGeometry = (): FabricGeometry => ({
    name: 'TestFabric',
    numberOfRows: 2,
    numberOfColumns: 2,
    width: 200,
    height: 200,
    numberOfLines: 4,
    tileNames: [
      ['CLB', 'IO'],
      ['DSP', 'CLB']
    ],
    tileLocations: [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 0, y: 100 }, { x: 100, y: 100 }]
    ],
    tileGeomMap: {
      'CLB': {
        name: 'CLB',
        width: 100,
        height: 100,
        belGeometryList: [
          {
            name: 'LUT',
            relX: 20,
            relY: 20,
            width: 60,
            height: 60,
            portGeometryList: []
          }
        ],
        wireGeometryList: [
          {
            name: 'wire1',
            path: [
              { x: 10, y: 10 },
              { x: 90, y: 90 }
            ]
          }
        ],
        lowLodWiresGeoms: [
          {
            relX: 0,
            relY: 0,
            width: 50,
            height: 50
          }
        ],
        lowLodOverlays: [
          {
            relX: 25,
            relY: 25,
            width: 25,
            height: 25
          }
        ],
        smGeometry: {
          name: 'SM_CLB',
          relX: 10,
          relY: 10,
          width: 80,
          height: 80,
          portGeometryList: [
            {
              name: 'N1',
              relX: 40,
              relY: 0
            }
          ],
          jumpPortGeometryList: []
        }
      },
      'IO': {
        name: 'IO',
        width: 100,
        height: 100,
        belGeometryList: [],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
      },
      'DSP': {
        name: 'DSP',
        width: 100,
        height: 200,
        belGeometryList: [],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
      }
    }
  });

  beforeEach(() => {
    mockApp = {
      stage: {
        addChild: vi.fn(),
        removeChild: vi.fn()
      },
      screen: {
        width: 800,
        height: 600
      }
    };
    
    renderer = new FabricRenderer(mockApp);
  });

  describe('initialization', () => {
    it('should create renderer with application', () => {
      expect(renderer).toBeDefined();
      expect(mockApp.stage.addChild).toHaveBeenCalled();
    });
  });

  describe('loadFabric', () => {
    it('should load fabric geometry successfully', () => {
      const geometry = createMockFabricGeometry();
      
      // Mock the clearFabric and buildFabric methods
      const clearSpy = vi.spyOn(renderer as any, 'clearFabric').mockImplementation(() => {});
      const buildSpy = vi.spyOn(renderer as any, 'buildFabric').mockImplementation(() => {});
      const centerSpy = vi.spyOn(renderer as any, 'centerFabric').mockImplementation(() => {});
      
      renderer.loadFabric(geometry);
      
      expect(clearSpy).toHaveBeenCalled();
      expect(buildSpy).toHaveBeenCalled();
      expect(centerSpy).toHaveBeenCalled();
    });

    it('should store current geometry', () => {
      const geometry = createMockFabricGeometry();
      renderer.loadFabric(geometry);
      
      expect((renderer as any).currentGeometry).toBe(geometry);
    });
  });

  describe('color generation', () => {
    it('should generate consistent colors for tile names', () => {
      const color1 = (renderer as any).getTileColor('CLB');
      const color2 = (renderer as any).getTileColor('CLB');
      const color3 = (renderer as any).getTileColor('DSP');
      
      expect(color1).toBe(color2); // Same name should produce same color
      expect(color1).not.toBe(color3); // Different names should produce different colors
      expect(typeof color1).toBe('number');
      expect(color1).toBeGreaterThanOrEqual(0);
    });

    it('should generate appropriate port colors', () => {
      const inputPort = { io: 'I' };
      const outputPort = { io: 'O' };
      const unknownPort = { io: 'X' };
      
      const inputColor = (renderer as any).getPortColor(inputPort);
      const outputColor = (renderer as any).getPortColor(outputPort);
      const unknownColor = (renderer as any).getPortColor(unknownPort);
      
      expect(inputColor).toBe(0x4CAF50); // Green
      expect(outputColor).toBe(0xF44336); // Red
      expect(unknownColor).toBe(0xFFEB3B); // Yellow
    });
  });

  describe('HSL to Hex conversion', () => {
    it('should convert HSL values to hex colors', () => {
      const hex = (renderer as any).hslToHex(0, 100, 50); // Red
      expect(typeof hex).toBe('number');
      expect(hex).toBeGreaterThanOrEqual(0);
    });

    it('should handle edge cases', () => {
      const black = (renderer as any).hslToHex(0, 0, 0);
      const white = (renderer as any).hslToHex(0, 0, 100);
      
      expect(black).toBe(0x000000);
      expect(white).toBe(0xFFFFFF);
    });
  });

  describe('fabric centering', () => {
    it('should calculate proper scaling for large fabrics', () => {
      const geometry = createMockFabricGeometry();
      geometry.width = 4000;
      geometry.height = 3000;
      
      renderer.loadFabric(geometry);
      
      // The centerFabric method should be called and should not crash
      expect((renderer as any).currentGeometry).toBe(geometry);
    });

    it('should handle small fabrics', () => {
      const geometry = createMockFabricGeometry();
      geometry.width = 100;
      geometry.height = 100;
      
      renderer.loadFabric(geometry);
      
      expect((renderer as any).currentGeometry).toBe(geometry);
    });
  });

  describe('LOD updates', () => {
    it('should update LOD without errors', () => {
      const geometry = createMockFabricGeometry();
      renderer.loadFabric(geometry);
      
      expect(() => {
        renderer.updateLod(0.5, { x: 0, y: 0, width: 400, height: 300 });
      }).not.toThrow();
    });

    it('should store zoom level and viewport bounds', () => {
      const zoomLevel = 0.75;
      const viewportBounds = { x: 100, y: 50, width: 600, height: 400 };
      
      renderer.updateLod(zoomLevel, viewportBounds);
      
      expect((renderer as any).zoomLevel).toBe(zoomLevel);
      expect((renderer as any).viewportBounds).toEqual(viewportBounds);
    });
  });

  describe('cleanup', () => {
    it('should destroy renderer cleanly', () => {
      const destroySpy = vi.fn();
      (renderer as any).fabricContainer = { destroy: destroySpy };
      
      renderer.destroy();
      
      expect(destroySpy).toHaveBeenCalledWith({ children: true });
    });
  });

  describe('event handling', () => {
    it('should handle tile clicks', () => {
      const geometry = createMockFabricGeometry();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock window.postMessage
      const postMessageSpy = vi.fn();
      Object.defineProperty(window, 'postMessage', { value: postMessageSpy });
      
      renderer.loadFabric(geometry);
      
      // Simulate tile click
      const tileGeometry = geometry.tileGeomMap['CLB'];
      (renderer as any).onTileClick(tileGeometry, 0, 1);
      
      expect(consoleSpy).toHaveBeenCalledWith('Clicked tile: CLB at (0, 1)');
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'tileClick',
        data: { tileName: 'CLB', x: 0, y: 1 }
      }, '*');
      
      consoleSpy.mockRestore();
    });

    it('should handle switch matrix clicks', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const smGeometry = { name: 'TestSM' };
      
      (renderer as any).onSwitchMatrixClick(smGeometry);
      
      expect(consoleSpy).toHaveBeenCalledWith('Clicked switch matrix: TestSM');
      consoleSpy.mockRestore();
    });

    it('should handle BEL clicks', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const belGeometry = { name: 'TestBEL' };
      
      (renderer as any).onBelClick(belGeometry);
      
      expect(consoleSpy).toHaveBeenCalledWith('Clicked BEL: TestBEL');
      consoleSpy.mockRestore();
    });

    it('should handle port clicks', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const port = { name: 'TestPort' };
      
      (renderer as any).onPortClick(port);
      
      expect(consoleSpy).toHaveBeenCalledWith('Clicked port: TestPort');
      consoleSpy.mockRestore();
    });

    it('should handle wire clicks', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const wireGeometry = { name: 'TestWire' };
      
      (renderer as any).onWireClick(wireGeometry);
      
      expect(consoleSpy).toHaveBeenCalledWith('Clicked wire: TestWire');
      consoleSpy.mockRestore();
    });
  });
});

describe('FabricRenderer integration', () => {
  it('should handle complex fabric with multiple tile types', () => {
    const mockApp = {
      stage: { addChild: vi.fn() },
      screen: { width: 1200, height: 800 }
    };
    
    const renderer = new FabricRenderer(mockApp);
    const geometry = createComplexFabricGeometry();
    
    expect(() => {
      renderer.loadFabric(geometry);
    }).not.toThrow();
  });

  it('should handle fabric with no tiles', () => {
    const mockApp = {
      stage: { addChild: vi.fn() },
      screen: { width: 800, height: 600 }
    };
    
    const renderer = new FabricRenderer(mockApp);
    const geometry: FabricGeometry = {
      name: 'EmptyFabric',
      numberOfRows: 0,
      numberOfColumns: 0,
      width: 0,
      height: 0,
      numberOfLines: 0,
      tileNames: [],
      tileLocations: [],
      tileGeomMap: {}
    };
    
    expect(() => {
      renderer.loadFabric(geometry);
    }).not.toThrow();
  });
});

function createComplexFabricGeometry(): FabricGeometry {
  return {
    name: 'ComplexFabric',
    numberOfRows: 3,
    numberOfColumns: 3,
    width: 300,
    height: 300,
    numberOfLines: 20,
    tileNames: [
      ['IO', 'CLB', 'IO'],
      ['CLB', 'DSP', 'CLB'],
      ['IO', 'CLB', 'IO']
    ],
    tileLocations: [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
      [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 100 }],
      [{ x: 0, y: 200 }, { x: 100, y: 200 }, { x: 200, y: 200 }]
    ],
    tileGeomMap: {
      'CLB': {
        name: 'CLB',
        width: 100,
        height: 100,
        belGeometryList: [
          {
            name: 'LUT4',
            relX: 10,
            relY: 10,
            width: 30,
            height: 30,
            portGeometryList: [
              { name: 'A', relX: 0, relY: 5 },
              { name: 'B', relX: 0, relY: 15 },
              { name: 'O', relX: 30, relY: 10 }
            ]
          },
          {
            name: 'FF',
            relX: 50,
            relY: 10,
            width: 30,
            height: 30,
            portGeometryList: [
              { name: 'D', relX: 0, relY: 10 },
              { name: 'Q', relX: 30, relY: 10 }
            ]
          }
        ],
        wireGeometryList: [
          {
            name: 'internal_wire1',
            path: [{ x: 40, y: 20 }, { x: 50, y: 20 }]
          }
        ],
        lowLodWiresGeoms: [
          { relX: 10, relY: 10, width: 80, height: 80 }
        ],
        lowLodOverlays: [],
        smGeometry: {
          name: 'SM_CLB',
          relX: 5,
          relY: 5,
          width: 90,
          height: 90,
          portGeometryList: [
            { name: 'N1', relX: 45, relY: 0 },
            { name: 'S1', relX: 45, relY: 90 },
            { name: 'E1', relX: 90, relY: 45 },
            { name: 'W1', relX: 0, relY: 45 }
          ],
          jumpPortGeometryList: []
        }
      },
      'IO': {
        name: 'IO',
        width: 100,
        height: 100,
        belGeometryList: [
          {
            name: 'IOB',
            relX: 25,
            relY: 25,
            width: 50,
            height: 50,
            portGeometryList: [
              { name: 'PAD', relX: 25, relY: 0 },
              { name: 'I', relX: 25, relY: 50 }
            ]
          }
        ],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
      },
      'DSP': {
        name: 'DSP',
        width: 100,
        height: 100,
        belGeometryList: [
          {
            name: 'DSP48',
            relX: 10,
            relY: 10,
            width: 80,
            height: 80,
            portGeometryList: [
              { name: 'A', relX: 0, relY: 20 },
              { name: 'B', relX: 0, relY: 40 },
              { name: 'P', relX: 80, relY: 30 }
            ]
          }
        ],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
      }
    }
  };
}