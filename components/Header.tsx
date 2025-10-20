
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="text-center p-4 sm:p-6">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 tracking-tight">Image Color Uniformity Analyzer</h1>
      <p className="text-md text-gray-400 mt-2">Upload an image to find its most dominant color.</p>
    </header>
  );
};

export default Header;
