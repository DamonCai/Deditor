/** Map XMind's structureClass string to the rendering direction we hand to
 *  mind-elixir. XMind has many structures (logic.right, brace.right, map,
 *  org-chart-down, fishbone, …); mind-elixir only knows three directions
 *  (RIGHT, LEFT, SIDE). We pick the closest match so a right-flow XMind tree
 *  stays right-flow rather than turning into an alternating snake.
 *
 *  We expose this as a normalized string ("right" | "left" | "side" | "down")
 *  so the renderer doesn't import the mind-elixir constants from this layer. */
export type Direction = "right" | "left" | "side" | "down";

export function structureToDirection(sc: string | undefined): Direction {
  if (!sc) return "right";
  const s = sc.toLowerCase();
  if (s.includes(".left")) return "left";
  if (s.includes(".right")) return "right";
  if (s.includes("org-chart-down") || s.includes("tree.down")) return "down";
  if (s.includes("unbalanced") || s.includes("clockwise") || s.includes("anti-clockwise")) {
    return "side";
  }
  // Org-chart / timeline / spreadsheet have no clean equivalent — right-flow
  // is the safest default (looks like a tree rather than a snake).
  return "right";
}
