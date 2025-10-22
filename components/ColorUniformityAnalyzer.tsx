import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { RGBColor, FrameAnalysisResult, ExcludedArea } from '../types';
import Controls from './Controls';
import Results from './Results';
import MediaDisplay from './ImageDisplay';
import FrameResultsList from './FrameResultsList';

const colorDistance = (c1: RGBColor, c2: RGBColor): number => {
  const rDiff = c1.r - c2.r;
  const gDiff = c1.g - c2.g;
  const bDiff = c1.b - c2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
};

const ColorUniformityAnalyzer: React.FC = () => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [threshold, setThreshold] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    dominantColor: RGBColor;
    percentage: number;
    time?: number;
  } | null>(null);
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);
  const [frameByFrameResults, setFrameByFrameResults] = useState<FrameAnalysisResult[] | null>(null);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [excludedAreas, setExcludedAreas] = useState<ExcludedArea[]>([]);
  const [drawingAreaId, setDrawingAreaId] = useState<number | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const modifiedCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);


  useEffect(() => {
    if (mediaType !== 'image' || !mediaUrl) return;

    const img = new Image();
    img.src = mediaUrl;
    img.onload = () => {
      imageRef.current = img;
      setMediaDimensions({ width: img.width, height: img.height });
    };
    img.onerror = () => setError("Failed to load the image. Please try another file.");
  }, [mediaUrl, mediaType]);
  
  useEffect(() => {
    if (mediaType === 'image' && imageRef.current && mediaDimensions && originalCanvasRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageRef.current, 0, 0);
      }
    }
  }, [mediaDimensions, mediaType]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  const resetState = () => {
    setAnalysisResult(null);
    setError(null);
    setMediaDimensions(null);
    setMediaType(null);
    setMediaUrl(previousUrl => {
        if(previousUrl) URL.revokeObjectURL(previousUrl);
        return null;
    });
    setIsProcessing(false);
    setFrameByFrameResults(null);
    setProcessingProgress(null);
    setVideoCurrentTime(0);
    setExcludedAreas([]);
    setDrawingAreaId(null);

    const modifiedCanvas = modifiedCanvasRef.current;
    if (modifiedCanvas) {
      modifiedCanvas.getContext('2d')?.clearRect(0, 0, modifiedCanvas.width, modifiedCanvas.height);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      resetState();
      const objectUrl = URL.createObjectURL(file);

      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
          if (video.duration > 15) {
            setError("Video is too long. Please select a video 15 seconds or shorter.");
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setMediaType('video');
          setMediaUrl(objectUrl);
          setMediaDimensions({ width: video.videoWidth, height: video.videoHeight });
        };

        video.src = objectUrl;
        video.load();

      } else if (file.type.startsWith('image/')) {
        setMediaType('image');
        setMediaUrl(objectUrl);
      } else {
        setError("Unsupported file type. Please select an image or a video file.");
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const drawExcludedAreasOverlay = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(0, 0, 139, 0.5)';
    for (const area of excludedAreas) {
        ctx.fillRect(area.x, area.y, area.width, area.height);
    }
  };

  const analyzeFrame = (context: CanvasRenderingContext2D, width: number, height: number, areasToExclude: ExcludedArea[]): { newImageData: ImageData, dominantColor: RGBColor, percentage: number } | null => {
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    const isPixelInExcludedArea = (px: number, py: number) => {
        for (const area of areasToExclude) {
            if (px >= area.x && px < area.x + area.width && py >= area.y && py < area.y + area.height) {
                return true;
            }
        }
        return false;
    };
    
    let analyzablePixelCount = 0;
    const colorClusters: { representative: RGBColor; count: number }[] = [];
    const thresholdDist = threshold;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      
      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);

      // Skip pixels within any user-defined excluded areas.
      if (isPixelInExcludedArea(px, py)) continue;

      // Increment the count only for pixels that are being analyzed.
      analyzablePixelCount++;
      const pixelColor: RGBColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      
      let foundCluster = false;
      for (const cluster of colorClusters) {
        if (colorDistance(pixelColor, cluster.representative) < thresholdDist) {
          cluster.count++;
          foundCluster = true;
          break;
        }
      }
      if (!foundCluster) colorClusters.push({ representative: pixelColor, count: 1 });
    }
    
    if (colorClusters.length === 0) return null;

    const dominantCluster = colorClusters.reduce((max, cluster) => cluster.count > max.count ? cluster : max, colorClusters[0]);
    const dominantColor = dominantCluster.representative;

    // Calculate percentage based on the analyzable pixel count, correctly excluding the ignored areas.
    const percentage = (dominantCluster.count / (analyzablePixelCount || 1)) * 100;
    
    const newImageData = new ImageData(new Uint8ClampedArray(data), width, height);
    const newData = newImageData.data;

    // Highlight dominant color
    for (let i = 0; i < newData.length; i += 4) {
      if (newData[i+3] < 128) continue;

      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);
      if (isPixelInExcludedArea(px, py)) continue;

      const pixelColor: RGBColor = { r: newData[i], g: newData[i+1], b: newData[i+2] };
      if (colorDistance(pixelColor, dominantColor) < thresholdDist) {
        newData[i] = 255; newData[i+1] = 0; newData[i+2] = 0;
      }
    }

    return { newImageData, dominantColor, percentage };
  };

  const handleAnalyzeClick = useCallback(async () => {
    setError(null);
    setAnalysisResult(null);

    if (mediaType === 'image') {
      const originalCanvas = originalCanvasRef.current;
      if (!originalCanvas || !mediaDimensions) return;
      const ctx = originalCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      
      setIsProcessing(true);
      setTimeout(() => {
        try {
          const result = analyzeFrame(ctx, originalCanvas.width, originalCanvas.height, excludedAreas);
          if (result) {
            setAnalysisResult({ dominantColor: result.dominantColor, percentage: result.percentage });
            const modifiedCtx = modifiedCanvasRef.current?.getContext('2d');
            if (modifiedCtx) {
              modifiedCtx.putImageData(result.newImageData, 0, 0);
              drawExcludedAreasOverlay(modifiedCtx);
            }
          } else {
            setError("Could not find any analyzable colors in the image.");
          }
        } catch(e) {
          setError("An error occurred during image analysis.");
        } finally {
          setIsProcessing(false);
        }
      }, 50);

    } else if (mediaType === 'video') {
      const video = sourceVideoRef.current;
      const modifiedCanvas = modifiedCanvasRef.current;
      if (!video || !modifiedCanvas) return;
      
      setIsProcessing(true);
      setFrameByFrameResults(null);
      setProcessingProgress({ current: 0, total: 0});

      if (!processingCanvasRef.current) {
        processingCanvasRef.current = document.createElement('canvas');
      }
      const processingCanvas = processingCanvasRef.current;
      processingCanvas.width = video.videoWidth;
      processingCanvas.height = video.videoHeight;
      const processingCtx = processingCanvas.getContext('2d', { willReadFrequently: true });
      if (!processingCtx) {
          setError("Could not create processing context.");
          setIsProcessing(false);
          return;
      }
      
      video.pause();
      const ANALYSIS_FPS = 15;
      const duration = video.duration;
      const totalFrames = Math.floor(duration * ANALYSIS_FPS);
      const results: FrameAnalysisResult[] = [];
      setProcessingProgress({ current: 0, total: totalFrames });

      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        for (let i = 0; i < totalFrames; i++) {
          const time = i / ANALYSIS_FPS;
          
          await new Promise<void>(resolveSeek => {
              const onSeeked = () => {
                  video.removeEventListener('seeked', onSeeked);
                  processingCtx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);
                  const result = analyzeFrame(processingCtx, processingCanvas.width, processingCanvas.height, excludedAreas);
                  if (result) results.push({ time, ...result });
                  setProcessingProgress(prev => ({ ...prev!, current: i + 1 }));
                  resolveSeek();
              };
              video.addEventListener('seeked', onSeeked, { once: true });
              video.currentTime = time;
          });
        }
        setFrameByFrameResults(results);
        if (results.length > 0) {
            const firstFrame = results[0];
            setAnalysisResult({ dominantColor: firstFrame.dominantColor, percentage: firstFrame.percentage, time: firstFrame.time });
            const modifiedCtx = modifiedCanvasRef.current?.getContext('2d');
            if (modifiedCtx) {
              modifiedCtx.putImageData(firstFrame.newImageData, 0, 0);
              drawExcludedAreasOverlay(modifiedCtx);
            }
        }
      } catch (e) {
        setError("An error occurred during video analysis.");
      } finally {
        setIsProcessing(false);
        setProcessingProgress(null);
        video.currentTime = 0;
      }
    }
  }, [mediaType, mediaDimensions, threshold, excludedAreas]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (!frameByFrameResults || frameByFrameResults.length === 0) return;
    const currentTime = e.currentTarget.currentTime;
    setVideoCurrentTime(currentTime);

    let frameToDisplay = frameByFrameResults[0];
    for (let i = 0; i < frameByFrameResults.length; i++) {
        if (frameByFrameResults[i].time <= currentTime) {
            frameToDisplay = frameByFrameResults[i];
        } else {
            break;
        }
    }

    if (frameToDisplay && analysisResult?.time !== frameToDisplay.time) {
        setAnalysisResult({ dominantColor: frameToDisplay.dominantColor, percentage: frameToDisplay.percentage, time: frameToDisplay.time });
        const modifiedCtx = modifiedCanvasRef.current?.getContext('2d');
        if (modifiedCtx) {
          modifiedCtx.putImageData(frameToDisplay.newImageData, 0, 0);
          drawExcludedAreasOverlay(modifiedCtx);
        }
    }
  };

  const handleFrameSelect = (time: number) => {
    const video = sourceVideoRef.current;
    if (video) {
        video.currentTime = time;
        if (video.paused) {
          handleTimeUpdate({ currentTarget: video } as any);
        }
    }
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
    setDrawingAreaId(prevId => {
      const newId = prevId === id ? null : id;
      if (newId && mediaType === 'video' && sourceVideoRef.current) {
        sourceVideoRef.current.pause();
      }
      return newId;
    });
  };

  const handleAreaDrawn = (rect: { x: number; y: number; width: number; height: number; }) => {
    if (drawingAreaId === null) return;
    setExcludedAreas(prev => prev.map(area => 
      area.id === drawingAreaId 
        ? { ...area, ...rect }
        : area
    ));
    setDrawingAreaId(null);
  };

  const handleImportExcludedAreas = (areas: Omit<ExcludedArea, 'id'>[]) => {
    const newAreas = areas.map(area => ({
      ...area,
      id: Date.now() + Math.random() // Generate unique IDs
    }));
    setExcludedAreas(prev => [...prev, ...newAreas]);
  };


  return (
    <>
      <Controls 
        onFileChange={handleFileChange}
        onThresholdChange={(e) => setThreshold(Number(e.target.value))}
        onAnalyze={handleAnalyzeClick}
        threshold={threshold}
        isProcessing={isProcessing}
        processingProgress={processingProgress}
        hasMedia={!!mediaUrl}
        excludedAreas={excludedAreas}
        onAddExcludedArea={handleAddExcludedArea}
        onRemoveExcludedArea={handleRemoveExcludedArea}
        onExcludedAreaChange={handleExcludedAreaChange}
        drawingAreaId={drawingAreaId}
        onDrawExcludedArea={handleDrawExcludedArea}
        onImportExcludedAreas={handleImportExcludedAreas}
      />
      
      {error && <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-lg max-w-2xl mx-auto">{error}</div>}
      
      <Results result={analysisResult} />

      <MediaDisplay 
        mediaType={mediaType}
        mediaUrl={mediaUrl}
        mediaDimensions={mediaDimensions}
        originalCanvasRef={originalCanvasRef}
        modifiedCanvasRef={modifiedCanvasRef}
        sourceVideoRef={sourceVideoRef}
        hasResult={!!analysisResult}
        onTimeUpdate={handleTimeUpdate}
        drawingAreaId={drawingAreaId}
        onAreaDrawn={handleAreaDrawn}
        excludedAreas={excludedAreas}
      />

      {mediaType === 'video' && frameByFrameResults && (
        <FrameResultsList 
          results={frameByFrameResults} 
          onFrameSelect={handleFrameSelect} 
          currentTime={videoCurrentTime}
        />
      )}
    </>
  );
};

export default ColorUniformityAnalyzer;