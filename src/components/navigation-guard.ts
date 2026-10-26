export function mayLeaveEditor() {
  return window.dispatchEvent(
    new Event("workspace:navigate", { cancelable: true }),
  );
}
