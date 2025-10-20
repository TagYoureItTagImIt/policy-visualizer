import React from 'react';
import { FrameAnalysisResult, RGBColor } from '../types';

interface FrameResultsListProps {
  results: FrameAnalysisResult[];
  onFrameSelect: (time: number) => void;
  currentTime: number;
}

const rgbToHex = ({ r, g, b }: RGBColor): string => {
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toFixed(2).toString().padStart(5, '0');
  return `${mins}:${secs}`;
};

const FrameResultsList: React.FC<FrameResultsListProps> = ({ results, onFrameSelect, currentTime }) => {
  const currentFrameIndex = results.findIndex((frame, index) => {
    const nextFrame = results[index + 1];
    return currentTime >= frame.time && (!nextFrame || currentTime < nextFrame.time);
  });

  return (
    <div className="w-full max-w-5xl mx-auto mt-8">
      <h3 className="text-lg font-semibold text-gray-300 mb-2 text-center">Frame-by-Frame Analysis</h3>
      <div className="bg-gray-800 rounded-lg shadow-lg max-h-80 overflow-y-auto p-2">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs text-gray-400 uppercase bg-gray-700 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-4 py-2">Timestamp</th>
              <th scope="col" className="px-4 py-2">Dominant Color</th>
              <th scope="col" className="px-4 py-2 text-right">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr 
                key={result.time} 
                onClick={() => onFrameSelect(result.time)}
                className={`border-b border-gray-700 hover:bg-gray-600 cursor-pointer transition-colors ${index === currentFrameIndex ? 'bg-indigo-900/50' : ''}`}
              >
                <td className="px-4 py-2 font-mono">{formatTime(result.time)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-5 h-5 rounded border border-gray-500"
                      style={{ backgroundColor: rgbToHex(result.dominantColor) }}
                    />
                    <span className="font-mono">{rgbToHex(result.dominantColor)}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono">{result.percentage.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FrameResultsList;
