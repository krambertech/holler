import { E2E_CHECKOUT, E2E_PORT } from "./origin";
import { foreignServerProblem } from "./own-server.mjs";

export default function refuseForeignServer() {
  const problem = foreignServerProblem(E2E_PORT, E2E_CHECKOUT);
  if (problem) throw new Error(problem);
}
