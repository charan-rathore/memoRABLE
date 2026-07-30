import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest runs with `globals: false`, so React Testing Library's automatic
// cleanup never registers — without this, every render() in a file appends
// to the same document and queries start matching previous tests' DOM.
afterEach(() => {
  cleanup();
});
