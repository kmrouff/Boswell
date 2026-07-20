// Module-level (not component-state) list of captures still being
// read/saved — { id, stackId, capturedAt }[]. Needs to be here, not just a
// fire-and-forget window event, because captures only ever happen while
// CaptureView is mounted (the Capture tab is active), which means
// LibraryView is *always* unmounted at that moment and mounts fresh only
// once the user switches tabs — by which point a plain event would already
// have fired and gone unheard. Reading this module's current state at mount
// time (see LibraryView) catches anything already in flight; the
// 'pending-captures-changed' event covers updates while already mounted.
let pending = [];

export const getPendingCaptures = () => pending;

export const addPendingCapture = (entry) => {
  pending = [entry, ...pending];
  window.dispatchEvent(new CustomEvent('pending-captures-changed'));
};

export const removePendingCapture = (id) => {
  if (!pending.some((p) => p.id === id)) return;
  pending = pending.filter((p) => p.id !== id);
  window.dispatchEvent(new CustomEvent('pending-captures-changed'));
};
