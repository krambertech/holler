import type { FullConfig } from "@playwright/test";

/** Signs in as each persona once, in order, so parallel tests find them already made and seeded. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5290";
  for (const persona of ["lead", "sender"]) {
    const response = await fetch(`${baseURL}/api/dev/sign-in?as=${persona}`, {
      redirect: "manual",
    });
    if (response.status !== 302)
      throw new Error(`Could not make the ${persona} persona: ${response.status}`);
  }
}
