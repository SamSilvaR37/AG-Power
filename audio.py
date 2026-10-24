"""Gera a trilha instrumental e os efeitos sonoros do comercial (sem locução).

Uso: python3 audio.py timeline.json saida_prefixo
  timeline.json: {"TOTAL": 90, "SFX": [{"t": 1.7, "k": "shine"}, ...]}
                 (exportado pelo comercial.html em window.COMMERCIAL)
  Gera <prefixo>.wav (mix), <prefixo>-trilha.wav e <prefixo>-efeitos.wav,
  para o editor poder baixar a trilha embaixo da locução.

Tudo é sintetizado aqui (numpy), então não há direito autoral de terceiros.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def t_axis(d):
    return np.arange(int(d * SR)) / SR


def env_adsr(n, a, d, s, r, total=None):
    """Envelope ADSR em amostras (tempos em segundos)."""
    total = total or n / SR
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel_start = total - r
    e = np.where(t > rel_start, e * np.clip((total - t) / max(r, 1e-4), 0, 1), e)
    return e


def lowpass(x, cutoff):
    """Filtro passa-baixa simples via FFT (suficiente para ruído e pads)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def highpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 - 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def add(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# ---------------- trilha ----------------
def music(total, cues=None):
    """cues (opcional, de window.COMMERCIAL.MUSIC): bpm, arp, kick, hat, clap (segundos em que
    cada camada entra) e prog ("I-V-vi-IV" ou "vi-IV-I-V")."""
    cue = {"bpm": 100, "arp": 6, "kick": 13, "hat": 27, "clap": 49, "prog": "I-V-vi-IV", **(cues or {})}
    n = int(total * SR) + SR
    pad = np.zeros(n)
    arp = np.zeros(n)
    bass = np.zeros(n)
    drums = np.zeros(n)

    bpm = cue["bpm"]
    beat = 60 / bpm
    bar = 4 * beat
    # Ré maior: D  A  Bm  G  (I V vi IV), positivo e aberto
    prog = [
        [50, 57, 62, 66, 69],
        [45, 57, 61, 64, 69],
        [47, 54, 59, 62, 66],
        [43, 55, 59, 62, 67],
    ]
    if cue["prog"] == "vi-IV-I-V":
        prog = prog[2:] + prog[:2]
    end_at = total - 4.0  # encerramento: acorde final
    nbars = int(np.ceil(end_at / bar))

    def pad_note(f, d):
        t = t_axis(d)
        s = sum((0.6 / h) * np.sin(2 * np.pi * f * h * t + h) for h in (1, 2, 3, 4))
        s += 0.25 * np.sin(2 * np.pi * f * 1.003 * t)  # leve chorus
        return s * env_adsr(len(t), 0.6, 0.4, 0.8, 0.9, d)

    def pluck(f, d=0.5):
        t = t_axis(d)
        s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
        return s * np.exp(-t * 7)

    def kick():
        t = t_axis(0.35)
        f = 45 + 90 * np.exp(-t * 25)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

    def hat():
        t = t_axis(0.06)
        return highpass(rng.standard_normal(len(t)), 7000) * np.exp(-t * 70)

    def clap():
        t = t_axis(0.18)
        return lowpass(highpass(rng.standard_normal(len(t)), 1200), 5000) * np.exp(-t * 22)

    k, h, c = kick(), hat(), clap()
    for b in range(nbars):
        t0 = b * bar
        ch = prog[b % 4]
        for m in ch[1:]:
            add(pad, pad_note(midi(m), bar + 0.9), t0, 0.10)
        add(bass, pad_note(midi(ch[0] - 12), bar + 0.2), t0, 0.22)
        # arpejo a partir da apresentação da plataforma
        if t0 >= cue["arp"] - bar:
            seq = [ch[1], ch[2], ch[3], ch[4], ch[3], ch[2], ch[3], ch[4]]
            for i, m in enumerate(seq):
                tt = t0 + i * beat / 2
                if cue["arp"] <= tt < end_at:
                    add(arp, pluck(midi(m + 12)), tt, 0.09)
        for i in range(4):
            tt = t0 + i * beat
            if tt >= end_at:
                break
            if tt >= cue["kick"]:
                add(drums, k, tt, 0.55)
            if tt >= cue["hat"]:
                add(drums, h, tt + beat / 2, 0.12)
            if tt >= cue["clap"] and i in (1, 3):
                add(drums, c, tt, 0.16)

    # acorde final (D maior aberto) com sino
    for m in [38, 50, 57, 62, 66, 69, 74]:
        add(pad, pad_note(midi(m), 4.0), end_at, 0.11)
    for i, m in enumerate([74, 78, 81, 86]):
        add(arp, pluck(midi(m), 3.0), end_at + i * 0.06, 0.10)

    mix = pad + arp + bass + drums
    # crescendo leve até a cena final; entrada suave
    t = np.arange(n) / SR
    g = 0.55 + 0.45 * np.clip(t / end_at, 0, 1) ** 1.3
    g *= np.clip(t / 1.5, 0, 1)
    g *= np.clip((total - t) / 1.2, 0, 1)
    return (mix * g)[: int(total * SR)]


# ---------------- efeitos ----------------
def sfx_bank():
    def tone(f, d, decay, f2=None):
        t = t_axis(d)
        fr = f if f2 is None else f + (f2 - f) * (t / d)
        return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(fr, t.shape)) / SR) * np.exp(-t * decay)

    def noise(d, lo, hi, decay):
        t = t_axis(d)
        return lowpass(highpass(rng.standard_normal(len(t)), lo), hi) * np.exp(-t * decay)

    def cat(*parts):
        out = np.zeros(int(max(at + len(s) / SR for s, at in parts) * SR) + 1)
        for s, at in parts:
            add(out, s, at)
        return out

    swell = lambda d: np.sin(np.pi * np.clip(t_axis(d) / d, 0, 1)) ** 2
    bank = {
        "tap": cat((noise(0.04, 1500, 6000, 120) * 0.6, 0), (tone(1800, 0.03, 150) * 0.3, 0)),
        "pop": tone(900, 0.12, 30, 500) * 0.5,
        "check": cat((tone(1046, 0.12, 25), 0), (tone(1568, 0.25, 14), 0.07)) * 0.32,
        "notify": cat((tone(988, 0.5, 7) + 0.3 * tone(1976, 0.5, 9), 0), (tone(1319, 0.7, 5) + 0.3 * tone(2638, 0.7, 8), 0.13)) * 0.28,
        "tick": tone(2200, 0.03, 140) * 0.18,
        "alert": cat((tone(740, 0.18, 12), 0), (tone(587, 0.3, 9), 0.16)) * 0.3,
        "whoosh": lowpass(highpass(rng.standard_normal(int(0.55 * SR)), 300), 3000) * swell(0.55) * 0.22,
        "swish": lowpass(highpass(rng.standard_normal(int(0.3 * SR)), 800), 5000) * swell(0.3) * 0.16,
        "shutter": cat((noise(0.03, 2000, 9000, 150), 0), (noise(0.04, 1500, 7000, 110), 0.06)) * 0.5,
        "stamp": cat((tone(120, 0.25, 18, 60), 0), (noise(0.08, 200, 2500, 50) * 0.4, 0)) * 0.6,
        "soft": tone(784, 0.35, 10) * 0.16,
        "shine": sum(tone(f, 1.0, 4) * 0.06 for f in (2093, 2637, 3136, 3951)),
        "coin": cat((tone(3400, 0.18, 30), 0), (0.6 * tone(4700, 0.12, 40), 0), (0.4 * tone(2600, 0.22, 25), 0)) * 0.09,
        "chaching": cat((noise(0.05, 3000, 12000, 60) * 0.5, 0),
                        (sum(tone(f, 0.6, 7) for f in (2637, 3520, 4186)) * 0.12, 0.0),
                        (sum(tone(f, 0.9, 5) for f in (3136, 3951, 5274)) * 0.14, 0.11)) * 0.55,
        "chime": sum(tone(f, 2.5, 1.8) * a for f, a in ((587, 0.14), (880, 0.1), (1175, 0.08), (1760, 0.05))),
    }
    return bank


def write_wav(path, mono_or_stereo):
    x = mono_or_stereo
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def main():
    tl = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    total = float(tl["TOTAL"])
    m = music(total, tl.get("MUSIC"))
    m = m / (np.abs(m).max() + 1e-9) * 0.55
    fx = np.zeros_like(m)
    bank = sfx_bank()
    for ev in tl["SFX"]:
        add(fx, bank[ev["k"]], ev["t"])
    # leve abertura estéreo na trilha
    delay = int(0.012 * SR)
    ms = np.stack([m, np.concatenate([np.zeros(delay), m[:-delay]])], 1)
    fxs = np.stack([fx, fx], 1)
    mix = ms + fxs
    peak = np.abs(mix).max()
    if peak > 0.95:
        mix *= 0.95 / peak
    write_wav(out + ".wav", mix)
    write_wav(out + "-trilha.wav", ms)
    write_wav(out + "-efeitos.wav", fxs)


if __name__ == "__main__":
    main()
