"""Gera as legendas (.srt) da locução versão B a partir de roteiro_b.json.

Uso: python3 gerar_srt.py   -> locucao-90s.srt e locucao-60s.srt
A versão de 60 s remove as cenas 3, 4 e 6 (mesma regra do comercial.html).
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
CENAS = json.loads((HERE / "roteiro_b.json").read_text(encoding="utf-8"))


def ts(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def build(skip):
    out, n, start = [], 1, 0.0
    for c in CENAS:
        if c["id"] in skip:
            continue
        frases = [f for f in re.split(r"(?<=[.?!:])\s+", c["locucao"]) if f]
        palavras = [len(f.split()) for f in frases]
        total = sum(palavras)
        # a fala ocupa a cena deixando 0,3 s de respiro no começo e no fim
        t, util = start + 0.3, c["dur"] - 0.6
        for f, w in zip(frases, palavras):
            d = util * w / total
            out.append(f"{n}\n{ts(t)} --> {ts(t + d)}\n{f}\n")
            n, t = n + 1, t + d
        start += c["dur"]
    return "\n".join(out)


(HERE / "locucao-90s.srt").write_text(build(set()), encoding="utf-8")
(HERE / "locucao-60s.srt").write_text(build({3, 4, 6}), encoding="utf-8")
