// Persistent record button, always visible on the Capture screen,
// independent of the drag/tap gestures. Disabled until at least one passage
// exists, since a voice note has nothing to attach to before then.
export default function VoiceRecordButton({ isRecording, disabled, onToggle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-label={isRecording ? 'Stop recording' : 'Record voice note'}
      className={`absolute bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${
        disabled
          ? 'border-parchment/15 bg-black/40 opacity-40'
          : isRecording
            ? 'border-red-400 bg-red-500/20'
            : 'border-parchment/40 bg-black/60'
      }`}
    >
      <span
        className={`bg-red-500 transition-all ${
          isRecording ? 'h-4 w-4 rounded-sm animate-pulse' : 'h-5 w-5 rounded-full'
        }`}
      />
    </button>
  );
}
