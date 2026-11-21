import { describe, expect, it } from "vitest";
import { parseTimeOfDay, timeKey, timeOptions, timeSlots } from "./time-of-day";

const keys = (times: { hour: number; minute: number }[]) => times.map(timeKey);

describe("timeSlots", () => {
  it("covers the day in 15-minute steps", () => {
    const slots = timeSlots();
    expect(slots).toHaveLength(96);
    expect(timeKey(slots[0] ?? { hour: -1, minute: 0 })).toBe("00:00");
    expect(timeKey(slots[95] ?? { hour: -1, minute: 0 })).toBe("23:45");
  });
});

describe("parseTimeOfDay", () => {
  it.each([
    ["9", "09:00"],
    ["09", "09:00"],
    ["9:30", "09:30"],
    ["9.30", "09:30"],
    ["930", "09:30"],
    ["0930", "09:30"],
    ["1745", "17:45"],
    ["21h", "21:00"],
    ["21h15", "21:15"],
    ["9pm", "21:00"],
    ["9:30 am", "09:30"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["9:", "09:00"],
  ])("reads %s as %s", (typed, expected) => {
    const time = parseTimeOfDay(typed);
    expect(time && timeKey(time)).toBe(expected);
  });

  it.each(["", "noon", "24", "9:75", "13pm", "9:3", "12345", "-1"])("refuses %s", (typed) => {
    expect(parseTimeOfDay(typed)).toBeNull();
  });
});

describe("timeOptions", () => {
  it("offers the whole day when nothing is typed", () => {
    expect(timeOptions("")).toHaveLength(96);
  });

  it("offers the hour typed, morning and evening", () => {
    expect(keys(timeOptions("9"))).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
      "21:00",
      "21:15",
      "21:30",
      "21:45",
    ]);
  });

  it("puts a time off the steps first, then the rest of its hour", () => {
    expect(keys(timeOptions("9:40pm"))).toEqual(["21:40", "21:45"]);
  });

  it("offers nothing for words that are not a time", () => {
    expect(timeOptions("soon")).toEqual([]);
  });
});
