import React, { useRef, useEffect, useState } from 'react';
import type { ExcludedArea } from '../types';

interface MediaDisplayProps {
  mediaType: 'image' | 'video' | null;
  mediaUrl: string | null;
  mediaDimensions: { width: number; height: number } | null;
  originalCanvasRef: React.RefObject<HTMLCanvasElement>;
  modifiedCanvasRef: React.RefObject<HTMLCanvasElement>;
  sourceVideoRef: React.RefObject<HTMLVideoElement>;
  hasResult: boolean;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  drawingAreaId: number | null;
  onAreaDrawn: (rect: { x: number; y: number; width: number; height: number }) => void;
  excludedAreas: ExcludedArea[];
}

const MediaDisplay: React.FC<MediaDisplayProps> = ({
  mediaType,
  mediaUrl,
  mediaDimensions,
  originalCanvasRef,
  modifiedCanvasRef,
  sourceVideoRef,
  hasResult,
  onTimeUpdate,
  drawingAreaId,
  onAreaDrawn,
  excludedAreas,
}) => {
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !mediaDimensions) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = mediaDimensions.width;
    canvas.height = mediaDimensions.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all existing excluded areas
    ctx.fillStyle = 'rgba(0, 0, 139, 0.5)'; // semi-transparent dark blue
    excludedAreas.forEach(area => {
      ctx.fillRect(area.x, area.y, area.width, area.height);
    });

    if (currentRect) {
      ctx.strokeStyle = '#34D399'; // A bright green color
      ctx.lineWidth = 2;
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    }
  }, [excludedAreas, currentRect, mediaDimensions]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !mediaDimensions) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = mediaDimensions.width / rect.width;
    const scaleY = mediaDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingAreaId) return;
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (coords) {
      setIsDrawing(true);
      setStartPoint(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;
    const coords = getCanvasCoordinates(e);
    if (coords) {
      const x = Math.min(startPoint.x, coords.x);
      const y = Math.min(startPoint.y, coords.y);
      const width = Math.abs(startPoint.x - coords.x);
      const height = Math.abs(startPoint.y - coords.y);
      setCurrentRect({ x, y, width, height });
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentRect) {
      onAreaDrawn({ x: Math.round(currentRect.x), y: Math.round(currentRect.y), width: Math.round(currentRect.width), height: Math.round(currentRect.height) });
    }
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentRect(null);
  };

  if (!mediaDimensions) return null;

  const drawingCanvas = (
    <canvas
      ref={drawingCanvasRef}
      width={mediaDimensions.width}
      height={mediaDimensions.height}
      className={`absolute top-0 left-0 max-w-full h-auto ${drawingAreaId ? 'cursor-crosshair z-20' : 'pointer-events-none z-10'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp} // End drawing if mouse leaves canvas
    />
  );

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      {mediaType === 'image' && (
        <>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-300 mb-2">Original Image ({mediaDimensions.width}x{mediaDimensions.height})</h3>
            <div className="relative inline-block align-top">
              <canvas 
                ref={originalCanvasRef} 
                width={mediaDimensions.width} 
                height={mediaDimensions.height}
                className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
              />
              {drawingCanvas}
            </div>
          </div>
          <div className={`text-center transition-opacity duration-500 ${hasResult ? 'opacity-100' : 'opacity-0'}`}>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">Highlighted Image</h3>
            <canvas 
              ref={modifiedCanvasRef}
              width={mediaDimensions.width} 
              height={mediaDimensions.height}
              className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
            />
          </div>
        </>
      )}
      {mediaType === 'video' && (
         <>
          <div className="text-center space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Original Video ({mediaDimensions.width}x{mediaDimensions.height})</h3>
                <div className="relative inline-block align-top">
                    <video
                        ref={sourceVideoRef}
                        src={mediaUrl ?? ''}
                        width={mediaDimensions.width}
                        height={mediaDimensions.height}
                        className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                        controls
                        muted
                        onTimeUpdate={onTimeUpdate}
                    />
                    {drawingCanvas}
                </div>
            </div>
          </div>
          <div className={`text-center transition-opacity duration-500 ${hasResult ? 'opacity-100' : 'opacity-0'}`}>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">Highlighted Video</h3>
            <canvas 
              ref={modifiedCanvasRef}
              width={mediaDimensions.width} 
              height={mediaDimensions.height}
              className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default MediaDisplay;