import { ApiKeysSection } from "./api-keys-section";
import { ConnectedAppsSection } from "./connected-apps-section";

/** The API and MCP area's part of Settings: one import and one line in settings.tsx. */
export function ApiAccessSections() {
  return (
    <>
      <ApiKeysSection />
      <ConnectedAppsSection />
    </>
  );
}
