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
    },
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    children: [],
    visible: true
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

// Mock pixi-viewport
vi.mock('pixi-viewport', () => ({
  Viewport: vi.fn(() => ({
    drag: vi.fn().mockReturnThis(),
    pinch: vi.fn().mockReturnThis(),
    wheel: vi.fn().mockReturnThis(),
    decelerate: vi.fn().mockReturnThis(),
    addChild: vi.fn(),
    removeChild: vi.fn(),
    removeChildren: vi.fn(),
    on: vi.fn(),
    scale: { x: 1, y: 1 },
    getVisibleBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    resize: vi.fn(),
    fitWorld: vi.fn(),
    zoomPercent: vi.fn(),
    setZoom: vi.fn(),
    moveCenter: vi.fn(),
    destroy: vi.fn()
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
        belGeometryList: [],
        wireGeometryList: [],
        lowLodWiresGeoms: [],
        lowLodOverlays: []
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
    it('should create renderer with application and viewport', () => {
      expect(renderer).toBeDefined();
      expect(mockApp.stage.addChild).toHaveBeenCalled(); // Viewport added to stage
    });
  });

  describe('loadFabric', () => {
    it('should load fabric geometry successfully', () => {
      const geometry = createMockFabricGeometry();
      
      expect(() => {
        renderer.loadFabric(geometry);
      }).not.toThrow();
    });

    it('should provide zoom control methods', () => {
      expect(typeof renderer.zoomIn).toBe('function');
      expect(typeof renderer.zoomOut).toBe('function');
      expect(typeof renderer.zoomToFit).toBe('function');
      expect(typeof renderer.zoomReset).toBe('function');
      expect(typeof renderer.getZoomLevel).toBe('function');
    });

    it('should provide viewport control methods', () => {
      expect(typeof renderer.panTo).toBe('function');
      expect(typeof renderer.getViewportBounds).toBe('function');
    });
  });

  describe('enhanced features', () => {
    it('should have viewport change callback support', () => {
      const callback = vi.fn();
      expect(() => {
        renderer.setViewportChangeCallback(callback);
      }).not.toThrow();
    });

    it('should provide design loading capabilities', () => {
      expect(typeof renderer.loadDesign).toBe('function');
      expect(typeof renderer.clearDesign).toBe('function');
    });
  });

  describe('cleanup', () => {
    it('should destroy renderer cleanly', () => {
      expect(() => {
        renderer.destroy();
      }).not.toThrow();
    });
  });
});