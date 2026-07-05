// Minimum vertical movement (as a fraction of frame height) required for a
// drag to count as an intentional selection rather than an accidental tap.
export const MIN_DRAG_DELTA = 0.03;

// Buffer margin added above/below the raw drag bounds so text right at the
// edge of the gesture doesn't get clipped. Used for the actual crop sent
// for extraction.
export const BUFFER_RATIO = 0.05;

// Smaller buffer used only for the on-screen flash/tick feedback, so the
// capture *looks* tight to what was actually dragged, even though the real
// crop underneath is more generous.
export const VISUAL_BUFFER_RATIO = 0.015;

// Half-height of the band captured around a single point for the
// double-tap-and-hold "log title" gesture (there's no drag extent to work
// from, so we just grab a modest fixed band around the touch point).
export const TITLE_CAPTURE_HALF_HEIGHT = 0.05;

export const normalizePoint = (clientX, clientY, rect) => ({
  x: (clientX - rect.left) / rect.width,
  y: (clientY - rect.top) / rect.height,
});

export const isMeaningfulDrag = (touchPath, minDelta = MIN_DRAG_DELTA) => {
  if (touchPath.length < 2) return false;
  const ys = touchPath.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys) >= minDelta;
};

export const computeSelectionBounds = (touchPath, bufferRatio = BUFFER_RATIO) => {
  const ys = touchPath.map((p) => p.y);
  return {
    yMin: Math.max(0, Math.min(...ys) - bufferRatio),
    yMax: Math.min(1, Math.max(...ys) + bufferRatio),
  };
};

// Crops the current video frame to the full width x [yMin, yMax] vertical
// band (in the video's own pixel space) and returns a JPEG data URL.
export const cropVideoFrame = (videoEl, selectionBounds) => {
  const { videoWidth, videoHeight } = videoEl;
  const yMinPx = Math.round(selectionBounds.yMin * videoHeight);
  const yMaxPx = Math.round(selectionBounds.yMax * videoHeight);
  const height = Math.max(1, yMaxPx - yMinPx);

  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, yMinPx, videoWidth, height, 0, 0, videoWidth, height);
  return canvas.toDataURL('image/jpeg', 0.9);
};

// Scales a JPEG data URL down to at most maxWidthPx wide, for storing a
// lightweight thumbnail alongside a passage rather than the full crop.
export const createThumbnail = (dataUrl, maxWidthPx = 400) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidthPx / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
