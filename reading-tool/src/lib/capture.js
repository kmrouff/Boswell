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

// Region captured for the "log title" gesture: a fixed, centered,
// book-page-shaped (portrait) rectangle — not tied to the tap position, so
// it can't end up asymmetric/landscape-shaped from being clamped near an
// edge of the frame the way a point-centered box could.
const TITLE_CAPTURE_WIDTH_RATIO = 0.8;
const TITLE_CAPTURE_HEIGHT_RATIO = 0.7;

export const getTitleCaptureBounds = () => ({
  xMin: 0.5 - TITLE_CAPTURE_WIDTH_RATIO / 2,
  xMax: 0.5 + TITLE_CAPTURE_WIDTH_RATIO / 2,
  yMin: 0.5 - TITLE_CAPTURE_HEIGHT_RATIO / 2,
  yMax: 0.5 + TITLE_CAPTURE_HEIGHT_RATIO / 2,
});

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

// Raw (un-buffered) vertical extent of a drag — the region the user actually
// dragged over, before any buffer margin is added.
export const rawBoundsOf = (touchPath) => {
  const ys = touchPath.map((p) => p.y);
  return { min: Math.min(...ys), max: Math.max(...ys) };
};

// Two short captures made just below one another on the same (static) camera
// view can have their buffer margins collide — and if the lines are tightly
// packed, each buffer reaches into the *other's* actual text, so the same
// line ends up extracted into both passages (duplicated in search).
//
// Given two raw drag extents, returns the "chop line" — the midpoint of the
// gap between them — where the two buffers should be trimmed to meet, or null
// if no chop is needed (the raw regions themselves overlap/touch, meaning
// it's really one region; or their buffers don't actually collide).
//
// Chopping to this line only ever trims buffer margin, never raw content:
// the line sits inside the gap, below the upper raw region and above the
// lower one, so each capture keeps everything the user actually dragged over.
export const bufferOverlapChop = (rawA, rawB, bufferRatio = BUFFER_RATIO) => {
  const upper = rawA.min <= rawB.min ? rawA : rawB;
  const lower = rawA.min <= rawB.min ? rawB : rawA;

  // Raw regions overlap or touch → treat as the same region, don't chop.
  if (lower.min <= upper.max) return null;

  // Buffers must actually collide to need chopping.
  const upperBuffMax = Math.min(1, upper.max + bufferRatio);
  const lowerBuffMin = Math.max(0, lower.min - bufferRatio);
  if (upperBuffMax <= lowerBuffMin) return null;

  return { chopLine: (upper.max + lower.min) / 2 };
};

// Re-crops an already-captured JPEG data URL to a tighter vertical sub-region.
// `origBounds` are the normalized frame bounds the stored image spans;
// `newBounds` is the sub-region (⊂ origBounds) to keep. Used to retroactively
// chop a previous capture's buffer once a later overlapping capture reveals
// where the two should meet — without re-touching the camera.
export const cropImageRegion = (dataUrl, origBounds, newBounds) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const span = origBounds.yMax - origBounds.yMin || 1;
      const topFrac = (newBounds.yMin - origBounds.yMin) / span;
      const botFrac = (newBounds.yMax - origBounds.yMin) / span;
      const sy = Math.max(0, Math.round(topFrac * img.height));
      const sh = Math.max(1, Math.round((botFrac - topFrac) * img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, 0, sy, img.width, sh, 0, 0, img.width, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });

// Crops the current video frame to a [xMin, xMax] x [yMin, yMax] region (in
// the video's own pixel space) and returns a JPEG data URL. xMin/xMax default
// to the full width, for the normal full-width-band passage capture.
export const cropVideoFrame = (videoEl, bounds) => {
  const { videoWidth, videoHeight } = videoEl;
  const { yMin, yMax, xMin = 0, xMax = 1 } = bounds;
  const yMinPx = Math.round(yMin * videoHeight);
  const yMaxPx = Math.round(yMax * videoHeight);
  const xMinPx = Math.round(xMin * videoWidth);
  const xMaxPx = Math.round(xMax * videoWidth);
  const height = Math.max(1, yMaxPx - yMinPx);
  const width = Math.max(1, xMaxPx - xMinPx);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, xMinPx, yMinPx, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.9);
};
