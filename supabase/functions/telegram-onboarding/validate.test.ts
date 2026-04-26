import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseAgeMonths, parseUpdate, splitCsvTags, updateToInboundEvent } from "./validate.ts";

Deno.test("parseUpdate rejects malformed payload", () => {
  const r = parseUpdate({ foo: 1 });
  assertEquals(r.ok, false);
});

Deno.test("updateToInboundEvent maps text message", () => {
  const r = parseUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: 123 },
      from: { id: 777 },
      text: " /start ",
    },
  });
  if (!r.ok) throw new Error("expected ok");
  const event = updateToInboundEvent(r.update);
  if (!event || event.kind !== "message") throw new Error("expected message");
  assertEquals(event.chat_id, 123);
  assertEquals(event.text, "/start");
});

Deno.test("updateToInboundEvent maps callback_query", () => {
  const r = parseUpdate({
    update_id: 2,
    callback_query: {
      id: "cq1",
      from: { id: 9 },
      message: { message_id: 55, chat: { id: 123 } },
      data: "age:0",
    },
  });
  if (!r.ok) throw new Error("expected ok");
  const event = updateToInboundEvent(r.update);
  if (!event || event.kind !== "callback") throw new Error("expected callback");
  assertEquals(event.callback_query_id, "cq1");
  assertEquals(event.message_id, 55);
  assertEquals(event.data, "age:0");
});

Deno.test("parseAgeMonths supports months and years", () => {
  assertEquals(parseAgeMonths("18"), 18);
  assertEquals(parseAgeMonths("2 years"), 24);
  assertEquals(parseAgeMonths("1 год"), 12);
  assertEquals(parseAgeMonths("3"), null);
});

Deno.test("splitCsvTags normalizes tokens", () => {
  const tags = splitCsvTags(" Яйца, яйца, Орехи ");
  assertEquals(tags, ["яйца", "орехи"]);
});
