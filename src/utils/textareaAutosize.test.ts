import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyTextareaAutosize,
  TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX,
} from "./textareaAutosize";

describe("applyTextareaAutosize", () => {
  let el: HTMLTextAreaElement;

  beforeEach(() => {
    el = document.createElement("textarea");
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it("устанавливает height по scrollHeight и overflow hidden ниже max", () => {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 60 });
    applyTextareaAutosize(el, TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX);
    expect(el.style.height).toBe("60px");
    expect(el.style.overflowY).toBe("hidden");
  });

  it("ограничивает height и включает overflow auto при scrollHeight выше max", () => {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 200 });
    applyTextareaAutosize(el, TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX);
    expect(el.style.height).toBe(`${TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX}px`);
    expect(el.style.overflowY).toBe("auto");
  });

  it("ничего не делает при null", () => {
    expect(() => applyTextareaAutosize(null)).not.toThrow();
  });
});
