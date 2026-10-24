"""Mixa a narração com a trilha e os efeitos e remonta os MP4 narrados.

Uso: python3 narracao.py [--voz voz/] [--versao 90s|60s|todas]

Entrada:
  voz/cena-01.wav ... cena-12.wav       uma fala por cena (de tts.py ou de um locutor)
  ../videos/audio/trilha-<v>.flac       trilha sem voz
  ../videos/audio/efeitos-<v>.flac      efeitos sonoros
  ../videos/ag-power-comercial-<v>-*.mp4
Saída:
  ../videos/narrado/ag-power-comercial-<v>-<formato>-narrado.mp4
  ../videos/audio/narracao-<v>.flac     só a voz, já posicionada (para conferência)

Cada fala começa 0,3 s depois do início da cena. Se passar do tempo da cena, é
acelerada sem mudar o tom, até 20%. Se ainda assim não couber, a fala seguinte espera
ela terminar (as vozes nunca se sobrepõem) e o atraso aparece no relatório.
A trilha baixa ~9 dB enquanto há voz e volta nas pausas.
A imagem não é renderizada de novo: o vídeo é copiado e só o áudio muda.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
VIDEOS = HERE.parent / "videos"
SR = 48000
CORTE_60 = {3, 4, 6}  # mesma regra do comercial.html
MAX_ACELERA = 1.2  # acima disso a voz fica corrida demais


def ler(path, filtro=None):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if filtro:
        cmd += ["-af", filtro]
    cmd += ["-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def gravar(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-ac", "2", str(path)], input=x.tobytes(), check=True)


def suavizar(x, ataque, soltura):
    """Seguidor de envelope: sobe em `ataque` s, desce em `soltura` s."""
    a, r = np.exp(-1 / (ataque * SR)), np.exp(-1 / (soltura * SR))
    y = 0.0
    # processa em blocos de 10 ms para ficar rápido em Python
    bloco = SR // 100
    nivel = np.array([np.abs(x[i:i + bloco]).max(initial=0) for i in range(0, len(x), bloco)])
    ab, rb = a ** bloco, r ** bloco
    env = np.empty_like(nivel)
    for i, v in enumerate(nivel):
        c = ab if v > y else rb
        y = c * y + (1 - c) * v
        env[i] = y
    return np.repeat(env, bloco)[: len(x)]


def mixar(versao, voz_dir):
    cenas = json.loads((HERE / "roteiro_b.json").read_text(encoding="utf-8"))
    if versao == "60s":
        cenas = [c for c in cenas if c["id"] not in CORTE_60]
    total = sum(c["dur"] for c in cenas)
    trilha = ler(VIDEOS / "audio" / f"trilha-{versao}.flac")
    efeitos = ler(VIDEOS / "audio" / f"efeitos-{versao}.flac")
    n = int(total * SR)
    trilha, efeitos = np.pad(trilha, (0, max(0, n - len(trilha))))[:n], np.pad(efeitos, (0, max(0, n - len(efeitos))))[:n]

    voz = np.zeros(n, dtype=np.float32)
    corta = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
             "silenceremove=start_periods=1:start_threshold=-45dB,areverse")
    inicio, fim_anterior = 0.0, 0.0
    for c in cenas:
        arq = Path(voz_dir) / f"cena-{c['id']:02d}.wav"
        if not arq.exists():
            sys.exit(f"falta {arq}")
        janela = c["dur"] - 0.45
        bruto = ler(arq, corta)
        dur = len(bruto) / SR
        if dur > janela:
            bruto = ler(arq, corta + f",atempo={min(dur / janela, MAX_ACELERA):.4f}")
        pico = np.abs(bruto).max() or 1
        bruto = bruto / pico * 0.9
        # começa 0,3 s depois do início da cena, ou logo após a fala anterior se ela atrasou
        t = max(inicio + 0.3, fim_anterior + 0.25)
        i = int(t * SR)
        j = min(n, i + len(bruto))
        if j > i:
            voz[i:j] += bruto[: j - i]
        fim_anterior = t + len(bruto) / SR
        atraso = fim_anterior - (inicio + c["dur"])
        nota = f"  ⚠ termina {atraso:.1f} s depois do fim da cena" if atraso > 0.05 else ""
        print(f"  cena {c['id']:2d}: fala {len(bruto) / SR:4.1f} s em {c['dur']} s "
              f"(acelerada {max(1, dur / janela):.2f}x){nota}")
        inicio += c["dur"]
    if fim_anterior > total - 0.2:
        print(f"  ⚠ a narração passa do fim do vídeo em {fim_anterior - total + 0.2:.1f} s: "
              "aumente a velocidade da voz ou encurte o texto")

    env = suavizar(voz, 0.08, 0.45)
    duck = 1 - 0.65 * np.clip(env / 0.25, 0, 1)  # até ~-9 dB
    mix = voz * 1.0 + trilha * duck * 0.9 + efeitos * 0.6
    pico = np.abs(mix).max()
    if pico > 0.95:
        mix *= 0.95 / pico
    destino = VIDEOS / "audio"
    gravar(destino / f"narracao-{versao}.flac", voz)
    mix_wav = HERE / f".mix-{versao}.wav"
    gravar(mix_wav, mix)
    return mix_wav


def remontar(versao, mix_wav):
    saida = VIDEOS / "narrado"
    saida.mkdir(exist_ok=True)
    for mp4 in sorted(VIDEOS.glob(f"ag-power-comercial-{versao}-*.mp4")):
        out = saida / mp4.name.replace(".mp4", "-narrado.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-i", str(mix_wav),
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                        "-shortest", "-movflags", "+faststart", str(out)], check=True)
        print(f"  → {out}")
    mix_wav.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", default=str(HERE / "voz"))
    ap.add_argument("--versao", default="todas", choices=["90s", "60s", "todas"])
    a = ap.parse_args()
    for v in (["90s", "60s"] if a.versao == "todas" else [a.versao]):
        print(f"versão {v}:")
        remontar(v, mixar(v, a.voz))


if __name__ == "__main__":
    main()
