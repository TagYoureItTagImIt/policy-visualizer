import React, { useState } from 'react';
import Header from './components/Header';
import Tabs from './components/Tabs';
import ColorUniformityAnalyzer from './components/ColorUniformityAnalyzer';
import MotionDetectionAnalyzer from './components/MotionDetectionAnalyzer';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('colorUniformity');

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-8">
      <div className="container mx-auto">
        <Header />
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="mt-8">
          {activeTab === 'colorUniformity' && <ColorUniformityAnalyzer />}
          {activeTab === 'motionDetection' && <MotionDetectionAnalyzer />}
        </main>
      </div>
    </div>
  );
};

export default App;
