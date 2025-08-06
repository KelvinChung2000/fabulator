import React, { useRef, useEffect, useState } from 'react';
import { Application, Graphics, Container } from 'pixi.js';
import { FabricGeometry } from '../types/geometry';
import './WorldView.css';

interface WorldViewProps {
    geometry: FabricGeometry | null;
    viewportBounds: { x: number; y: number; width: number; height: number };
    onViewportClick: (x: number, y: number) => void;
    className?: string;
}

export const WorldView: React.FC<WorldViewProps> = ({
    geometry,
    viewportBounds,
    onViewportClick,
    className = ''
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<Application | null>(null);
    const containerRef = useRef<Container | null>(null);
    const viewportIndicatorRef = useRef<Graphics | null>(null);
    const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({ scale: 1, offsetX: 0, offsetY: 0 });
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize PixiJS app
    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

        const initApp = async () => {
            const app = new Application();
            await app.init({
                canvas: canvasRef.current!,
                width: 200,
                height: 150,
                backgroundColor: 0x1e1e1e,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });

            const container = new Container();
            app.stage.addChild(container);

            appRef.current = app;
            containerRef.current = container;
            setIsInitialized(true);
        };

        initApp();

        return () => {
            if (appRef.current) {
                appRef.current.destroy(true);
                appRef.current = null;
                containerRef.current = null;
                viewportIndicatorRef.current = null;
            }
        };
    }, []);

    // Update fabric overview when geometry changes
    useEffect(() => {
        if (!isInitialized || !geometry || !containerRef.current || !appRef.current) return;

        const container = containerRef.current;
        const app = appRef.current;

        // Clear previous content
        container.removeChildren();

        // Calculate scale to fit fabric in minimap
        const fabricWidth = geometry.width;
        const fabricHeight = geometry.height;
        const mapWidth = app.screen.width - 20; // Leave some padding
        const mapHeight = app.screen.height - 20;

        const scaleX = mapWidth / fabricWidth;
        const scaleY = mapHeight / fabricHeight;
        const scale = Math.min(scaleX, scaleY);

        // Create simplified fabric representation
        const fabricGraphics = new Graphics();

        // Draw fabric boundary
        fabricGraphics.rect(0, 0, fabricWidth, fabricHeight);
        fabricGraphics.stroke({ width: 1, color: 0x555555 });
        fabricGraphics.fill(0x2a2a2a);

        // Draw tiles as simplified rectangles
        const { tileNames, tileLocations, tileGeomMap } = geometry;
        for (let y = 0; y < tileNames.length; y++) {
            for (let x = 0; x < tileNames[y].length; x++) {
                const tileName = tileNames[y][x];
                const tileLocation = tileLocations[y][x];

                if (tileName && tileLocation) {
                    const tileGeometry = tileGeomMap[tileName];
                    if (tileGeometry) {
                        // Simple tile representation
                        fabricGraphics.rect(
                            tileLocation.x,
                            tileLocation.y,
                            tileGeometry.width,
                            tileGeometry.height
                        );
                        fabricGraphics.fill(getTileColor(tileName));
                        fabricGraphics.stroke({ width: 0.5, color: 0x666666 });
                    }
                }
            }
        }

        // Apply scale and center
        fabricGraphics.scale.set(scale);
        fabricGraphics.x = (app.screen.width - fabricWidth * scale) / 2;
        fabricGraphics.y = (app.screen.height - fabricHeight * scale) / 2;

        container.addChild(fabricGraphics);

        // Create viewport indicator
        const viewportIndicator = new Graphics();
        viewportIndicatorRef.current = viewportIndicator;
        container.addChild(viewportIndicator);

        // Store scale and offset for click handling
        transformRef.current = { scale, offsetX: fabricGraphics.x, offsetY: fabricGraphics.y };

    }, [isInitialized, geometry]);

    // Update viewport indicator when viewport bounds change
    useEffect(() => {
        if (!viewportIndicatorRef.current || !containerRef.current || !geometry) return;

        const indicator = viewportIndicatorRef.current;
        const { scale, offsetX, offsetY } = transformRef.current;

        // Clear previous indicator
        indicator.clear();

        // Draw viewport rectangle
        const x = viewportBounds.x * scale + offsetX;
        const y = viewportBounds.y * scale + offsetY;
        const width = viewportBounds.width * scale;
        const height = viewportBounds.height * scale;

        indicator.rect(x, y, width, height);
        indicator.stroke({ width: 2, color: 0x00aaff, alpha: 0.8 });
        indicator.fill({ color: 0x00aaff, alpha: 0.1 });

    }, [viewportBounds, geometry]);

    // Handle clicks on minimap
    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!containerRef.current || !geometry) return;

        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const { scale, offsetX, offsetY } = transformRef.current;

        // Convert click coordinates to fabric coordinates
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        const fabricX = (clickX - offsetX) / scale;
        const fabricY = (clickY - offsetY) / scale;

        onViewportClick(fabricX, fabricY);
    };

    const getTileColor = (tileName: string): number => {
        // Simple hash-based color generation for minimap
        let hash = 0;
        for (let i = 0; i < tileName.length; i++) {
            hash = tileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash) % 360;
        return hslToHex(hue, 40, 35);
    };

    const hslToHex = (h: number, s: number, l: number): number => {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = (n: number) => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color);
        };
        return (f(0) << 16) | (f(8) << 8) | f(4);
    };

    return (
        <div className={`worldview ${className}`}>
            <div className="worldview-canvas-container">
                <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    style={{
                        width: '100%',
                        height: '100%',
                        cursor: geometry ? 'pointer' : 'default'
                    }}
                />
            </div>
        </div>
    );
};
