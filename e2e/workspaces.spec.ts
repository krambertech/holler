import { signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test.describe.configure({ mode: "default" });

const seeded = ["closed", "closed", "closed", "live", "live", "live", "scheduled", "scheduled"];

for (const turn of ["first", "second"]) {
  test(`the ${turn} test to change the workspace starts from the seed`, async ({
    page,
    requestAs,
  }) => {
    const lead = await requestAs("lead");
    const state = async () => (await lead.get("/api/dev/state")).json();
    const before = await state();
    const statuses = before.hollers.map((holler: { status: string }) => holler.status).sort();
    expect(statuses, "another test changed this workspace").toEqual(seeded);

    await signInAs(page, "lead");
    const onThePage = await (await page.request.get("/api/dev/state")).json();
    expect(onThePage.workspace.id).toBe(before.workspace.id);

    const live = before.hollers.find((holler: { status: string }) => holler.status === "live");
    const closed = await lead.post(`/api/hollers/${live.id}/close`);
    expect(closed.status(), await closed.text()).toBe(200);
    const after = await state();
    expect(after.hollers.filter((h: { status: string }) => h.status === "closed")).toHaveLength(4);
  });
}
