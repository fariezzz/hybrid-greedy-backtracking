export const INF = Number.POSITIVE_INFINITY;
export const DEFAULT_TARGET_XP = 1000;
export const DEFAULT_MAX_STEPS = 7;
export const RETRIBUTION_COOLDOWN = 35.0;
export const TURTLE_SPAWN_TIME = 120.0;
export const BASE_NODE = "Base / Start";
export const RED_BUFF_NODE = "Molten Fiend (Red Buff)";
export const BLUE_BUFF_NODE = "Thunder Fenrir (Blue Buff)";
export const PENETRATION_TO_ADAPTIVE_ATTACK = 1.25;
export const SVG_NS = "http://www.w3.org/2000/svg";

export const VISUAL_NODES = [
  { campId: BASE_NODE, short: "ST", x: 5, y: 95, color: "#0ea5e9", type: "start" },
  { campId: BLUE_BUFF_NODE, short: "TF", x: 26, y: 53, color: "#6366f1", type: "elite" },
  { campId: "Fire Beetle", short: "FB", x: 60, y: 85, color: "#22c55e", type: "common" },
  { campId: "Horned Lizard", short: "HL", x: 18, y: 43, color: "#16a34a", type: "common" },
  { campId: "Lithowanderer", short: "LW", x: 61, y: 63, color: "#38bdf8", type: "river" },
  { campId: RED_BUFF_NODE, short: "MF", x: 46, y: 83, color: "#ef4444", type: "elite" },
  { campId: "Lava Golem", short: "LG", x: 50, y: 75, color: "#84cc16", type: "common" },
  { campId: "Scavenger Crab", short: "SC", x: 19, y: 25, color: "#f59e0b", type: "river" },
  { campId: "Scavenger Crab 2", short: "SC2", x: 81, y: 78, color: "#f97316", type: "river" },
];

export const NODE_MAP = new Map(VISUAL_NODES.map((node) => [node.campId, node]));
