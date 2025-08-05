import React from 'react';
import './ZoomControls.css';

interface ZoomControlsProps {
    zoomLevel: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomFit: () => void;
    onZoomReset: () => void;
    minZoom?: number;
    maxZoom?: number;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
    zoomLevel,
    onZoomIn,
    onZoomOut,
    onZoomFit,
    onZoomReset,
    minZoom = 0.1,
    maxZoom = 10
}) => {
    const zoomPercentage = Math.round(zoomLevel * 100);
    const canZoomIn = zoomLevel < maxZoom;
    const canZoomOut = zoomLevel > minZoom;

    return (
        <div className="zoom-controls">
            <div className="zoom-buttons">
                <button
                    className="zoom-btn zoom-out"
                    onClick={onZoomOut}
                    disabled={!canZoomOut}
                    title="Zoom Out (Ctrl + -)"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>

                <div className="zoom-level" title="Current zoom level">
                    {zoomPercentage}%
                </div>

                <button
                    className="zoom-btn zoom-in"
                    onClick={onZoomIn}
                    disabled={!canZoomIn}
                    title="Zoom In (Ctrl + +)"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            <div className="zoom-actions">
                <button
                    className="zoom-action-btn"
                    onClick={onZoomFit}
                    title="Fit to Screen (Ctrl + 0)"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        <path d="M6 6h4v4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                </button>

                <button
                    className="zoom-action-btn"
                    onClick={onZoomReset}
                    title="Reset Zoom (Ctrl + 1)"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
