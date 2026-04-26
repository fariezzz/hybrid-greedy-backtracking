#!/usr/bin/env python3
"""
Script eksperimen otomatis untuk UAS Strategi Algoritma
Jalankan di setiap laptop dan simpan hasilnya ke CSV
"""

import subprocess
import time
import csv
import statistics
import platform
import sys
from pathlib import Path

# =============================================
# KONFIGURASI — sesuaikan jika perlu
# =============================================
HEROES     = ['Lancelot', 'Suyou', 'Hayabusa', 'Yi Sun Shin', 'Fredrinn']
ALGORITHMS = ['greedy', 'backtracking', 'hybrid']
BUFFS      = ['blue', 'red']
REPETITIONS = 10          # jumlah repetisi per skenario
SIMULATOR   = 'simulator.py'
OUTPUT_CSV  = 'hasil_eksperimen.csv'
# =============================================

def get_device_info():
    return {
        'os'      : platform.system() + ' ' + platform.release(),
        'python'  : platform.python_version(),
        'machine' : platform.machine(),
        'processor': platform.processor() or 'Unknown',
    }

def run_once(algo, hero, buff):
    inp = f'{algo}\n{hero}\n{buff}\n'
    start = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, SIMULATOR],
        input=inp, capture_output=True, text=True, timeout=60
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    if proc.returncode != 0:
        return None

    out = proc.stdout

    def extract(label):
        for line in out.split('\n'):
            if label in line:
                return line.split(':', 1)[-1].strip()
        return '-'

    return {
        'total_time_s' : extract('Total Waktu'),
        'total_xp'     : extract('Total XP'),
        'level'        : extract('Level Akhir'),
        'turtle_status': extract('Status Turtle'),
        'states'       : extract('State Explore'),
        'reached'      : 'Ya' if 'Target XP Tercapai' in out else 'Tidak',
        'exec_ms'      : round(elapsed_ms, 2),
    }

def main():
    device = get_device_info()
    print(f"\n{'='*60}")
    print(f"MLBB Jungle Route — Eksperimen Otomatis")
    print(f"{'='*60}")
    print(f"OS       : {device['os']}")
    print(f"Python   : {device['python']}")
    print(f"Processor: {device['processor']}")
    print(f"Repetisi : {REPETITIONS}x per skenario")
    total = len(HEROES) * len(BUFFS) * len(ALGORITHMS) * REPETITIONS
    print(f"Total run: {total}")
    print(f"{'='*60}\n")

    # Nama laptop (input manual)
    laptop_name = input("Nama laptop ini (misal: Laptop_A atau Laptop_B): ").strip()
    if not laptop_name:
        laptop_name = "Unknown"

    rows = []
    scenario_num = 0
    total_scenarios = len(HEROES) * len(BUFFS) * len(ALGORITHMS)

    for hero in HEROES:
        for buff in BUFFS:
            for algo in ALGORITHMS:
                scenario_num += 1
                print(f"[{scenario_num:>2}/{total_scenarios}] {algo:<14} | {hero:<15} | {buff:<4} ", end='', flush=True)

                exec_times = []
                last_result = None

                for rep in range(REPETITIONS):
                    result = run_once(algo, hero, buff)
                    if result is None:
                        print(f"ERROR pada repetisi {rep+1}")
                        break
                    exec_times.append(result['exec_ms'])
                    last_result = result
                    print('.', end='', flush=True)

                if not exec_times or last_result is None:
                    print(" GAGAL")
                    continue

                avg_ms  = round(statistics.mean(exec_times), 2)
                std_ms  = round(statistics.stdev(exec_times) if len(exec_times) > 1 else 0.0, 2)
                min_ms  = round(min(exec_times), 2)
                max_ms  = round(max(exec_times), 2)

                print(f" | avg={avg_ms}ms std={std_ms}ms | {last_result['turtle_status']}")

                rows.append({
                    'laptop'       : laptop_name,
                    'os'           : device['os'],
                    'processor'    : device['processor'],
                    'python'       : device['python'],
                    'hero'         : hero,
                    'buff'         : 'Blue' if buff == 'blue' else 'Red',
                    'algoritma'    : algo,
                    'reached_lv4'  : last_result['reached'],
                    'total_time_s' : last_result['total_time_s'],
                    'total_xp'     : last_result['total_xp'],
                    'level_akhir'  : last_result['level'],
                    'turtle_status': last_result['turtle_status'],
                    'states'       : last_result['states'],
                    'exec_avg_ms'  : avg_ms,
                    'exec_std_ms'  : std_ms,
                    'exec_min_ms'  : min_ms,
                    'exec_max_ms'  : max_ms,
                    'repetitions'  : len(exec_times),
                })

    # Simpan ke CSV
    if rows:
        fieldnames = list(rows[0].keys())
        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print(f"\n{'='*60}")
        print(f"Hasil disimpan ke: {OUTPUT_CSV}")
        print(f"Total baris data : {len(rows)}")
        print(f"{'='*60}")
    else:
        print("\nTidak ada data yang berhasil dikumpulkan.")

if __name__ == '__main__':
    main()
