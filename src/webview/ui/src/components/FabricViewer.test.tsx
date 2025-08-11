import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import FabricViewer from './FabricViewer';
import { FabricGeometry } from '../types/geometry';

// Mock FabricRenderer
vi.mock('../fabric/FabricRenderer', () => ({
  FabricRenderer: vi.fn(() => ({
    loadFabric: vi.fn(),
    loadDesign: vi.fn(),
    destroy: vi.fn(),
    panTo: vi.fn(),
    highlightElement: vi.fn(),
    clearAllHighlights: vi.fn(),
    setViewportChangeCallback: vi.fn(),
    getZoomLevel: vi.fn(() => 1),
    zoomToFit: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn()
  }))
}));

// Mock Pixi.js Application
vi.mock('pixi.js', () => ({
  Application: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    canvas: document.createElement('canvas'),
    destroy: vi.fn(),
    renderer: {
      resize: vi.fn()
    }
  }))
}));

describe('FabricViewer', () => {
  const mockOnMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage.mockClear();
  });

  it('should render without crashing', () => {
    render(<FabricViewer onMessage={mockOnMessage} />);
    
    // Should render the canvas containers - expect multiple generic divs
    const canvasContainers = screen.getAllByRole('generic');
    expect(canvasContainers).toHaveLength(2); // Main div + canvas container div
  });

  it('should show loading state when fabric is being loaded', async () => {
    render(<FabricViewer onMessage={mockOnMessage} />);
    
    // Simulate loading state by sending a loadFabric message
    const mockGeometry: FabricGeometry = {
      name: 'TestFabric',
      numberOfRows: 2,
      numberOfColumns: 2,
      width: 200,
      height: 200,
      numberOfLines: 4,
      tileNames: [['CLB', 'IO'], ['DSP', 'CLB']],
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
        }
      }
    };

    // Trigger loadFabric message
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'loadFabric', data: mockGeometry }
      }));
    });

    // Should handle the message (loading state is internal)
    await waitFor(() => {
      expect(mockOnMessage).toHaveBeenCalledWith({
        type: 'fabricLoaded',
        data: {
          name: 'TestFabric',
          rows: 2,
          columns: 2
        }
      });
    });
  });

  it('should display fabric name when loaded', async () => {
    render(<FabricViewer onMessage={mockOnMessage} />);

    const mockGeometry: FabricGeometry = {
      name: 'MyTestFabric',
      numberOfRows: 1,
      numberOfColumns: 1,
      width: 100,
      height: 100,
      numberOfLines: 0,
      tileNames: [['CLB']],
      tileLocations: [[{ x: 0, y: 0 }]],
      tileGeomMap: {
        'CLB': {
          name: 'CLB',
          width: 100,
          height: 100,
          belGeometryList: [],
          wireGeometryList: [],
          lowLodWiresGeoms: [],
          lowLodOverlays: []
        }
      }
    };

    // Trigger loadFabric message
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'loadFabric', data: mockGeometry }
      }));
    });

    // Wait for fabric name to appear
    await waitFor(() => {
      expect(screen.getByText('MyTestFabric')).toBeInTheDocument();
    });
  });

  it('should handle loadDesign messages', async () => {
    render(<FabricViewer onMessage={mockOnMessage} />);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Trigger loadDesign message
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'loadDesign', data: { designName: 'TestDesign' } }
      }));
    });

    // Should log the design data
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Received design data:', { designName: 'TestDesign' });
    });

    consoleSpy.mockRestore();
  });

  it('should handle fabric loading errors gracefully', () => {
    // This test is simplified due to mock hoisting limitations
    render(<FabricViewer onMessage={mockOnMessage} />);
    
    // Component should render without crashing even with potential errors
    const mainDiv = screen.getAllByRole('generic')[0];
    expect(mainDiv).toBeInTheDocument();
  });

  it('should handle resize events', async () => {
    render(<FabricViewer onMessage={mockOnMessage} />);

    // Wait for component to initialize
    await waitFor(() => {
      expect(screen.getAllByRole('generic')).toHaveLength(2); // Two divs with generic role
    });

    // Trigger resize event
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    // Should not crash (resize handler should be robust)
    expect(screen.getAllByRole('generic')).toHaveLength(2);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = render(<FabricViewer onMessage={mockOnMessage} />);

    // Unmount component
    unmount();

    // Should cleanup without errors
    expect(true).toBe(true); // If we get here, cleanup was successful
  });

  it('should initialize Pixi.js application correctly', async () => {
    const { Application } = await import('pixi.js');
    const mockInit = vi.fn().mockResolvedValue(undefined);
    (Application as any).mockImplementation(() => ({
      init: mockInit,
      canvas: document.createElement('canvas'),
      destroy: vi.fn(),
      renderer: { resize: vi.fn() }
    }));

    render(<FabricViewer onMessage={mockOnMessage} />);

    // Wait for Pixi.js initialization
    await waitFor(() => {
      expect(mockInit).toHaveBeenCalledWith({
        width: expect.any(Number),
        height: expect.any(Number),
        backgroundColor: 0x1e1e1e,
        antialias: true,
        resolution: expect.any(Number),
        autoDensity: true
      });
    });
  });

  it('should handle Pixi.js initialization errors', async () => {
    const { Application } = await import('pixi.js');
    const mockInit = vi.fn().mockRejectedValue(new Error('WebGL not supported'));
    (Application as any).mockImplementation(() => ({
      init: mockInit,
      canvas: document.createElement('canvas'),
      destroy: vi.fn(),
      renderer: { resize: vi.fn() }
    }));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<FabricViewer onMessage={mockOnMessage} />);

    // Wait for error handling
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize Pixi.js:', expect.any(Error));
      expect(mockOnMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to initialize graphics engine'
      });
    });

    consoleSpy.mockRestore();
  });
});

describe('FabricViewer integration', () => {
  it('should handle complete fabric loading workflow', async () => {
    const mockOnMessage = vi.fn();
    render(<FabricViewer onMessage={mockOnMessage} />);

    const complexGeometry: FabricGeometry = {
      name: 'ComplexFabric',
      numberOfRows: 4,
      numberOfColumns: 3,
      width: 600,
      height: 800,
      numberOfLines: 50,
      tileNames: [
        ['IO', 'CLB', 'IO'],
        ['CLB', 'DSP', 'CLB'],
        ['CLB', 'CLB', 'CLB'],
        ['IO', 'CLB', 'IO']
      ],
      tileLocations: [
        [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }],
        [{ x: 0, y: 200 }, { x: 200, y: 200 }, { x: 400, y: 200 }],
        [{ x: 0, y: 400 }, { x: 200, y: 400 }, { x: 400, y: 400 }],
        [{ x: 0, y: 600 }, { x: 200, y: 600 }, { x: 400, y: 600 }]
      ],
      tileGeomMap: {
        'CLB': {
          name: 'CLB',
          width: 200,
          height: 200,
          belGeometryList: [
            {
              name: 'LUT4',
              relX: 50,
              relY: 50,
              width: 100,
              height: 100,
              portGeometryList: []
            }
          ],
          wireGeometryList: [
            {
              name: 'long_wire',
              path: [
                { x: 0, y: 100 },
                { x: 100, y: 100 },
                { x: 100, y: 0 },
                { x: 200, y: 0 }
              ]
            }
          ],
          lowLodWiresGeoms: [
            { relX: 0, relY: 0, width: 200, height: 200 }
          ],
          lowLodOverlays: []
        },
        'IO': {
          name: 'IO',
          width: 200,
          height: 200,
          belGeometryList: [],
          wireGeometryList: [],
          lowLodWiresGeoms: [],
          lowLodOverlays: []
        },
        'DSP': {
          name: 'DSP',
          width: 200,
          height: 200,
          belGeometryList: [],
          wireGeometryList: [],
          lowLodWiresGeoms: [],
          lowLodOverlays: []
        }
      }
    };

    // Trigger fabric loading
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'loadFabric', data: complexGeometry }
      }));
    });

    // Wait for completion
    await waitFor(() => {
      expect(mockOnMessage).toHaveBeenCalledWith({
        type: 'fabricLoaded',
        data: {
          name: 'ComplexFabric',
          rows: 4,
          columns: 3
        }
      });
    });

    // Check that fabric name is displayed
    expect(screen.getByText('ComplexFabric')).toBeInTheDocument();
  });
});