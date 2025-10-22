import React, { useState, useRef, useCallback, useEffect } from 'react';

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

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VideoCropTool: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [targetDimensions, setTargetDimensions] = useState<TargetDimensions>({ width: 1080, height: 2340 });
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isCustom, setIsCustom] = useState<boolean>(false);

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
    if (videoRef.current && canvasRef.current) {
      drawCropOverlay();
    }
  }, [cropBox, videoDimensions]);

  // Initialize crop box when video dimensions are loaded
  useEffect(() => {
    if (videoDimensions && !cropBox) {
      const newCropBox = calculateCropBox(videoDimensions, targetDimensions);
      setCropBox(newCropBox);
    }
  }, [videoDimensions, targetDimensions, cropBox]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const handleTimeUpdate = () => {
        if (canvasRef.current) {
          drawCropOverlay();
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);
      return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, [cropBox, videoDimensions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      setProcessedVideoUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCropBox(null);
      
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
    setTargetDimensions(prev => {
      const newDimensions = { ...prev, [field]: value };
      // Recalculate crop box with new dimensions
      if (videoDimensions && cropBox) {
        const newCropBox = calculateCropBox(videoDimensions, newDimensions);
        setCropBox(newCropBox);
      }
      return newDimensions;
    });
  };

  const calculateCropBox = (videoDims: { width: number; height: number }, targetDims: TargetDimensions): CropBox => {
    const videoAspectRatio = videoDims.width / videoDims.height;
    const targetAspectRatio = targetDims.width / targetDims.height;
    
    let cropWidth, cropHeight;
    
    if (videoAspectRatio > targetAspectRatio) {
      // Video is wider than target, crop width
      cropHeight = videoDims.height;
      cropWidth = cropHeight * targetAspectRatio;
    } else {
      // Video is taller than target, crop height
      cropWidth = videoDims.width;
      cropHeight = cropWidth / targetAspectRatio;
    }
    
    return {
      x: (videoDims.width - cropWidth) / 2,
      y: (videoDims.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight
    };
  };

  const handlePresetSelect = (width: number, height: number) => {
    setTargetDimensions({ width, height });
    setIsCustom(false);
    if (videoDimensions) {
      const newCropBox = calculateCropBox(videoDimensions, { width, height });
      setCropBox(newCropBox);
    }
  };

  const handleCustomToggle = () => {
    setIsCustom(!isCustom);
    if (!isCustom) {
      // Switching to custom, keep current dimensions
    } else {
      // Switching from custom, reset to default preset
      handlePresetSelect(1080, 2340);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!videoDimensions || !cropBox) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if click is inside the crop box
    if (x >= cropBox.x && x <= cropBox.x + cropBox.width &&
        y >= cropBox.y && y <= cropBox.y + cropBox.height) {
      setIsDragging(true);
      setDragStart({ x: x - cropBox.x, y: y - cropBox.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart || !videoDimensions || !cropBox) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newX = x - dragStart.x;
    const newY = y - dragStart.y;
    
    // Keep crop box within video bounds
    const constrainedX = Math.max(0, Math.min(newX, videoDimensions.width - cropBox.width));
    const constrainedY = Math.max(0, Math.min(newY, videoDimensions.height - cropBox.height));
    
    setCropBox({
      ...cropBox,
      x: constrainedX,
      y: constrainedY
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const drawCropOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !videoDimensions) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (cropBox) {
      // Draw semi-transparent overlay outside crop area
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Clear the crop area to show original video
      ctx.clearRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
      
      // Redraw the video frame in the crop area
      ctx.drawImage(
        video,
        cropBox.x, cropBox.y, cropBox.width, cropBox.height,
        cropBox.x, cropBox.y, cropBox.width, cropBox.height
      );
      
      // Draw crop border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
      
      // Draw corner handles
      const handleSize = 12;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(cropBox.x - handleSize/2, cropBox.y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropBox.x + cropBox.width - handleSize/2, cropBox.y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropBox.x - handleSize/2, cropBox.y + cropBox.height - handleSize/2, handleSize, handleSize);
      ctx.fillRect(cropBox.x + cropBox.width - handleSize/2, cropBox.y + cropBox.height - handleSize/2, handleSize, handleSize);
    }
  }, [cropBox, videoDimensions]);

  const processVideo = useCallback(async () => {
    if (!videoUrl || !cropBox || !videoDimensions) return;
    
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
          cropBox.x, cropBox.y, cropBox.width, cropBox.height,
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
  }, [videoUrl, cropBox, videoDimensions, targetDimensions]);

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
            <h3 className="text-lg font-medium text-gray-300 mb-4">Target Dimensions (Vertical Only)</h3>
            
            {/* Preset buttons */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">Vertical Presets:</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handlePresetSelect(1206, 2622)}
                  className={`px-3 py-1 text-sm rounded transition ${
                    targetDimensions.width === 1206 && targetDimensions.height === 2622 && !isCustom
                      ? 'bg-green-600 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  1206×2622
                </button>
                <button
                  onClick={() => handlePresetSelect(1080, 2340)}
                  className={`px-3 py-1 text-sm rounded transition ${
                    targetDimensions.width === 1080 && targetDimensions.height === 2340 && !isCustom
                      ? 'bg-green-600 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  1080×2340
                </button>
                <button
                  onClick={handleCustomToggle}
                  className={`px-3 py-1 text-sm rounded transition ${
                    isCustom
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>
            
            {isCustom && (
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
            )}
            
            <div className="mt-4 text-sm text-gray-400">
              Current: {targetDimensions.width} × {targetDimensions.height}
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
                onLoadedMetadata={() => {
                  if (videoRef.current && canvasRef.current) {
                    const video = videoRef.current;
                    const canvas = canvasRef.current;
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    drawCropOverlay();
                  }
                }}
              />
              <canvas
                ref={canvasRef}
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
            {cropBox && (
              <div className="mt-4 text-sm text-gray-400">
                Crop Box: {Math.round(cropBox.x)}, {Math.round(cropBox.y)} - {Math.round(cropBox.width)} × {Math.round(cropBox.height)}
                <br />
                <span className="text-blue-400">Drag the blue box to reposition the crop area</span>
              </div>
            )}
          </div>

          {/* Process Button */}
          <div className="text-center">
            <button
              onClick={processVideo}
              disabled={!cropBox || isProcessing}
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
