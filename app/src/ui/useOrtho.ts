import { useLiveQuery } from "dexie-react-hooks";
import { orthoEnabled } from "../lib/ortho";
import { IS_ORTHO_PRESET } from "../preset";

/** Whether orthodontic tools are switched on (default: on for orthodontic clinics). */
export function useOrtho(): boolean {
  return useLiveQuery(orthoEnabled, []) ?? IS_ORTHO_PRESET;
}
