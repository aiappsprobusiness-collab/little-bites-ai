import { describe, it, expect } from "vitest";
import {
  buildTelegramBloggerDeepLink,
  buildTelegramStartPayload,
  TELEGRAM_START_MAX_BYTES,
} from "./telegramBloggerLink";

describe("buildTelegramStartPayload", () => {
  it("builds short payload and respects blogger_id", () => {
    const { payload, error } = buildTelegramStartPayload({ bloggerId: "a1" });
    expect(error).toBeUndefined();
    expect(payload).toBe("blogger_id=a1");
  });

  it("rejects empty blogger_id", () => {
    const { error } = buildTelegramStartPayload({ bloggerId: "  " });
    expect(error).toBeDefined();
  });

  it("fails if payload too long for Telegram", () => {
    const longId = "x".repeat(TELEGRAM_START_MAX_BYTES);
    const { error } = buildTelegramStartPayload({ bloggerId: longId });
    expect(error).toBeDefined();
  });
});

describe("buildTelegramBloggerDeepLink", () => {
  it("strips @ from username", () => {
    const url = buildTelegramBloggerDeepLink("@MyTestBot", "blogger_id=a1");
    expect(url).toContain("https://t.me/MyTestBot?start=blogger_id%3Da1");
  });
});
