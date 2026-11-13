// Prevent delayed responses from a previous account from expiring the current account.
let generation = 0;
export function getSessionGeneration() {
  return generation;
}
export function advanceSessionGeneration() {
  return ++generation;
}
