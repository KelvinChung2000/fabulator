/**
 * ViewportManager.ts
 * 
 * Manages viewport events, controls, and interactions for the fabric renderer.
 * Handles zoom, pan, and viewport change notifications.
 */

import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { 
    VIEWPORT_WORLD_WIDTH, 
    VIEWPORT_WORLD_HEIGHT,
    VIEWPORT_UPDATE_THROTTLE_MS,
    ZOOM_IN_FACTOR,
    ZOOM_OUT_FACTOR,
    ZOOM_RESET_LEVEL,
    ZOOM_ANIMATION_DELAY_MS,
    CENTER_ANIMATION_DELAY_MS,
    DEBUG_CONSTANTS
} from './FabricConstants';

export type ViewportChangeCallback = (bounds: { x: number, y: number, width: number, height: number }, zoom: number) => void;

export class ViewportManager {
    private viewport: Viewport;
    private app: Application;
    private onViewportChangeCallback?: ViewportChangeCallback;
    private viewportUpdateTimeout: number | null = null;

    constructor(app: Application) {
        this.app = app;
        this.viewport = this.createViewport();
        this.setupViewportEvents();
        
        // Add viewport to stage
        this.app.stage.addChild(this.viewport);
    }

    private createViewport(): Viewport {
        const viewport = new Viewport({
            screenWidth: this.app.screen.width,
            screenHeight: this.app.screen.height,
            worldWidth: VIEWPORT_WORLD_WIDTH,
            worldHeight: VIEWPORT_WORLD_HEIGHT,
            events: this.app.renderer.events
        });

        // Enable viewport plugins
        viewport
            .drag({ mouseButtons: 'left' })
            .pinch()
            .wheel()
            .decelerate();

        return viewport;
    }

    private setupViewportEvents(): void {
        // Listen to viewport changes for LOD and culling updates
        this.viewport.on('moved', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport moved event triggered');
            }
            this.scheduleViewportUpdate();
        });

        this.viewport.on('zoomed', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport zoomed event triggered');
            }
            this.scheduleViewportUpdate();
        });

        // Listen to all viewport transformation events
        this.viewport.on('moved-end', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport moved-end event triggered');
            }
            this.scheduleViewportUpdate();
        });

        this.viewport.on('zoomed-end', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport zoomed-end event triggered'); 
            }
            this.scheduleViewportUpdate();
        });

        // Listen to drag events specifically
        this.viewport.on('drag-start', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport drag-start event triggered');
            }
        });

        this.viewport.on('drag-end', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport drag-end event triggered');
            }
            this.scheduleViewportUpdate();
        });

        // Listen to wheel events which might not trigger moved/zoomed
        this.viewport.on('wheel', () => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Viewport wheel event triggered');
            }
            this.scheduleViewportUpdate();
        });

        // Also trigger an immediate update on initialization
        setTimeout(() => {
            this.forceViewportUpdate();
        }, 100);
    }

    private scheduleViewportUpdate(): void {
        if (this.viewportUpdateTimeout) {
            clearTimeout(this.viewportUpdateTimeout);
        }
        this.viewportUpdateTimeout = setTimeout(() => {
            if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
                console.log('Scheduled viewport update executing');
            }
            this.notifyViewportChange();
            this.viewportUpdateTimeout = null;
        }, VIEWPORT_UPDATE_THROTTLE_MS);
    }

    private notifyViewportChange(): void {
        if (this.onViewportChangeCallback) {
            const bounds = this.viewport.getVisibleBounds();
            const zoom = this.viewport.scale.x;
            this.onViewportChangeCallback(
                { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
                zoom
            );
        }
    }

    public setViewportChangeCallback(callback: ViewportChangeCallback): void {
        this.onViewportChangeCallback = callback;
    }

    public forceViewportUpdate(): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log('Force viewport update called');
        }
        this.notifyViewportChange();
    }

    // =============================================================================
    // ZOOM CONTROLS
    // =============================================================================

    public zoomIn(): void {
        setTimeout(() => {
            this.viewport.zoomPercent(ZOOM_IN_FACTOR, true);
            // Force update after zoom animation completes
            setTimeout(() => this.forceViewportUpdate(), ZOOM_ANIMATION_DELAY_MS + 50);
        }, ZOOM_ANIMATION_DELAY_MS);
    }

    public zoomOut(): void {
        setTimeout(() => {
            this.viewport.zoomPercent(ZOOM_OUT_FACTOR, true);
            // Force update after zoom animation completes
            setTimeout(() => this.forceViewportUpdate(), ZOOM_ANIMATION_DELAY_MS + 50);
        }, ZOOM_ANIMATION_DELAY_MS);
    }

    public zoomToFit(): void {
        setTimeout(() => {
            this.viewport.fitWorld();
            // Force update after fit animation completes
            setTimeout(() => this.forceViewportUpdate(), CENTER_ANIMATION_DELAY_MS + 50);
        }, CENTER_ANIMATION_DELAY_MS);
    }

    public zoomReset(): void {
        setTimeout(() => {
            this.viewport.setZoom(ZOOM_RESET_LEVEL, true);
            // Force update after zoom animation completes
            setTimeout(() => this.forceViewportUpdate(), ZOOM_ANIMATION_DELAY_MS + 50);
        }, ZOOM_ANIMATION_DELAY_MS);
    }

    public getZoomLevel(): number {
        return this.viewport.scale.x;
    }

    // =============================================================================
    // VIEWPORT CONTROLS
    // =============================================================================

    public panTo(x: number, y: number): void {
        setTimeout(() => {
            this.viewport.moveCenter(x, y);
            // Force update after pan animation completes
            setTimeout(() => this.forceViewportUpdate(), CENTER_ANIMATION_DELAY_MS + 50);
        }, CENTER_ANIMATION_DELAY_MS);
    }

    public getViewportBounds(): { x: number, y: number, width: number, height: number } {
        const bounds = this.viewport.getVisibleBounds();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    public resize(width: number, height: number): void {
        this.viewport.resize(width, height);
    }

    public centerOnBounds(bounds: { x: number, y: number, width: number, height: number }): void {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        this.panTo(centerX, centerY);
        // Additional force update since panTo already handles it, but ensure callback triggers
        setTimeout(() => this.forceViewportUpdate(), CENTER_ANIMATION_DELAY_MS + 100);
    }

    // =============================================================================
    // VIEWPORT ACCESS
    // =============================================================================

    public getViewport(): Viewport {
        return this.viewport;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        if (this.viewportUpdateTimeout) {
            clearTimeout(this.viewportUpdateTimeout);
            this.viewportUpdateTimeout = null;
        }
        
        this.viewport.destroy();
        this.onViewportChangeCallback = undefined;
    }
}