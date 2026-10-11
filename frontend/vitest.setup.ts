import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = () => {};

// Animations add nothing to behaviour tests and slow down step changes.
MotionGlobalConfig.skipAnimations = true;
