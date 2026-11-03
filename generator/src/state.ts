/** Split a block state such as `minecraft:oak_stairs[facing=east,half=bottom]` into its name and properties. */
export function parseState(state: string): { name: string; properties: Record<string, string> } {
  const open = state.indexOf("[");
  if (open === -1) return { name: state, properties: {} };
  const props = state.slice(open + 1, state.endsWith("]") ? -1 : undefined);
  const properties: Record<string, string> = {};
  for (const pair of props.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) properties[key.trim()] = value.trim();
  }
  return { name: state.slice(0, open), properties };
}
