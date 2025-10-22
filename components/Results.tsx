
import React from 'react';
import { RGBColor } from '../types';

interface ResultsProps {
  result: {
    dominantColor: RGBColor;
    percentage: number;
    isUniform?: boolean;
  } | null;
}

const rgbToHex = ({ r, g, b }: RGBColor): string => {
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const Results: React.FC<ResultsProps> = ({ result }) => {
  if (!result) return null;
  
  const hexColor = rgbToHex(result.dominantColor);

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-2xl mx-auto mt-8 text-center animate-fade-in">
      <h2 className="text-xl font-bold text-gray-200 mb-4">Analysis Results</h2>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
        <div className="flex items-center gap-4">
          <span className="font-medium text-gray-300">Dominant Color:</span>
          <div 
            className="w-10 h-10 rounded-md border-2 border-gray-500" 
            style={{ backgroundColor: hexColor }}
            title={hexColor}
          ></div>
          <span className="font-mono text-indigo-400">{hexColor}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-300">Coverage:</span>
          <span className="text-2xl font-bold text-indigo-400">{result.percentage.toFixed(2)}%</span>
        </div>
        {result.isUniform !== undefined && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-300">Uniform:</span>
            <span className={`text-xl font-bold ${result.isUniform ? 'text-green-400' : 'text-red-400'}`}>
              {result.isUniform ? 'Yes' : 'No'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Results;
