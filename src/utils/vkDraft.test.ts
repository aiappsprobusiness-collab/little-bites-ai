import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readVkDraftRaw,
  saveVkDraft,
  clearVkDraft,
  getVkDraftForProfilePrefill,
  markVkHandoffConsumed,
} from "./vkDraft";

const KEY = "lb.vkDraft.v1";

describe("vkDraft", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("save and read roundtrip", () => {
    saveVkDraft({
      vk_session_id: "sid-1",
      age_months: 18,
      allergies: ["яйца"],
      likes: ["овощи"],
      dislikes: [],
    });
    const d = readVkDraftRaw();
    expect(d?.age_months).toBe(18);
    expect(d?.allergies).toEqual(["яйца"]);
    expect(d?.vk_session_id).toBe("sid-1");
  });

  it("drops expired draft", () => {
    const past = Date.now() - 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        entry_point: "vk",
        created_at: past,
        expires_at: past,
        age_months: 12,
        allergies: [],
        likes: [],
        dislikes: [],
        dayPlanPreview: null,
        vk_session_id: "x",
      }),
    );
    expect(readVkDraftRaw()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("getVkDraftForProfilePrefill returns null when consumed", () => {
    saveVkDraft({
      vk_session_id: "s",
      age_months: 24,
      allergies: [],
      likes: [],
      dislikes: [],
      handoff_consumed: true,
    });
    expect(getVkDraftForProfilePrefill()).toBeNull();
  });

  it("markVkHandoffConsumed sets flag", () => {
    saveVkDraft({
      vk_session_id: "s2",
      age_months: 30,
      allergies: [],
      likes: [],
      dislikes: [],
    });
    expect(getVkDraftForProfilePrefill()).not.toBeNull();
    markVkHandoffConsumed();
    expect(getVkDraftForProfilePrefill()).toBeNull();
    const raw = readVkDraftRaw();
    expect(raw?.handoff_consumed).toBe(true);
  });
});
