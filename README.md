# Hybrid Greedy-Backtracking Jungle Route Simulator

Project ini berisi simulator rute jungle MLBB untuk membandingkan algoritma:

- Greedy
- Backtracking
- Hybrid Greedy-Backtracking

Simulator tersedia dalam dua bentuk:

- Versi terminal Python
- Versi web browser dengan JavaScript modular

Keduanya memakai dataset CSV yang sama dari folder `datasets/`.

## Struktur Project

```text
.
+-- datasets/                 # Dataset hero, emblem, monster, dan jarak
+-- src/                      # Modul perhitungan versi Python
|   +-- data.py
|   +-- engine.py
|   +-- constants.py
|   +-- solver/
+-- web/                      # Tampilan dan perhitungan versi web
|   +-- index.html
|   +-- web-simulator.js      # Entry point web
|   +-- js/
|       +-- data.js
|       +-- engine.js
|       +-- problem.js
|       +-- utils.js
|       +-- solver/
+-- simulator.py              # Simulator terminal Python
+-- run_experiments.py        # Script eksperimen
+-- server.js                 # Server lokal untuk menjalankan web
+-- scripts/
```

## Dataset

Dataset utama berada di:

```text
datasets/Hero.csv
datasets/Emblem.csv
datasets/Monster.csv
datasets/Jarak.csv
```

File web dan Python membaca data dari CSV tersebut, sehingga perubahan data sebaiknya dilakukan di folder `datasets/`.

## Menjalankan Versi Web

Versi web perlu dijalankan lewat server lokal agar browser bisa membaca file CSV.

```powershell
node server.js
```

Lalu buka browser:

```text
http://127.0.0.1:8000/web/
```

Di halaman web, pilih hero dan buff awal, lalu klik tombol **Hitung Semua Algoritma**.

Catatan: jangan langsung membuka `web/index.html` dengan double-click, karena fetch CSV biasanya akan diblokir browser jika tidak lewat server lokal.

## Menjalankan Versi Python

Jika Python sudah terpasang dan tersedia di PATH:

```powershell
python simulator.py
```

Program akan meminta input:

- Algoritma
- Hero
- Buff awal

Target XP dan maksimal step memakai nilai default dari `src/constants.py`.

## Perhitungan Web vs Python

Versi web tidak memanggil Python secara langsung.

Alurnya:

```text
Web browser
-> web/web-simulator.js
-> web/js/data.js
-> web/js/engine.js
-> web/js/solver/*.js
```

Sedangkan versi terminal Python:

```text
simulator.py
-> src/data.py
-> src/engine.py
-> src/solver/*.py
```

Keduanya dibuat modular dengan struktur yang mirip, dan memakai dataset CSV yang sama.

## Modul Web

Bagian web sudah dipisah agar lebih mirip struktur Python:

```text
web/js/constants.js              # Konstanta
web/js/csv.js                    # Parser CSV
web/js/data.js                   # Load dataset, emblem, talent
web/js/problem.js                # Build problem simulasi
web/js/engine.js                 # Simulasi step, clear time, retribution
web/js/solver/greedy.js          # Algoritma greedy
web/js/solver/backtracking.js    # Backtracking dengan pruning
web/js/solver/backtracking-pure.js
web/js/solver/hybrid.js          # Hybrid greedy-backtracking
web/js/ui.js                     # Event dan render tampilan
```

## Catatan File Lama

`web/app.js` sudah tidak digunakan dan sudah dihapus. Perhitungan web sekarang memakai `web/web-simulator.js` dan modul-modul di `web/js/`.

Jika ada file CLI JavaScript lama seperti `simulator.js`, file tersebut tidak diperlukan untuk menjalankan web maupun Python utama.

## Eksperimen dan Visualisasi

Script eksperimen:

```powershell
python run_experiments.py
```

Script visualisasi:

```powershell
python scripts/visualize_experiments.py
```

Output visualisasi berada di folder `visualisasi/`.
