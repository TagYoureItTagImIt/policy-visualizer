
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="text-center p-4 sm:p-6">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 tracking-tight">Policies Visualization Tool</h1>
      <p className="text-md text-gray-400 mt-2">Upload an image or video to visualize policy thresholds for troubleshooting.</p>
    </header>
  );
};

export default Header;