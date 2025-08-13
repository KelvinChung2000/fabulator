import { Application } from 'pixi.js';
import { FabricRenderer } from './FabricRenderer';
import { FabricDataShape } from '../types/FabricData';
import { DesignData } from '../types/design';

// FabricDrawingManager: lifecycle + high-level API; FabricRenderer retains core rendering.
export class FabricDrawingManager {
  private renderer: FabricRenderer;
  private currentFabric?: FabricDataShape;

  constructor(app: Application) {
  this.renderer = new FabricRenderer(app);
  }

  loadFabric(data: FabricDataShape) {
    this.renderer.loadFabric(data);
    this.currentFabric = data;
  }

  loadDesign(design: DesignData) { this.renderer.loadDesign(design); }

  highlightElement(e: any) { this.renderer.highlightElement(e); }
  clearHighlights() { this.renderer.clearAllHighlights(); }

  zoomIn() { this.renderer.zoomIn(); }
  zoomOut() { this.renderer.zoomOut(); }
  zoomToFit() { this.renderer.zoomToFit(); }
  zoomReset() { this.renderer.zoomReset(); }
  panTo(x: number, y: number) { this.renderer.panTo(x, y); }
  panToImmediate(x: number, y: number) { this.renderer.panToImmediate(x, y); }
  getZoomLevel() { return this.renderer.getZoomLevel(); }
  getViewportBounds() { return this.renderer.getViewportBounds(); }
  setViewportChangeCallback(cb: any) { this.renderer.setViewportChangeCallback(cb); }

  destroy() { this.renderer.destroy(); this.currentFabric = undefined; }
}
