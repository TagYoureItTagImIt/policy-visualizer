import React, { useState, useRef, useCallback, useEffect } from 'react';
import MediaDisplay from './ImageDisplay';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TargetDimensions {
  width: number;
  height: number;
}

const VideoCropTool: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [targetDimensions, setTargetDimensions] = useState<TargetDimensions>({ width: 1920, height: 1080 });
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outputVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);
    };
  }, [videoUrl, processedVideoUrl]);

  useEffect(() => {
    drawCropOverlay();
  }, [drawCropOverlay]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const handleTimeUpdate = () => {
        drawCropOverlay();
      };
      video.addEventListener('timeupdate', handleTimeUpdate);
      return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, [drawCropOverlay]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      setProcessedVideoUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCropArea(null);
      
      const objectUrl = URL.createObjectURL(file);
      setVideoUrl(objectUrl);

      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
          setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        };
        video.src = objectUrl;
        video.load();
      } else {
        setError("Please select a video file.");
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const handleTargetDimensionsChange = (field: keyof TargetDimensions, value: number) => {
    setTargetDimensions(prev => ({ ...prev, [field]: value }));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!videoDimensions) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPoint({ x, y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !videoDimensions) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newCropArea = {
      x: Math.min(startPoint.x, x),
      y: Math.min(startPoint.y, y),
      width: Math.abs(x - startPoint.x),
      height: Math.abs(y - startPoint.y)
    };
    
    setCropArea(newCropArea);
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    setStartPoint(null);
  };

  const drawCropOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoDimensions) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    if (videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    }
    
    if (cropArea) {
      // Draw semi-transparent overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Clear the crop area to show original video
      ctx.clearRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
      
      // Redraw the video frame in the crop area
      if (videoRef.current) {
        ctx.drawImage(
          videoRef.current,
          cropArea.x, cropArea.y, cropArea.width, cropArea.height,
          cropArea.x, cropArea.y, cropArea.width, cropArea.height
        );
      }
      
      // Draw crop border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
      
      // Draw corner handles
      const handleSize = 8;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(cropArea.x - handleSize/2, cropArea.y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropArea.x + cropArea.width - handleSize/2, cropArea.y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropArea.x - handleSize/2, cropArea.y + cropArea.height - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropArea.x + cropArea.width - handleSize/2, cropArea.y + cropArea.height - handleSize/2, handleSize, handleSize);
    }
  }, [cropArea, videoDimensions]);

  const processVideo = useCallback(async () => {
    if (!videoUrl || !cropArea || !videoDimensions) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true; // Required for autoplay
      
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        video.load();
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = targetDimensions.width;
      canvas.height = targetDimensions.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not create canvas context');
      }
      
      // Create MediaRecorder for output
      const stream = canvas.captureStream(30); // 30 FPS
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      let animationId: number;
      
      const processFrame = () => {
        if (video.ended || video.paused) {
          mediaRecorder.stop();
          return;
        }
        
        // Draw the cropped and scaled frame
        ctx.drawImage(
          video,
          cropArea.x, cropArea.y, cropArea.width, cropArea.height,
          0, 0, targetDimensions.width, targetDimensions.height
        );
        
        animationId = requestAnimationFrame(processFrame);
      };
      
      mediaRecorder.start();
      video.play();
      processFrame();
      
      mediaRecorder.onstop = () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setProcessedVideoUrl(url);
        setIsProcessing(false);
      };
      
    } catch (error) {
      setError('Error processing video: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsProcessing(false);
    }
  }, [videoUrl, cropArea, videoDimensions, targetDimensions]);

  const downloadVideo = () => {
    if (!processedVideoUrl) return;
    
    const a = document.createElement('a');
    a.href = processedVideoUrl;
    a.download = 'cropped-video.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-2xl mx-auto">
        <label htmlFor="video-upload" className="block text-sm font-medium text-gray-300 mb-2">
          Upload Video
        </label>
        <input 
          id="video-upload"
          type="file" 
          accept="video/*" 
          onChange={handleFileChange} 
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition"
        />
      </div>

      {error && (
        <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-lg max-w-2xl mx-auto">
          {error}
        </div>
      )}

      {videoUrl && videoDimensions && (
        <>
          {/* Target Dimensions */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-2xl mx-auto">
            <h3 className="text-lg font-medium text-gray-300 mb-4">Target Dimensions</h3>
            
            {/* Preset buttons */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">Quick Presets:</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTargetDimensions({ width: 1920, height: 1080 })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
                >
                  1920×1080 (HD)
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 1280, height: 720 })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
                >
                  1280×720 (HD)
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 3840, height: 2160 })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
                >
                  3840×2160 (4K)
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 1080, height: 1080 })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
                >
                  1080×1080 (Square)
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 1080, height: 1920 })}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
                >
                  1080×1920 (Vertical)
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-width" className="block text-sm font-medium text-gray-400 mb-1">
                  Width
                </label>
                <input
                  id="target-width"
                  type="number"
                  value={targetDimensions.width}
                  onChange={(e) => handleTargetDimensionsChange('width', parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-700 text-white rounded-md p-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="target-height" className="block text-sm font-medium text-gray-400 mb-1">
                  Height
                </label>
                <input
                  id="target-height"
                  type="number"
                  value={targetDimensions.height}
                  onChange={(e) => handleTargetDimensionsChange('height', parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-700 text-white rounded-md p-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Video Display and Crop Selection */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-4xl mx-auto">
            <h3 className="text-lg font-medium text-gray-300 mb-4">Select Crop Area</h3>
            <div className="relative inline-block">
              <video
                ref={videoRef}
                src={videoUrl}
                className="max-w-full h-auto"
                style={{ maxHeight: '400px' }}
                controls
              />
              <canvas
                ref={canvasRef}
                width={videoDimensions.width}
                height={videoDimensions.height}
                className="absolute top-0 left-0 cursor-crosshair"
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  maxHeight: '400px'
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            </div>
            {cropArea && (
              <div className="mt-4 text-sm text-gray-400">
                Crop Area: {Math.round(cropArea.x)}, {Math.round(cropArea.y)} - {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
              </div>
            )}
          </div>

          {/* Process Button */}
          <div className="text-center">
            <button
              onClick={processVideo}
              disabled={!cropArea || isProcessing}
              className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 ease-in-out"
            >
              {isProcessing ? 'Processing...' : 'Process Video'}
            </button>
          </div>

          {/* Output Video */}
          {processedVideoUrl && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-4xl mx-auto">
              <h3 className="text-lg font-medium text-gray-300 mb-4">Processed Video</h3>
              <video
                ref={outputVideoRef}
                src={processedVideoUrl}
                className="max-w-full h-auto mb-4"
                style={{ maxHeight: '400px' }}
                controls
              />
              <div className="text-center">
                <button
                  onClick={downloadVideo}
                  className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all duration-300 ease-in-out"
                >
                  Download Video
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VideoCropTool;
