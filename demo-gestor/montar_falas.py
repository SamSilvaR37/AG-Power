"""Lê voz/cena-XX.wav + cena-XX.json (tempos por caractere, da ElevenLabs) e gera:
  falas.js     -> window.FALAS = {id: {dur, fala, palavras:[[texto, ini, fim], ...]}} (tempos relativos ao início da cena)
  roteiro.json -> durações das cenas (usadas pelo narracao.py)
A duração de cada cena é a maior entre a do briefing e 0,3 s + fala + 0,6 s, arredondada para 0,5 s."""
import json, math, wave
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
BRIEF = {1: 5, 2: 12, 3: 10, 4: 9, 7: 13, 8: 11, 9: 14, 10: 10, 12: 8}   # durações do briefing (cenas usadas)
LIMIAR = 10 ** (-45 / 20)                                                  # mesmo corte (-45 dB) do narracao.py

roteiro = json.loads((HERE / "roteiro.json").read_text(encoding="utf-8"))
falas = {}
for c in roteiro:
    i = c["id"]
    w = wave.open(str(HERE / f"voz/cena-{i:02d}.wav"))
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    sr = w.getframerate()
    idx = np.where(np.abs(x) > LIMIAR)[0]
    ini, fim = idx[0] / sr, idx[-1] / sr
    al = json.loads((HERE / f"voz/cena-{i:02d}.json").read_text(encoding="utf-8"))
    chars, a, b = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    palavras, cur = [], None
    for ch, s, e in zip(chars, a, b):
        if ch.isspace():
            if cur: palavras.append(cur); cur = None
        elif cur is None: cur = [ch, s, e]
        else: cur[0] += ch; cur[2] = e
    if cur: palavras.append(cur)
    # "Á... Gê..." (pronúncia) volta a ser "AG" na legenda
    out, k = [], 0
    while k < len(palavras):
        if palavras[k][0].strip(".,") == "Á" and k + 1 < len(palavras) and palavras[k + 1][0].strip(".,") == "Gê":
            out.append(["AG", palavras[k][1], palavras[k + 1][2]]); k += 2
        else: out.append(palavras[k]); k += 1
    fala = fim - ini
    dur = max(BRIEF[i], math.ceil((0.3 + fala + 0.6) * 2) / 2)
    falas[i] = {"dur": dur, "fala": round(fala, 3),
                "palavras": [[t, round(max(0, s - ini), 3), round(max(0, e - ini), 3)] for t, s, e in out]}
    c["dur"] = dur
    print(f"cena {i:2d}: fala {fala:5.1f} s, cena {dur} s (briefing {BRIEF[i]} s), {len(out)} palavras")
(HERE / "falas.js").write_text("window.FALAS = " + json.dumps(falas, ensure_ascii=False) + ";\n", encoding="utf-8")
(HERE / "roteiro.json").write_text("[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in roteiro) + "\n]\n", encoding="utf-8")
print("total", sum(c["dur"] for c in roteiro), "s")
