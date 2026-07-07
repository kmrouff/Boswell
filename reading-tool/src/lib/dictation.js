// Client-side speech-to-text via the Web Speech API. Used for voice notes and
// title dictation — transcribes live on-device, no audio blob to store, which
// matches the "convert to text, discard audio" intent.
//
// NOTE: browser support varies — notably iOS Safari's support has historically
// been inconsistent. Callers must handle the unsupported / error paths.

const getRecognitionCtor = () =>
  (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

export const isDictationSupported = () => getRecognitionCtor() !== null;

// Starts dictation and returns a controller. `onResult` fires with the running
// transcript (final + interim) as the user speaks; `stop()` ends it. The
// returned `finalPromise` resolves with the final transcript once ended.
export const startDictation = ({ onResult } = {}) => {
  const Ctor = getRecognitionCtor();
  if (!Ctor) throw new Error('Dictation not supported on this browser');

  const recognition = new Ctor();
  recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  let finalText = '';

  const finalPromise = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      onResult?.((finalText + interim).trim());
    };
    recognition.onerror = (event) => {
      // "no-speech"/"aborted" are benign stops — resolve with whatever we have.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        reject(new Error('Microphone permission denied'));
      } else {
        resolve(finalText.trim());
      }
    };
    recognition.onend = () => resolve(finalText.trim());
  });

  recognition.start();

  return {
    stop: () => recognition.stop(),
    finalPromise,
  };
};
