import { Point, ExcludedArea } from '../types';

// Function to convert ImageData to grayscale
export const toGrayscale = (imageData: ImageData): Uint8ClampedArray => {
  const grayscaleData = new Uint8ClampedArray(imageData.width * imageData.height);
  const data = imageData.data;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminosity method for better visual representation of grayscale
    const avg = 0.299 * r + 0.587 * g + 0.114 * b;
    grayscaleData[j] = avg;
  }
  return grayscaleData;
};

// Sobel Edge Detection
export const sobel = (
  grayscaleData: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  excludedAreas: ExcludedArea[] = []
): Point[] => {
  const edgePoints: Point[] = [];
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let inExcludedArea = false;
      for (const area of excludedAreas) {
        if (x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height) {
          inExcludedArea = true;
          break;
        }
      }
      if (inExcludedArea) continue;

      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIndex = (y + ky) * width + (x + kx);
          const pixelValue = grayscaleData[pixelIndex];
          gx += pixelValue * sobelX[ky + 1][kx + 1];
          gy += pixelValue * sobelY[ky + 1][kx + 1];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude > threshold) {
        edgePoints.push({ x, y });
      }
    }
  }
  return edgePoints;
};