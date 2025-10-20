export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface FrameAnalysisResult {
  time: number;
  dominantColor: RGBColor;
  percentage: number;
  newImageData: ImageData;
}

export interface ExcludedArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// New types for Motion Detection
export interface Point {
  x: number;
  y: number;
}

export interface MotionFrameAnalysisResult {
  frame: number;
  time: number;
  changedPercentage: number;
  motionDetected: boolean;
  lowConfidence: boolean;
  // For visualization
  stablePoints: Point[];
  movedPoints: Point[];
}