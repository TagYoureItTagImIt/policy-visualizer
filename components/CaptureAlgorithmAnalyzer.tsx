import React, { useState, useRef, useCallback, useEffect } from 'react';

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

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

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
    
    // Clear canvases
    [originalCanvasRef, processedCanvasRef].forEach(ref => {
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
    if (imageRef.current && imageDimensions && originalCanvasRef.current && processedCanvasRef.current) {
        // Draw original image
        const originalCanvas = originalCanvasRef.current;
        originalCanvas.width = imageDimensions.width;
        originalCanvas.height = imageDimensions.height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx?.drawImage(imageRef.current, 0, 0);

        // Prepare processed canvas
        const processedCanvas = processedCanvasRef.current;
        processedCanvas.width = imageDimensions.width;
        processedCanvas.height = imageDimensions.height;
        const processedCtx = processedCanvas.getContext('2d');
        processedCtx?.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
    }
  }, [imageDimensions]);
  
  const handleAnalyze = useCallback(() => {
    if (!originalCanvasRef.current || !processedCanvasRef.current || !imageDimensions) return;
    
    setIsProcessing(true);
    setError(null);

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

        } catch (e: any) {
            setError(`An error occurred during analysis: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    }, 50);

  }, [imageDimensions, contrast, useGrayscale, grayscaleThreshold, useBinarization]);


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
                <canvas 
                    ref={originalCanvasRef} 
                    className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                />
            </div>
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">Processed Image</h3>
                <canvas 
                  ref={processedCanvasRef} 
                  className="max-w-full h-auto rounded-lg shadow-lg bg-gray-700"
                />
            </div>
        </div>
      )}
    </>
  );
};

export default CaptureAlgorithmAnalyzer;