/** Own one operation at a time. Superseding work invalidates even APIs that ignore abort. */
export function createAsyncOperation() {
  let current: AbortController | null = null;
  return {
    begin() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted,
      };
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}
