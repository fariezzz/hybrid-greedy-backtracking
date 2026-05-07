#!/usr/bin/env python3
"""
Generate visualisasi data eksperimen dari CSV hasil benchmark.

Default input:
- eksperimen_Fariez.csv
- eksperimen_Fadhlan.csv

Output:
- visualisasi/states_per_hero.png
- visualisasi/exec_time_fariez_vs_fadhlan.png
- visualisasi/ingame_time_to_lv4_per_hero.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate visualisasi hasil eksperimen.")
    parser.add_argument(
        "--inputs",
        nargs="+",
        default=["eksperimen_Fariez.csv", "eksperimen_Fadhlan.csv"],
        help="Daftar file CSV input.",
    )
    parser.add_argument(
        "--output-dir",
        default="visualisasi",
        help="Folder output visualisasi.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Tampilkan plot interaktif setelah disimpan.",
    )
    return parser.parse_args()


def load_data(csv_paths: list[Path]) -> pd.DataFrame:
    frames = []
    for path in csv_paths:
        if not path.exists():
            raise FileNotFoundError(f"File tidak ditemukan: {path}")
        frames.append(pd.read_csv(path))

    df = pd.concat(frames, ignore_index=True)
    df["states"] = pd.to_numeric(df["states"], errors="coerce")
    df["exec_avg_ms"] = pd.to_numeric(df["exec_avg_ms"], errors="coerce")
    df["total_time_s_num"] = (
        df["total_time_s"]
        .astype(str)
        .str.strip()
        .str.replace("s", "", regex=False)
        .pipe(pd.to_numeric, errors="coerce")
    )
    return df


def plot_states_per_hero(df: pd.DataFrame, output_dir: Path) -> None:
    grouped = (
        df.groupby(["hero", "algoritma"], as_index=False)["states"]
        .mean()
        .sort_values(["hero", "algoritma"])
    )
    pivoted = grouped.pivot(index="hero", columns="algoritma", values="states")

    ax = pivoted.plot(kind="bar", figsize=(10, 5), width=0.8)
    ax.set_title("Rata-rata State yang Dieksplorasi per Hero")
    ax.set_xlabel("Hero")
    ax.set_ylabel("Rata-rata State")
    ax.legend(title="Algoritma")
    ax.grid(axis="y", alpha=0.3)
    plt.xticks(rotation=20, ha="right")
    plt.tight_layout()
    plt.savefig(output_dir / "states_per_hero.png", dpi=150)
    plt.close()


def plot_exec_time_comparison(df: pd.DataFrame, output_dir: Path) -> None:
    grouped = (
        df.groupby(["algoritma", "laptop"], as_index=False)["exec_avg_ms"]
        .mean()
        .sort_values(["algoritma", "laptop"])
    )
    pivoted = grouped.pivot(index="algoritma", columns="laptop", values="exec_avg_ms")

    ax = pivoted.plot(kind="bar", figsize=(8, 5), width=0.8)
    ax.set_title("Perbandingan Rata-rata Execution Time")
    ax.set_xlabel("Algoritma")
    ax.set_ylabel("Rata-rata Execution Time (ms)")
    ax.legend(title="Laptop")
    ax.grid(axis="y", alpha=0.3)
    plt.xticks(rotation=0)
    plt.tight_layout()
    plt.savefig(output_dir / "exec_time_fariez_vs_fadhlan.png", dpi=150)
    plt.close()


def plot_ingame_time_to_lv4(df: pd.DataFrame, output_dir: Path) -> None:
    reached_lv4 = df[df["reached_lv4"].astype(str).str.lower() == "ya"].copy()
    grouped = (
        reached_lv4.groupby("hero", as_index=False)["total_time_s_num"]
        .mean()
        .sort_values("total_time_s_num")
    )

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.bar(grouped["hero"], grouped["total_time_s_num"], color="#2b8a3e")
    ax.set_title("Rata-rata Waktu In-game untuk Mencapai Level 4")
    ax.set_xlabel("Hero")
    ax.set_ylabel("Waktu (detik)")
    ax.grid(axis="y", alpha=0.3)
    plt.xticks(rotation=20, ha="right")
    plt.tight_layout()
    plt.savefig(output_dir / "ingame_time_to_lv4_per_hero.png", dpi=150)
    plt.close()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_paths = [Path(p) for p in args.inputs]
    df = load_data(csv_paths)

    plot_states_per_hero(df, output_dir)
    plot_exec_time_comparison(df, output_dir)
    plot_ingame_time_to_lv4(df, output_dir)

    print("Visualisasi berhasil dibuat:")
    print(f"- {output_dir / 'states_per_hero.png'}")
    print(f"- {output_dir / 'exec_time_fariez_vs_fadhlan.png'}")
    print(f"- {output_dir / 'ingame_time_to_lv4_per_hero.png'}")

    if args.show:
        plt.show()


if __name__ == "__main__":
    main()
