import React from 'react';
import type { ExcludedArea } from '../types';

interface ControlsProps {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  threshold: number;
  isProcessing: boolean;
  processingProgress: { current: number; total: number } | null;
  hasMedia: boolean;
  excludedAreas: ExcludedArea[];
  onAddExcludedArea: () => void;
  onRemoveExcludedArea: (id: number) => void;
  onExcludedAreaChange: (id: number, field: keyof Omit<ExcludedArea, 'id'>, value: number) => void;
  onDrawExcludedArea: (id: number) => void;
  drawingAreaId: number | null;
}

const Controls: React.FC<ControlsProps> = ({
  onFileChange,
  onThresholdChange,
  onAnalyze,
  threshold,
  isProcessing,
  processingProgress,
  hasMedia,
  excludedAreas,
  onAddExcludedArea,
  onRemoveExcludedArea,
  onExcludedAreaChange,
  onDrawExcludedArea,
  drawingAreaId,
}) => {
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-2xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-300 mb-2">1. Upload Media (Image or Video &lt; 5s)</label>
          <input 
            id="file-upload"
            type="file" 
            accept="image/*,video/mp4,video/webm" 
            onChange={onFileChange} 
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition"
          />
        </div>
        <div>
          <label htmlFor="threshold" className="block text-sm font-medium text-gray-300 mb-2">2. Color Distance Threshold: {threshold}</label>
          <input 
            id="threshold"
            type="range" 
            min="0" 
            max="255" 
            value={threshold} 
            onChange={onThresholdChange} 
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0 (exact match)</span>
            <span>255 (any color)</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-700 pt-6">
        <label className="block text-sm font-medium text-gray-300 mb-3">3. Excluded Areas (Optional)</label>
        <div className="space-y-4">
          {excludedAreas.map((area) => (
            <div key={area.id} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
              <div>
                <label htmlFor={`x-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">X</label>
                <input id={`x-${area.id}`} type="number" value={area.x} onChange={(e) => onExcludedAreaChange(area.id, 'x', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
              </div>
              <div>
                <label htmlFor={`y-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Y</label>
                <input id={`y-${area.id}`} type="number" value={area.y} onChange={(e) => onExcludedAreaChange(area.id, 'y', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
              </div>
              <div>
                <label htmlFor={`width-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Width</label>
                <input id={`width-${area.id}`} type="number" value={area.width} onChange={(e) => onExcludedAreaChange(area.id, 'width', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
              </div>
              <div>
                <label htmlFor={`height-${area.id}`} className="block text-xs font-medium text-gray-400 mb-1">Height</label>
                <input id={`height-${area.id}`} type="number" value={area.height} onChange={(e) => onExcludedAreaChange(area.id, 'height', parseInt(e.target.value) || 0)} className="bg-gray-700 text-white rounded-md p-2 text-sm w-full" />
              </div>
              <button 
                onClick={() => onDrawExcludedArea(area.id)} 
                className={`rounded-md p-2 text-sm flex justify-center items-center transition ${
                  drawingAreaId === area.id 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {drawingAreaId === area.id ? 'Drawing...' : 'Draw'}
              </button>
              <button onClick={() => onRemoveExcludedArea(area.id)} className="bg-red-600 hover:bg-red-700 text-white rounded-md p-2 text-sm flex justify-center items-center transition">
                Remove
              </button>
            </div>
          ))}
        </div>
        {excludedAreas.length < 5 && (
          <button onClick={onAddExcludedArea} className="mt-3 w-full sm:w-auto px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-md text-sm transition">
            + Add Area
          </button>
        )}
      </div>

      <div className="mt-6 text-center border-t border-gray-700 pt-6">
        <button 
          onClick={onAnalyze} 
          disabled={!hasMedia || isProcessing}
          className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 ease-in-out flex items-center justify-center mx-auto"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {processingProgress ? `Analyzing Frames... (${processingProgress.current}/${processingProgress.total})` : 'Analyzing...'}
            </>
          ) : '4. Analyze Media'}
        </button>
      </div>
    </div>
  );
};

export default Controls;