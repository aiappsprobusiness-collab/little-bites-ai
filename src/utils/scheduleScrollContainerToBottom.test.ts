import { describe, it, expect } from "vitest";
import {
  scrollContainerToBottom,
  scheduleScrollContainerToBottom,
} from "./scheduleScrollContainerToBottom";

describe("scrollContainerToBottom", () => {
  it("выставляет scrollTop в разницу scrollHeight и clientHeight", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 100 });
    el.scrollTop = 0;
    scrollContainerToBottom(el);
    expect(el.scrollTop).toBe(400);
  });

  it("не уходит в отрицательный scrollTop", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 50 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 100 });
    el.scrollTop = 10;
    scrollContainerToBottom(el);
    expect(el.scrollTop).toBe(0);
  });
});

describe("scheduleScrollContainerToBottom", () => {
  it("не бросает при null", () => {
    expect(() => scheduleScrollContainerToBottom(null)).not.toThrow();
  });
});
