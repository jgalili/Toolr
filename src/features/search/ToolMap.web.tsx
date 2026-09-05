/**
 * Platform shim.
 *
 * The implementation lives in ToolMapView because it is now the same on every
 * platform -- StreetMap handles the web/native split one layer down. This file
 * and its .web sibling exist only so that a stale copy of the old web-only
 * ToolMap, which drew a schematic map, cannot shadow the real one on somebody's
 * machine after an update.
 */
export { ToolMap } from './ToolMapView';
