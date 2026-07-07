// Persistent record button, always visible on the Capture screen, independent
// of the drag/tap gestures. In `dictation` mode (used while in title mode, to
// speak a title rather than attach an audio note) it turns amber to signal the
// different purpose.
export default function VoiceRecordButton({ isRecording, disabled, dictation, onToggle }) {
  const dotColor = dictation ? 'bg-amber-400' : 'bg-red-500';
  const activeBorder = dictation ? 'border-amber-300 bg-amber-400/20' : 'border-red-400 bg-red-500/20';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-label={
        dictation
          ? isRecording ? 'Stop dictating title' : 'Dictate title'
          : isRecording ? 'Stop recording' : 'Record voice note'
      }
      className={`absolute bottom-12 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${
        disabled
          ? 'border-parchment/15 bg-black/40 opacity-40'
          : isRecording
            ? activeBorder
            : 'border-parchment/40 bg-black/60'
      }`}
    >
      <span
        className={`${dotColor} transition-all ${
          isRecording ? 'h-4 w-4 rounded-sm animate-pulse' : 'h-5 w-5 rounded-full'
        }`}
      />
    </button>
  );
}
