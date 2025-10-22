import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { MotionFrameAnalysisResult, Point, ExcludedArea } from '../types';
import { sobel, toGrayscale } from '../utils/imageProcessing';

const ANALYSIS_FPS = 15;
const MAX_VIDEO_DURATION = 15;

const MotionDetectionAnalyzer: React.FC = () => {
  // State for inputs and settings
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [edgeThreshold, setEdgeThreshold] = useState(70);
  const [comparisonPoints, setComparisonPoints] = useState(1000);
  const [tolerance, setTolerance] = useState(0.1);
  const [excludedAreas, setExcludedAreas] = useState<ExcludedArea[]>([]);

  // State for processing and results
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number, total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MotionFrameAnalysisResult[]>([]);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number, height: number } | null>(null);
  
  // State for drawing excluded areas
  const [drawingAreaId, setDrawingAreaId] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Refs for DOM elements and processing
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Analyzed frame
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingStartPoint = useRef<{ x: number; y: number } | null>(null);

  const resetState = useCallback(() => {
    setError(null);
    setVideoUrl(url => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setResults([]);
    setIsProcessing(false);
    setProcessingProgress(null);
    setVideoDimensions(null);
    setExcludedAreas([]);
    setDrawingAreaId(null);
    setIsDrawing(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetState();

    if (!file.type.startsWith('video/')) {
      setError("Unsupported file type. Please select a video file.");
      return;
    }
    
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const captureFirstFrame = () => {
      const analyzedCanvas = canvasRef.current;
      if (analyzedCanvas) {
          analyzedCanvas.getContext('2d')?.drawImage(video, 0, 0, analyzedCanvas.width, analyzedCanvas.height);
      }
    };

    video.addEventListener('seeked', captureFirstFrame, { once: true });

    video.onloadedmetadata = () => {
      if (video.duration > MAX_VIDEO_DURATION) {
        setError(`Video is too long. Please select a video ${MAX_VIDEO_DURATION} seconds or shorter.`);
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setVideoUrl(objectUrl);
      const newDimensions = { width: video.videoWidth, height: video.videoHeight };
      setVideoDimensions(newDimensions);
      video.currentTime = 0.01;
    };
    video.src = objectUrl;
    video.load();
  };
    
  const getEdgePoints = (ctx: CanvasRenderingContext2D, width: number, height: number, areasToExclude: ExcludedArea[]): Point[] => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const grayscaleData = toGrayscale(imageData);
    return sobel(grayscaleData, width, height, edgeThreshold, areasToExclude);
  };
    
  const comparePoints = (prevPoints: Point[], currentPoints: Point[]): { stablePoints: Point[], movedPoints: Point[], changedPercentage: number, lowConfidence: boolean } => {
    const lowConfidence = currentPoints.length < comparisonPoints && currentPoints.length > 0;
    const sampleSize = Math.min(currentPoints.length, comparisonPoints);
    
    if (sampleSize === 0) {
        return { stablePoints: [], movedPoints: [], changedPercentage: 0, lowConfidence: false };
    }

    const prevPointsSet = new Set(prevPoints.map(p => `${p.x},${p.y}`));
    const currentSample = [...currentPoints].sort(() => 0.5 - Math.random()).slice(0, sampleSize);

    const stablePoints: Point[] = [];
    const movedPoints: Point[] = [];

    currentSample.forEach(p => {
        if (prevPointsSet.has(`${p.x},${p.y}`)) {
            stablePoints.push(p);
        } else {
            movedPoints.push(p);
        }
    });

    const changedPercentage = (movedPoints.length / sampleSize) * 100;

    return { stablePoints, movedPoints, changedPercentage, lowConfidence };
  };

  const drawVisualization = (frameResult: MotionFrameAnalysisResult | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !videoDimensions) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 139, 0.5)';
    for (const area of excludedAreas) {
        ctx.fillRect(area.x, area.y, area.width, area.height);
    }

    if (frameResult) {
        ctx.fillStyle = '#34D399'; // green
        frameResult.movedPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
        ctx.fillStyle = '#F87171'; // red
        frameResult.stablePoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const textHeight = 65 + (frameResult?.lowConfidence ? 20 : 0);
    ctx.fillRect(5, 5, 200, textHeight);
    ctx.fillStyle = 'white';
    
    if(frameResult) {
        let yPos = 20;
        ctx.fillText(`Changed Edges: ${frameResult.changedPercentage.toFixed(1)}%`, 10, yPos); yPos += 20;
        ctx.fillText(`Motion Detected: ${frameResult.motionDetected ? 'Yes' : 'No'}`, 10, yPos); yPos += 20;
        ctx.fillText(`Frame #: ${frameResult.frame}`, 10, yPos); yPos += 20;
        if (frameResult.lowConfidence) {
            ctx.fillStyle = '#FBBF24'; // amber-400
            ctx.fillText('Low confidence analysis', 10, yPos);
        }
    }
  };
    
  const handleAnalyzeVideoFile = useCallback(async () => {
    if (!videoRef.current || !videoDimensions) return;
    
    const video = videoRef.current;
    setIsProcessing(true);
    setError(null);
    setResults([]);
    setProcessingProgress({ current: 0, total: 0 });

    if (!processingCanvasRef.current) {
      processingCanvasRef.current = document.createElement('canvas');
    }
    const processingCanvas = processingCanvasRef.current;
    processingCanvas.width = videoDimensions.width;
    processingCanvas.height = videoDimensions.height;
    const processingCtx = processingCanvas.getContext('2d', { willReadFrequently: true });
    if (!processingCtx) {
      setError("Could not create processing context.");
      setIsProcessing(false);
      return;
    }

    video.pause();
    const duration = video.duration;
    const totalFrames = Math.floor(duration * ANALYSIS_FPS);
    const newResults: MotionFrameAnalysisResult[] = [];
    setProcessingProgress({ current: 0, total: totalFrames });

    let previousEdgePoints: Point[] = [];

    try {
      for (let i = 0; i < totalFrames; i++) {
        const time = i / ANALYSIS_FPS;
        
        await new Promise<void>(resolveSeek => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            processingCtx.drawImage(video, 0, 0, videoDimensions.width, videoDimensions.height);
            const edgePoints = getEdgePoints(processingCtx, videoDimensions.width, videoDimensions.height, excludedAreas);
            const { stablePoints, movedPoints, changedPercentage, lowConfidence } = comparePoints(previousEdgePoints, edgePoints);
            
            newResults.push({
              frame: i,
              time,
              changedPercentage,
              motionDetected: (changedPercentage / 100) >= tolerance,
              lowConfidence,
              stablePoints,
              movedPoints,
            });
            
            previousEdgePoints = edgePoints;
            setProcessingProgress(prev => ({ ...prev!, current: i + 1 }));
            resolveSeek();
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          video.currentTime = time;
        });
      }
      setResults(newResults);
    } catch (e) {
      setError("An error occurred during video analysis.");
      console.error(e);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
      video.currentTime = 0;
    }
  }, [videoDimensions, edgeThreshold, tolerance, excludedAreas, comparisonPoints]);
  
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (results.length === 0) return;
    const currentTime = e.currentTarget.currentTime;
    let frameToDisplay: MotionFrameAnalysisResult | null = null;
    for (let i = 0; i < results.length; i++) {
        if (results[i].time <= currentTime) {
            frameToDisplay = results[i];
        } else {
            break;
        }
    }
    if (frameToDisplay) {
        drawVisualization(frameToDisplay);
    }
  };
    
  const handleFrameSelect = (time: number) => {
    if(videoRef.current) videoRef.current.currentTime = time;
  }
    
  const handleExport = () => {
    const dataStr = JSON.stringify(results.map(({ stablePoints, movedPoints, ...rest }) => rest), null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'motion-analysis-results.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };
    
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toFixed(2).toString().padStart(5, '0');
    return `${mins}:${secs}`;
  };

  const handleAddExcludedArea = () => {
    if (excludedAreas.length < 5) {
      setExcludedAreas(prev => [...prev, { id: Date.now(), x: 0, y: 0, width: 0, height: 0 }]);
    }
  };

  const handleRemoveExcludedArea = (id: number) => {
    setExcludedAreas(prev => prev.filter(area => area.id !== id));
  };

  const handleExcludedAreaChange = (id: number, field: keyof Omit<ExcludedArea, 'id'>, value: number) => {
    setExcludedAreas(prev => prev.map(area => area.id === id ? { ...area, [field]: value } : area));
  };

  const handleDrawExcludedArea = (id: number) => {
    const isActivating = drawingAreaId !== id;
    setDrawingAreaId(isActivating ? id : null);
    if (isActivating && videoRef.current) {
        videoRef.current.pause();
    }
  };
  
  useEffect(() => {
    const canvas = drawingOverlayCanvasRef.current;
    if (!canvas || !videoDimensions) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoDimensions.width;
    canvas.height = videoDimensions.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 139, 0.5)';
    excludedAreas.forEach(area => {
        ctx.fillRect(area.x, area.y, area.width, area.height);
    });

    if (currentRect) {
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2;
        ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    }
  }, [excludedAreas, currentRect, videoDimensions]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = drawingOverlayCanvasRef.current;
    if (!canvas || !videoDimensions) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = videoDimensions.width / rect.width;
    const scaleY = videoDimensions.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingAreaId) return;
    const coords = getCanvasCoordinates(e);
    if (coords) {
      setIsDrawing(true);
      drawingStartPoint.current = coords;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingStartPoint.current) return;
    const coords = getCanvasCoordinates(e);
    if (coords) {
        const start = drawingStartPoint.current;
        const x = Math.min(start.x, coords.x);
        const y = Math.min(start.y, coords.y);
        const width = Math.abs(start.x - coords.x);
        const height = Math.abs(start.y - coords.y);
        setCurrentRect({ x, y, width, height });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingStartPoint.current || !drawingAreaId || !currentRect) return;

    const rect = {
      x: Math.round(currentRect.x),
      y: Math.round(currentRect.y),
      width: Math.round(currentRect.width),
      height: Math.round(currentRect.height),
    };
    setExcludedAreas(prev => prev.map(area => (area.id === drawingAreaId ? { ...area, ...rect } : area)));
    
    setDrawingAreaId(null);
    setIsDrawing(false);
    drawingStartPoint.current = null;
    setCurrentRect(null);
  };

  const handleImportExcludedAreas = (areas: Omit<ExcludedArea, 'id'>[]) => {
    const newAreas = areas.map(area => ({
      ...area,
      id: Date.now() + Math.random() // Generate unique IDs
    }));
    setExcludedAreas(prev => [...prev, ...newAreas]);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        if (Array.isArray(jsonData)) {
          // Handle array of areas
          const areas = jsonData.map(area => ({
            x: area.x || 0,
            y: area.y || 0,
            width: area.width || 0,
            height: area.height || 0
          }));
          handleImportExcludedAreas(areas);
        } else if (jsonData.excludedAreas && Array.isArray(jsonData.excludedAreas)) {
          // Handle object with excludedAreas property
          const areas = jsonData.excludedAreas.map((area: any) => ({
            x: area.x || 0,
            y: area.y || 0,
            width: area.width || 0,
            height: area.height || 0
          }));
          handleImportExcludedAreas(areas);
        } else {
          setError("Invalid JSON format. Expected array of areas or object with 'excludedAreas' property.");
        }
      } catch (error) {
        setError("Failed to parse JSON file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };


  return (
    <div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">1. Choose Input Source</label>
            <div className="flex">
                <label htmlFor="file-upload" className="flex-1 text-center cursor-pointer px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 transition">
                    Upload Video File
                </label>
                <input id="file-upload" type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            </div>
            <p className="text-xs text-gray-400 mt-2">Video files must be under {MAX_VIDEO_DURATION} seconds.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">2. Analysis Settings</label>
            <div className="space-y-4">
              <div>
                <label htmlFor="edge-threshold" className="block text-xs font-medium text-gray-400 mb-1">Edge Threshold: {edgeThreshold}</label>
                <input id="edge-threshold" type="range" min="0" max="255" value={edgeThreshold} onChange={e => setEdgeThreshold(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0 (detect all edges)</span>
                  <span>255 (detect only strong edges)</span>
                </div>
              </div>
              <div>
                <label htmlFor="comparison-points" className="block text-xs font-medium text-gray-400 mb-1">Comparison Points: {comparisonPoints}</label>
                <input id="comparison-points" type="range" min="50" max="1000" step="50" value={comparisonPoints} onChange={e => setComparisonPoints(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>50 (faster analysis)</span>
                  <span>1000 (more accurate analysis)</span>
                </div>
              </div>
              <div>
                <label htmlFor="tolerance" className="block text-xs font-medium text-gray-400 mb-1">Motion Tolerance: {tolerance}</label>
                <input id="tolerance" type="range" min="0" max="1" step="0.01" value={tolerance} onChange={e => setTolerance(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0 (very sensitive to motion)</span>
                  <span>1 (only major motion detected)</span>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <h4 className="text-sm font-medium text-blue-300 mb-2">How to Use These Settings:</h4>
              <div className="text-xs text-blue-200 space-y-1">
                <p><strong>Edge Threshold:</strong> Lower values (0-50) for subtle motion, higher values (150-255) for obvious movement only</p>
                <p><strong>Comparison Points:</strong> Lower values (50-200) for quick analysis, higher values (500-1000) for detailed accuracy</p>
                <p><strong>Motion Tolerance:</strong> Lower values (0-0.3) to catch small movements, higher values (0.7-1.0) to ignore minor changes</p>
                <p className="text-blue-300 mt-2"><strong>Tip:</strong> Start with default values, then adjust based on your video's motion characteristics</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">Excluded Areas (Optional)</label>
            <div className="space-y-4">
              {excludedAreas.map((area) => (
                <div key={area.id} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                  <div>
                    <label htmlFor={`x-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">X</label>
                    <input id={`x-${area.id}`} type="number" value={area.x} onChange={(e) => handleExcludedAreaChange(area.id, 'x', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                  </div>
                  <div>
                    <label htmlFor={`y-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Y</label>
                    <input id={`y-${area.id}`} type="number" value={area.y} onChange={(e) => handleExcludedAreaChange(area.id, 'y', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                  </div>
                  <div>
                    <label htmlFor={`width-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Width</label>
                    <input id={`width-${area.id}`} type="number" value={area.width} onChange={(e) => handleExcludedAreaChange(area.id, 'width', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                  </div>
                  <div>
                    <label htmlFor={`height-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Height</label>
                    <input id={`height-${area.id}`} type="number" value={area.height} onChange={(e) => handleExcludedAreaChange(area.id, 'height', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                  </div>
                  <button 
                    onClick={() => handleDrawExcludedArea(area.id)} 
                    className={`rounded-md p-2 text-sm flex justify-center items-center transition ${
                      drawingAreaId === area.id 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {drawingAreaId === area.id ? 'Drawing...' : 'Draw'}
                  </button>
                  <button onClick={() => handleRemoveExcludedArea(area.id)} className="bg-red-600 hover:bg-red-700 text-white rounded-md p-2 text-sm flex justify-center items-center transition">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3">
              {excludedAreas.length < 5 && (
                <button onClick={handleAddExcludedArea} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-md text-sm transition">
                  + Add Area
                </button>
              )}
              <label htmlFor="json-import" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md text-sm transition cursor-pointer">
                Import JSON
              </label>
              <input 
                id="json-import" 
                type="file" 
                accept=".json" 
                onChange={handleImportJSON} 
                className="hidden" 
              />
            </div>
        </div>
        <div className="mt-6 text-center border-t border-gray-700 pt-6">
            <button onClick={handleAnalyzeVideoFile} disabled={!videoUrl || isProcessing} className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition flex items-center justify-center mx-auto">
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  {processingProgress ? `Analyzing... (${processingProgress.current}/${processingProgress.total})` : 'Processing...'}
                </>
              ) : '3. Analyze Video File'}
            </button>
        </div>
      </div>
      
      {error && <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-lg max-w-4xl mx-auto">{error}</div>}

      {videoDimensions && (
        <div className="w-full max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Original Video</h3>
                <div className="relative inline-block align-top">
                    <video ref={videoRef} src={videoUrl ?? ''} width={videoDimensions.width} height={videoDimensions.height} className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700" controls muted onTimeUpdate={handleTimeUpdate}/>
                    <canvas 
                        ref={drawingOverlayCanvasRef} 
                        width={videoDimensions.width} 
                        height={videoDimensions.height} 
                        className={`absolute top-0 left-0 max-w-full h-auto ${drawingAreaId ? 'cursor-crosshair z-20' : 'pointer-events-none z-10'}`}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                    />
                </div>
            </div>
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Analyzed Frame</h3>
                <canvas 
                  ref={canvasRef} 
                  width={videoDimensions.width} 
                  height={videoDimensions.height} 
                  className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                />
            </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-300 text-center">Frame-by-Frame Results</h3>
                <button onClick={handleExport} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-md text-sm transition">Export JSON</button>
            </div>
          <div className="bg-gray-800 rounded-lg shadow-lg max-h-80 overflow-y-auto p-2">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-2">Frame #</th>
                  <th scope="col" className="px-4 py-2">Timestamp</th>
                  <th scope="col" className="px-4 py-2 text-right">% Changed Edges</th>
                  <th scope="col" className="px-4 py-2 text-center">Motion Detected</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.frame} onClick={() => handleFrameSelect(result.time)} className="border-b border-gray-700 hover:bg-gray-600 cursor-pointer transition-colors">
                    <td className="px-4 py-2 font-mono">{result.frame.toString().padStart(3, '0')}</td>
                    <td className="px-4 py-2 font-mono">{formatTime(result.time)}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      <div className="flex items-center justify-end gap-2">
                        {result.lowConfidence && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                            <title>Low confidence: fewer edge points detected than comparison points set.</title>
                            <path fillRule="evenodd" d="M8.257 3.099c.636-1.026 2.252-1.026 2.888 0l6.294 10.125c.661 1.066-.176 2.443-1.444 2.443H3.407c-1.268 0-2.105-1.377-1.444-2.443L8.257 3.099zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        )}
                        {result.changedPercentage.toFixed(1)}%
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-center font-semibold ${result.motionDetected ? 'text-green-400' : 'text-red-400'}`}>{result.motionDetected ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MotionDetectionAnalyzer;