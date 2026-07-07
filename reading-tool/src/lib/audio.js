// Starts recording immediately and returns a controller: call stop() when
// done, then await stopPromise for the resulting { dataUrl, mimeType }.
export const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result, mimeType: blob.type });
      reader.readAsDataURL(blob);
    };
  });

  mediaRecorder.start();

  return {
    stop: () => mediaRecorder.stop(),
    stopPromise,
  };
};
