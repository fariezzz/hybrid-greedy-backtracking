import { INF } from "./constants.js";

export function round1(value) {
  return Math.round(value * 10) / 10;
}

export function parsePercent(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  return Number(String(value).replace("%", "").trim()) / 100;
}

export function parsePercentFromText(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : null;
}

export function normalizeName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levelFromXp(totalXp) {
  if (totalXp >= 1000) {
    return 4;
  }
  if (totalXp >= 650) {
    return 3;
  }
  if (totalXp >= 300) {
    return 2;
  }
  return 1;
}

export function calcTravelSeconds(distance, moveSpeed) {
  if (!Number.isFinite(distance)) {
    return INF;
  }
  return round1(Math.max(1.2, (distance * 5400) / moveSpeed));
}

export function travelDuration(step) {
  return step.arrival_time - step.depart_time;
}

export function hybridCandidateScore(step) {
  return step.gained_xp / Math.max(0.1, step.finish_time - step.depart_time);
}
