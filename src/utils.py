from __future__ import annotations

import math
import re
from typing import Any

from src.constants import INF


def round1(value: float) -> float:
    return round(value * 10) / 10


def parse_percent(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(str(value).replace("%", "").strip()) / 100.0


def normalize_name(text: Any) -> str:
    value = str(text or "").lower()
    value = re.sub(r"\(.*?\)", "", value)
    value = value.replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", value).strip()


def level_from_xp(total_xp: float) -> int:
    if total_xp >= 1000:
        return 4
    if total_xp >= 650:
        return 3
    if total_xp >= 300:
        return 2
    return 1


def parse_percent_from_text(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", str(text or ""))
    return None if not match else float(match.group(1)) / 100.0


def calc_travel_seconds(distance: float, move_speed: float) -> float:
    if not math.isfinite(distance):
        return INF
    return round1(max(1.2, (distance * 5400) / move_speed))


def travel_duration(step: dict[str, Any]) -> float:
    return step["arrival_time"] - step["depart_time"]


def hybrid_candidate_score(step: dict[str, Any]) -> float:
    return step["gained_xp"] / max(0.1, travel_duration(step))
