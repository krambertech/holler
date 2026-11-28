import { describe, expect, it } from "vitest";
import {
  anonymousWarning,
  answeredInLabel,
  atWallClock,
  audienceReach,
  closeSummary,
  composeBarSummary,
  countedReach,
  durationLabel,
  landingTimes,
  reachLabel,
  remindersBeforeClose,
  remindersSummary,
  sendActionLabel,
  sendBarSummary,
  sendSummary,
  senderZoneFor,
  wallClock,
  webReason,
  zoneName,
} from "./send-logic";

const locale = "en-GB";
const senderZone = "Europe/Berlin";
const now = new Date("2025-11-21T09:00:00Z");
const ctx = { now, senderZone, zones: [], locale };

const fields = {
  sendAt: null,
  sendInRecipientTimeZone: false,
  closesAt: null,
  closeAfterHours: 72,
};

describe("time zones", () => {
  it("reads and finds wall-clock times", () => {
    expect(wallClock(now, "Europe/Berlin")).toEqual({
      year: 2025,
      month: 11,
      day: 21,
      hour: 10,
      minute: 0,
    });
    const nine = { year: 2025, month: 11, day: 24, hour: 9, minute: 0 };
    expect(atWallClock(nine, "America/New_York").toISOString()).toBe("2025-11-24T14:00:00.000Z");
    expect(atWallClock(nine, "Asia/Tokyo").toISOString()).toBe("2025-11-24T00:00:00.000Z");
  });

  it("lands on the right hour either side of a daylight-saving change", () => {
    const before = { year: 2025, month: 3, day: 29, hour: 9, minute: 0 };
    const after = { year: 2025, month: 3, day: 31, hour: 9, minute: 0 };
    expect(atWallClock(before, senderZone).toISOString()).toBe("2025-03-29T08:00:00.000Z");
    expect(atWallClock(after, senderZone).toISOString()).toBe("2025-03-31T07:00:00.000Z");
  });

  it("names a zone by its city", () => {
    expect(zoneName("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneName("UTC")).toBe("UTC");
  });
});

describe("landingTimes", () => {
  const sendAt = new Date("2025-11-24T08:00:00Z");
  const zones = [
    { zone: "America/New_York", people: 3 },
    { zone: "Europe/Berlin", people: 8 },
    { zone: null, people: 1 },
    { zone: "Asia/Tokyo", people: 2 },
  ];

  it("in your time, reaches everyone at once and flags a time outside their workday", () => {
    const rows = landingTimes({ sendAt, inRecipientTimeZone: false, senderZone, zones, now });
    expect(rows.every((r) => r.at.getTime() === sendAt.getTime())).toBe(true);
    const byZone = Object.fromEntries(rows.map((r) => [r.zone, r]));
    expect(byZone["America/New_York"]?.outsideWorkday).toBe(true);
    expect(byZone["Asia/Tokyo"]?.outsideWorkday).toBe(false);
    expect(byZone["Europe/Berlin"]).toMatchObject({ people: 8, yours: true });
    expect(byZone.UTC).toMatchObject({ people: 1, yours: false });
    expect(rows.map((r) => r.zone)).toEqual([
      "America/New_York",
      "UTC",
      "Europe/Berlin",
      "Asia/Tokyo",
    ]);
  });

  it("in each person's time, reaches each zone at 09:00 on its clock, earliest first", () => {
    const rows = landingTimes({ sendAt, inRecipientTimeZone: true, senderZone, zones, now });
    expect(rows.map((r) => [r.zone, r.at.toISOString()])).toEqual([
      ["Asia/Tokyo", "2025-11-24T00:00:00.000Z"],
      ["Europe/Berlin", "2025-11-24T08:00:00.000Z"],
      ["UTC", "2025-11-24T09:00:00.000Z"],
      ["America/New_York", "2025-11-24T14:00:00.000Z"],
    ]);
    expect(rows.some((r) => r.passed)).toBe(false);
  });

  it("marks a zone whose moment has passed", () => {
    const soon = new Date("2025-11-21T09:30:00Z");
    const rows = landingTimes({ sendAt: soon, inRecipientTimeZone: true, senderZone, zones, now });
    expect(rows.find((r) => r.zone === "Asia/Tokyo")?.passed).toBe(true);
    expect(rows.find((r) => r.zone === "America/New_York")?.passed).toBe(false);
  });
});

describe("sendSummary", () => {
  it("sends now by default", () => {
    expect(sendSummary(fields, ctx)).toEqual({ value: "Now", description: "when you press Send" });
  });

  it("says a scheduled time in the sender's zone", () => {
    const sendAt = new Date("2025-11-24T08:00:00Z");
    expect(sendSummary({ ...fields, sendAt }, ctx)).toEqual({
      value: "Mon 24 Nov, 09:00",
      description: "your time",
    });
  });

  it("flags a time that has passed", () => {
    const sendAt = new Date("2025-11-21T08:00:00Z");
    expect(sendSummary({ ...fields, sendAt }, ctx).tone).toBe("danger");
  });

  it("gives the spread on the sender's clock in each person's time", () => {
    const sendAt = new Date("2025-11-24T08:00:00Z");
    const zones = [
      { zone: "Europe/London", people: 2 },
      { zone: "America/New_York", people: 1 },
    ];
    expect(
      sendSummary({ ...fields, sendAt, sendInRecipientTimeZone: true }, { ...ctx, zones }),
    ).toEqual({
      value: "Mon 24 Nov, 09:00",
      description: "each person's own time, from 10:00 to 15:00 yours",
    });
  });

  it("lets the server's problem speak", () => {
    expect(sendSummary(fields, ctx, "Pick a later time.")).toMatchObject({ tone: "danger" });
  });
});

describe("closeSummary", () => {
  it("closes a preset after it sends", () => {
    expect(closeSummary(fields, ctx)).toEqual({
      value: "Mon 24 Nov, 10:00",
      description: "3 days after it sends",
    });
  });

  it("closes after the last person gets it when time zones spread the send", () => {
    const sendAt = new Date("2025-11-24T08:00:00Z");
    const zones = [{ zone: "America/New_York", people: 1 }];
    const summary = closeSummary(
      { ...fields, sendAt, sendInRecipientTimeZone: true, closeAfterHours: 24 },
      { ...ctx, zones: [...zones, { zone: senderZone, people: 1 }] },
    );
    expect(summary).toEqual({
      value: "Tue 25 Nov, 15:00",
      description: "1 day after the last person gets it",
    });
  });

  it("flags a fixed close time that has passed, is before it sends, or is too soon", () => {
    const past = closeSummary({ ...fields, closesAt: new Date("2025-11-20T17:00:00Z") }, ctx);
    expect(past).toMatchObject({
      tone: "danger",
      description: "That time has passed. Pick a later one.",
    });

    const sendAt = new Date("2025-11-24T08:00:00Z");
    const early = closeSummary(
      { ...fields, sendAt, closesAt: new Date("2025-11-23T17:00:00Z") },
      ctx,
    );
    expect(early).toMatchObject({
      tone: "danger",
      description: "That is before it sends. Pick a later time.",
    });

    const soon = closeSummary({ ...fields, closesAt: new Date("2025-11-21T09:30:00Z") }, ctx);
    expect(soon.tone).toBe("warning");

    const fine = closeSummary({ ...fields, closesAt: new Date("2025-11-28T16:00:00Z") }, ctx);
    expect(fine).toEqual({ value: "Fri 28 Nov, 17:00", description: "on the date you picked" });
  });
});

describe("durations and reminders", () => {
  it("names durations without building plurals", () => {
    expect([1, 12, 24, 72, 168, 336].map(durationLabel)).toEqual([
      "1 hour",
      "12 hours",
      "1 day",
      "3 days",
      "1 week",
      "2 weeks",
    ]);
  });

  it("counts the reminders that fit before the quiet time", () => {
    expect(remindersBeforeClose(24)).toBe(0);
    expect(remindersBeforeClose(72)).toBe(1);
    expect(remindersBeforeClose(74)).toBe(2);
    expect(remindersBeforeClose(168)).toBe(3);
  });

  it("says the rhythm in plain words", () => {
    expect(remindersSummary(false, 168)).toEqual({
      value: "Off",
      description: "nobody gets a reminder",
    });
    expect(remindersSummary(true, 24).description).toBe("it closes before the first one is due");
    expect(remindersSummary(true, 72).description).toBe("a day in, to anyone still waiting");
    expect(remindersSummary(true, 168).description).toBe(
      "a day, three days and five days in, to anyone still waiting",
    );
  });
});

describe("reach", () => {
  const sizes: Record<string, number | null> = { S_DESIGN: 11, C_GENERAL: null };
  const sizeOf = (id: string) => sizes[id];

  it("counts people exactly and groups as a ceiling", () => {
    const people = audienceReach(
      { people: ["U1", "U2"], groups: [], everyone: false },
      sizeOf,
      200,
    );
    expect(people).toEqual({ count: 2, exact: true, everyone: false, unknown: false });
    expect(reachLabel(people)).toBe("2 people");

    const groups = audienceReach(
      { people: ["U1", "U2", "U3"], groups: ["S_DESIGN"], everyone: false },
      sizeOf,
      200,
    );
    expect(groups).toEqual({ count: 14, exact: false, everyone: false, unknown: false });
    const unsized = audienceReach(
      { people: ["U1"], groups: ["C_GENERAL"], everyone: false },
      sizeOf,
      200,
    );
    expect(unsized).toEqual({ count: 1, exact: false, everyone: false, unknown: true });
    expect(reachLabel(unsized)).toBe("Size not known yet");
    expect(sendActionLabel(unsized, false)).toBe("Send");
    expect(reachLabel(groups)).toBe("About 14 people");
  });

  it("reads everyone as the workspace", () => {
    const all = audienceReach({ people: ["U1"], groups: [], everyone: true }, sizeOf, 214);
    expect(reachLabel(all)).toBe("214 people");
    expect(
      reachLabel(audienceReach({ people: [], groups: [], everyone: true }, sizeOf, null)),
    ).toBe("Everyone in the workspace");
  });

  it("names the reach on the button", () => {
    expect(
      sendActionLabel({ count: 14, exact: false, everyone: false, unknown: false }, false),
    ).toBe("Send to about 14 people");
    expect(sendActionLabel({ count: 1, exact: true, everyone: false, unknown: false }, true)).toBe(
      "Schedule for 1 person",
    );
    expect(
      sendActionLabel({ count: 214, exact: true, everyone: true, unknown: false }, false),
    ).toBe("Send to everyone");
    expect(sendActionLabel({ count: 0, exact: true, everyone: false, unknown: false }, false)).toBe(
      "Send",
    );
  });

  it("drops about once Slack has counted the people in the groups", () => {
    const counted = countedReach(false, 9);
    expect(reachLabel(counted)).toBe("9 people");
    expect(sendActionLabel(counted, false)).toBe("Send to 9 people");
    expect(sendActionLabel(countedReach(false, 1), true)).toBe("Schedule for 1 person");
    expect(reachLabel(countedReach(true, 48))).toBe("48 people");
    expect(sendActionLabel(countedReach(true, 48), false)).toBe("Send to everyone");
  });

  it("warns an anonymous Holler under five people", () => {
    expect(anonymousWarning(true, { count: 3, exact: true, everyone: false, unknown: false })).toBe(
      "Results open at 5 answers, and only 3 people get this. Add people or make it named.",
    );
    expect(
      anonymousWarning(true, { count: 5, exact: true, everyone: false, unknown: false }),
    ).toBeNull();
    expect(
      anonymousWarning(false, { count: 3, exact: true, everyone: false, unknown: false }),
    ).toBeNull();
    expect(
      anonymousWarning(true, { count: 0, exact: true, everyone: false, unknown: false }),
    ).toBeNull();
  });
});

describe("the bar", () => {
  it("says where Compose's Holler is answered, or what to fix", () => {
    expect(composeBarSummary({ where: "dm" }, 1)).toEqual({
      title: "Answered in the Slack message",
      description: "1 question",
    });
    expect(composeBarSummary({ where: "slack" }, 4, "Give it a title.")).toEqual({
      title: "Give it a title.",
      description: null,
      tone: "danger",
    });
  });

  it("says who, when and when it closes on Send", () => {
    expect(
      sendBarSummary({ count: 14, exact: true, everyone: false, unknown: false }, fields, ctx),
    ).toEqual({
      title: "14 people, now",
      description: "Closes Mon 24 Nov, 10:00",
    });
    expect(
      sendBarSummary({ count: 214, exact: true, everyone: true, unknown: false }, fields, ctx)
        .title,
    ).toBe("Everyone, now");
  });

  it("explains a web page", () => {
    const web = { where: "web", question: 1, why: "conditional_follow_up" } as const;
    expect(answeredInLabel(web)).toBe("Answered on a web page");
    expect(webReason(web)).toBe(
      "Question 2 shows its note only after some answers, which a Slack form cannot do.",
    );
    expect(webReason({ where: "dm" })).toBeNull();
  });
});

describe("the sender's clock", () => {
  it("reads send times on the sender's Slack time zone, as delivery does", () => {
    expect(senderZoneFor("America/New_York", "Europe/London")).toBe("America/New_York");
  });

  it("falls back to the browser's zone when Slack has none or an unknown one", () => {
    expect(senderZoneFor(null, "Europe/London")).toBe("Europe/London");
    expect(senderZoneFor("Mars/Olympus", "Europe/London")).toBe("Europe/London");
  });
});
