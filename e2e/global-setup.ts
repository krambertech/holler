import { E2E_CHECKOUT, E2E_PORT } from "./origin";
import { foreignServerProblem } from "./own-server.mts";

export default function refuseForeignServer() {
  if (process.env.CI) return;
  const problem = foreignServerProblem(E2E_PORT, E2E_CHECKOUT);
  if (problem) throw new Error(problem);
}
