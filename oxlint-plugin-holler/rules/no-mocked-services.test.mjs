import { testRule } from "../test/run.mjs";

const filename = "v1.test.ts";

testRule("no-mocked-services", {
  message:
    "A mock of our own module keeps passing when the real one breaks. Run the real service: testDb() " +
    "from src/server/test-db.ts, deliveryEnv() from src/server/test-delivery.ts for anything that sends, " +
    "and the FakeSlack that devSlack() returns. Then assert what was stored, sent to Slack or returned.",
  valid: [
    { filename, code: 'import { sendHoller } from "../services/delivery"; await sendHoller();' },
    { filename, code: 'vi.mock("nodemailer", () => ({}));' },
    { filename, code: 'vi.spyOn(console, "error").mockImplementation(() => {});' },
    { filename, code: 'vi.useFakeTimers({ toFake: ["Date"] });' },
    { filename, code: "const message = { ack: vi.fn(), retry: vi.fn() };" },
    { filename, code: 'const { revokeApiKey } = await import("../services/api-keys");' },
  ],
  invalid: [
    {
      filename,
      code: 'vi.mock("../../services/delivery", async () => ({ sendHoller: vi.fn() }));',
      errors: ['"../../services/delivery"'],
    },
    {
      filename,
      code: 'vi.mock(import("../services/exports"));',
      errors: ['import("../services/exports")'],
    },
    { filename, code: 'vi.doMock("./delivery");', errors: ['"./delivery"'] },
    { filename, code: "vi.mock(`../services/delivery`);", errors: ["`../services/delivery`"] },
    { filename, code: 'vi.mock("@holler/core");', errors: ['"@holler/core"'] },
    {
      filename,
      code: 'import * as delivery from "../services/delivery"; vi.spyOn(delivery, "sendHoller");',
      errors: ["delivery"],
    },
    {
      filename,
      code: 'const delivery = await import("../services/delivery"); vi.spyOn(delivery, "sendHoller");',
      errors: ["delivery"],
    },
  ],
});
