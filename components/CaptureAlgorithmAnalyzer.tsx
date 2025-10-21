import React, { useState, useRef, useCallback, useEffect } from 'react';

// Make Tesseract.js globally available for TypeScript
declare const Tesseract: any;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const CaptureAlgorithmAnalyzer: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Editing controls state
  const [contrast, setContrast] = useState<number>(0);
  const [useGrayscale, setUseGrayscale] = useState<boolean>(false);
  const [grayscaleThreshold, setGrayscaleThreshold] = useState<number>(255);
  const [useBinarization, setUseBinarization] = useState<boolean>(false);

  // OCR state
  const [ocrArea, setOcrArea] = useState<{ x: number, y: number, width: number, height: number }>({ x: 0, y: 0, width: 0, height: 0 });
  const [isDrawingOcr, setIsDrawingOcr] = useState<boolean>(false);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState<boolean>(false);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const tesseractWorkerRef = useRef<any | null>(null);
  const isOcrCancelledRef = useRef<boolean>(false);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    // This effect handles cleaning up the object URL when the component unmounts or the URL changes.
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const resetState = () => {
    setImageUrl(null);
    setImageDimensions(null);
    setIsProcessing(false);
    setError(null);
    imageRef.current = null;
    setHasProcessed(false);
    setOcrResult('');
    setOcrError(null);
    setOcrArea({ x: 0, y: 0, width: 0, height: 0 });
    
    // Clear canvases
    [originalCanvasRef, processedCanvasRef, drawingCanvasRef].forEach(ref => {
        const canvas = ref.current;
        if(canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      resetState();
      
      if (!file.type.startsWith('image/')) {
        setError("Unsupported file type. Please select an image file.");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setImageDimensions({ width: img.width, height: img.height });
        setImageUrl(objectUrl);
      };
      img.onerror = () => {
        setError("Failed to load the image. Please try another file.");
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    }
  };

  useEffect(() => {
    // This effect runs after the image is loaded and the component has re-rendered.
    // It's responsible for setting canvas dimensions and drawing the image.
    if (imageRef.current && imageDimensions) {
        // Draw original image
        const originalCanvas = originalCanvasRef.current;
        if(originalCanvas) {
            originalCanvas.width = imageDimensions.width;
            originalCanvas.height = imageDimensions.height;
            const originalCtx = originalCanvas.getContext('2d');
            originalCtx?.drawImage(imageRef.current, 0, 0);
        }

        // Prepare processed canvas
        const processedCanvas = processedCanvasRef.current;
        if(processedCanvas) {
            processedCanvas.width = imageDimensions.width;
            processedCanvas.height = imageDimensions.height;
            const processedCtx = processedCanvas.getContext('2d');
            processedCtx?.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
        }
        
        // Prepare drawing canvas
        const drawingCanvas = drawingCanvasRef.current;
         if(drawingCanvas) {
            drawingCanvas.width = imageDimensions.width;
            drawingCanvas.height = imageDimensions.height;
        }
    }
  }, [imageDimensions]);
  
  const handleAnalyze = useCallback(() => {
    if (!originalCanvasRef.current || !processedCanvasRef.current || !imageDimensions) return;
    
    setIsProcessing(true);
    setError(null);
    setOcrResult('');
    setOcrError(null);

    // Use a timeout to allow UI to update to "processing" state
    setTimeout(() => {
        try {
            const originalCtx = originalCanvasRef.current!.getContext('2d', { willReadFrequently: true });
            const processedCtx = processedCanvasRef.current!.getContext('2d');
            if (!originalCtx || !processedCtx) {
                throw new Error("Could not get canvas contexts.");
            }

            const imageData = originalCtx.getImageData(0, 0, imageDimensions.width, imageDimensions.height);
            const data = imageData.data;
            const processedData = new Uint8ClampedArray(data);

            let avgLuminance = 0;
            if (useBinarization) {
                let totalLuminance = 0;
                for (let i = 0; i < data.length; i += 4) {
                    totalLuminance += (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
                }
                avgLuminance = totalLuminance / (data.length / 4);
            }

            const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            for (let i = 0; i < data.length; i += 4) {
                let r = data[i];
                let g = data[i+1];
                let b = data[i+2];

                // 1. Apply Contrast
                r = clamp(contrastFactor * (r - 128) + 128, 0, 255);
                g = clamp(contrastFactor * (g - 128) + 128, 0, 255);
                b = clamp(contrastFactor * (b - 128) + 128, 0, 255);
                
                // 2. Apply Grayscale
                if (useGrayscale) {
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    const alpha = grayscaleThreshold / 255.0;
                    r = r * (1 - alpha) + gray * alpha;
                    g = g * (1 - alpha) + gray * alpha;
                    b = b * (1 - alpha) + gray * alpha;
                }

                // 3. Apply Binarization
                if (useBinarization) {
                    const currentLuminance = 0.299 * r + 0.587 * g + 0.114 * b;
                    const val = currentLuminance < avgLuminance ? 0 : 255;
                    r = g = b = val;
                }
                
                processedData[i] = r;
                processedData[i+1] = g;
                processedData[i+2] = b;
                processedData[i+3] = data[i+3]; // Keep alpha
            }

            const processedImageData = new ImageData(processedData, imageDimensions.width, imageDimensions.height);
            processedCtx.putImageData(processedImageData, 0, 0);
            setHasProcessed(true);

        } catch (e: any) {
            setError(`An error occurred during analysis: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    }, 50);

  }, [imageDimensions, contrast, useGrayscale, grayscaleThreshold, useBinarization]);

  const handleRunOcr = async () => {
    if (!processedCanvasRef.current || !ocrArea || ocrArea.width <= 0 || ocrArea.height <= 0) {
        setOcrError("Please define a valid OCR area first.");
        return;
    }
    
    setIsOcrProcessing(true);
    setOcrResult('');
    setOcrError(null);
    isOcrCancelledRef.current = false;
    let worker: any = null;

    try {
        worker = await Tesseract.createWorker('eng');
        tesseractWorkerRef.current = worker;

        const processedCanvas = processedCanvasRef.current;
        const ctx = processedCanvas.getContext('2d');
        if (!ctx) throw new Error("Could not get processed canvas context.");

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = ocrArea.width;
        cropCanvas.height = ocrArea.height;
        const cropCtx = cropCanvas.getContext('2d');
        if (!cropCtx) throw new Error("Could not get crop canvas context.");

        const imageData = ctx.getImageData(ocrArea.x, ocrArea.y, ocrArea.width, ocrArea.height);
        cropCtx.putImageData(imageData, 0, 0);

        const recognitionPromise = worker.recognize(cropCanvas).then((res: any) => res.data.text);
        
        const timeoutPromise = new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('OCR operation timed out after 5 seconds.')), 5000)
        );

        const result = await Promise.race([recognitionPromise, timeoutPromise]);
        setOcrResult(result);
    } catch (e: any) {
        if (!isOcrCancelledRef.current) {
             setOcrError(`OCR failed: ${e.message}`);
        }
    } finally {
        if (worker) {
            await worker.terminate();
        }
        tesseractWorkerRef.current = null;
        setIsOcrProcessing(false);
    }
  };

  const handleCancelOcr = () => {
    if (tesseractWorkerRef.current) {
        isOcrCancelledRef.current = true;
        tesseractWorkerRef.current.terminate();
        tesseractWorkerRef.current = null;
        setIsOcrProcessing(false);
        setOcrError("OCR operation cancelled by user.");
    }
  };

  useEffect(() => {
    // Draw OCR area overlay
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (ocrArea.width > 0 && ocrArea.height > 0) {
        ctx.fillStyle = 'rgba(236, 72, 153, 0.4)'; // semi-transparent pink
        ctx.strokeStyle = '#EC4899'; // pink-500
        ctx.lineWidth = 2;
        ctx.fillRect(ocrArea.x, ocrArea.y, ocrArea.width, ocrArea.height);
        ctx.strokeRect(ocrArea.x, ocrArea.y, ocrArea.width, ocrArea.height);
    }

    if (currentRect) {
        ctx.strokeStyle = '#F472B6'; // pink-400
        ctx.lineWidth = 2;
        ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    }
  }, [ocrArea, currentRect, imageDimensions]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !imageDimensions) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = imageDimensions.width / rect.width;
    const scaleY = imageDimensions.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingOcr) return;
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
      setOcrArea({
        x: Math.round(currentRect.x),
        y: Math.round(currentRect.y),
        width: Math.round(currentRect.width),
        height: Math.round(currentRect.height)
      });
    }
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentRect(null);
    setIsDrawingOcr(false);
  };

  return (
    <>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div>
                <label htmlFor="capture-file-upload" className="block text-sm font-medium text-gray-300 mb-2">1. Upload Image</label>
                <input 
                    id="capture-file-upload"
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition"
                />
            </div>
            
            <div className="space-y-4">
                 <div>
                    <label htmlFor="contrast-slider" className="block text-sm font-medium text-gray-300 mb-1">Contrast: {contrast}</label>
                    <input 
                        id="contrast-slider"
                        type="range" 
                        min="-100" 
                        max="100" 
                        value={contrast} 
                        onChange={(e) => setContrast(Number(e.target.value))} 
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
            
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-start">
                <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-300">Grayscale</span>
                        <button onClick={() => setUseGrayscale(!useGrayscale)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${useGrayscale ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${useGrayscale ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {useGrayscale && (
                        <div>
                            <label htmlFor="grayscale-threshold-slider" className="block text-sm font-medium text-gray-300 mb-1">Grayscale Amount: {grayscaleThreshold}</label>
                            <input 
                                id="grayscale-threshold-slider"
                                type="range" 
                                min="0" 
                                max="255" 
                                value={grayscaleThreshold} 
                                onChange={(e) => setGrayscaleThreshold(Number(e.target.value))} 
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-300">Automatic Binarization</span>
                        <button onClick={() => setUseBinarization(!useBinarization)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${useBinarization ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${useBinarization ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div className="mt-6 border-t border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">OCR Screen Area (Optional)</label>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                <div>
                    <label htmlFor="ocr-x" className="block text-xs font-medium text-gray-400 mb-1">X</label>
                    <input id="ocr-x" type="number" value={ocrArea.x} onChange={(e) => setOcrArea(p => ({...p, x: parseInt(e.target.value) || 0}))} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                </div>
                <div>
                    <label htmlFor="ocr-y" className="block text-xs font-medium text-gray-400 mb-1">Y</label>
                    <input id="ocr-y" type="number" value={ocrArea.y} onChange={(e) => setOcrArea(p => ({...p, y: parseInt(e.target.value) || 0}))} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                </div>
                <div>
                    <label htmlFor="ocr-width" className="block text-xs font-medium text-gray-400 mb-1">Width</label>
                    <input id="ocr-width" type="number" value={ocrArea.width} onChange={(e) => setOcrArea(p => ({...p, width: parseInt(e.target.value) || 0}))} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                </div>
                <div>
                    <label htmlFor="ocr-height" className="block text-xs font-medium text-gray-400 mb-1">Height</label>
                    <input id="ocr-height" type="number" value={ocrArea.height} onChange={(e) => setOcrArea(p => ({...p, height: parseInt(e.target.value) || 0}))} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
                </div>
                <button 
                    onClick={() => setIsDrawingOcr(p => !p)} 
                    disabled={!imageUrl}
                    className={`rounded-md p-2 text-sm flex justify-center items-center transition ${
                    isDrawingOcr
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-pink-600 hover:bg-pink-700 text-white disabled:bg-gray-600'
                    }`}
                >
                    {isDrawingOcr ? 'Drawing...' : 'Draw'}
                </button>
            </div>
        </div>

        <div className="mt-6 text-center border-t border-gray-700 pt-6">
            <button 
                onClick={handleAnalyze} 
                disabled={!imageUrl || isProcessing}
                className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 ease-in-out flex items-center justify-center mx-auto"
            >
            {isProcessing ? (
                <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
                </>
            ) : '2. Analyze Image'}
            </button>
        </div>
      </div>
      
      {error && <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-lg max-w-4xl mx-auto">{error}</div>}

      {imageDimensions && (
        <div className="w-full max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Original Image ({imageDimensions.width}x{imageDimensions.height})</h3>
                <div className="relative inline-block align-top">
                    <canvas 
                        ref={originalCanvasRef} 
                        className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                    />
                    <canvas
                        ref={drawingCanvasRef}
                        className={`absolute top-0 left-0 max-w-full h-auto ${isDrawingOcr ? 'cursor-crosshair z-20' : 'pointer-events-none z-10'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
            </div>
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Processed Image</h3>
                <canvas 
                  ref={processedCanvasRef} 
                  className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                />
                {hasProcessed && (
                    <div className="mt-4">
                        <button
                            onClick={isOcrProcessing ? handleCancelOcr : handleRunOcr}
                            className={`px-6 py-2 text-white font-semibold rounded-lg shadow-md transition ${isOcrProcessing 
                                ? 'bg-red-600 hover:bg-red-700' 
                                : 'bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed'}`}
                        >
                            {isOcrProcessing ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Cancel OCR
                                </span>
                            ) : 'Run OCR'}
                        </button>
                    </div>
                )}
                 {(ocrResult || ocrError || isOcrProcessing) && (
                    <div className="mt-4 text-left p-4 bg-gray-900 rounded-lg max-w-full mx-auto">
                        <h4 className="font-semibold text-gray-300 mb-2">OCR Result:</h4>
                        {isOcrProcessing && !ocrError && <p className="text-gray-400">Analyzing text...</p>}
                        {ocrError && <p className="text-red-400">{ocrError}</p>}
                        {ocrResult && <pre className="text-indigo-300 whitespace-pre-wrap font-mono text-sm">{ocrResult}</pre>}
                    </div>
                 )}
            </div>
        </div>
      )}
    </>
  );
};

export default CaptureAlgorithmAnalyzer;