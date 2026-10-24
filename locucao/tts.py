"""Gera a voz de cada cena (cena-01.wav, cena-02.wav ...) a partir de um roteiro .json
(padrão: roteiro_b.json do comercial; o Dinheiro na Mesa usa ../dinheiro-na-mesa/roteiro.json).

Uso:
  python3 tts.py google  [--voz pt-BR-Neural2-B] [--velocidade 1.08] [--projeto MEU_PROJETO] [--saida voz/]
  python3 tts.py piper   --modelo pt_BR-faber-medium.onnx [--saida voz/]
  python3 tts.py espeak  [--saida voz/]          # robótica, só para testar o encaixe

Motores:
  google  Google Cloud Text-to-Speech (vozes neurais pt-BR). Usa a chave de API da
          variável GOOGLE_TTS_API_KEY, ou, sem ela, `gcloud auth print-access-token`.
          A API "Cloud Text-to-Speech" precisa estar ativa no projeto.
  piper   Piper, offline. O modelo pt-BR (.onnx + .onnx.json) vem de
          huggingface.co/rhasspy/piper-voices (ex.: pt/pt_BR/faber/medium).
  espeak  espeak-ng com voz MBROLA brasileira, se instalada.

Depois rode narracao.py para mixar com a trilha e remontar os vídeos.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent

# Como cada termo deve ser falado (texto escrito -> texto para a voz).
# Confirme com a AG Power a pronúncia de HYXi e SolarMan antes da versão final.
PRONUNCIA = [
    (r"\bOS\b", "ó-ésse"),
    (r"\bPDF\b", "pê-dê-éfe"),
    (r"\b7h40\b", "sete e quarenta"),
    (r"\bdas 6h às 22h\b", "das seis às vinte e duas"),
    (r"\b15 minutos\b", "quinze minutos"),
    (r"\bSolarMan\b", "Solar Man"),
]


def para_fala(texto):
    for padrao, fala in PRONUNCIA:
        texto = re.sub(padrao, fala, texto)
    return texto


def google(texto, destino, voz, projeto, velocidade):
    url = "https://texttospeech.googleapis.com/v1/text:synthesize"
    chave = os.environ.get("GOOGLE_TTS_API_KEY")
    if chave:
        cabecalhos = {"x-goog-api-key": chave}
    else:
        token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
        if not projeto:
            projeto = subprocess.check_output(["gcloud", "config", "get-value", "project"], text=True).strip()
        cabecalhos = {"Authorization": f"Bearer {token}", "x-goog-user-project": projeto}
    corpo = {
        "input": {"text": texto},
        "voice": {"languageCode": "pt-BR", "name": voz},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 48000, "speakingRate": velocidade},
    }
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(),
                                 headers={**cabecalhos, "Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        destino.write_bytes(base64.b64decode(json.load(r)["audioContent"]))


def piper(texto, destino, modelo):
    subprocess.run(["python3", "-m", "piper", "-m", modelo, "-f", str(destino)],
                   input=texto, text=True, check=True)


def espeak(texto, destino):
    voz = "mb-br1"
    try:
        subprocess.run(["espeak-ng", "-v", voz, "-s", "150", "-w", str(destino), texto],
                       check=True, capture_output=True)
    except subprocess.CalledProcessError:
        subprocess.run(["espeak-ng", "-v", "pt-br", "-s", "150", "-w", str(destino), texto], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("motor", choices=["google", "piper", "espeak"])
    ap.add_argument("--voz", default="pt-BR-Neural2-B", help="voz do Google (ex.: pt-BR-Neural2-A, -B, -C)")
    ap.add_argument("--projeto", default="", help="projeto do Google Cloud (padrão: o do gcloud)")
    ap.add_argument("--velocidade", type=float, default=1.08, help="velocidade da voz do Google (1.0 = normal)")
    ap.add_argument("--modelo", help="modelo .onnx do Piper")
    ap.add_argument("--saida", default=str(HERE / "voz"))
    ap.add_argument("--roteiro", default=str(HERE / "roteiro_b.json"))
    a = ap.parse_args()

    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    for cena in json.loads(Path(a.roteiro).read_text(encoding="utf-8")):
        texto = para_fala(cena["locucao"])
        destino = saida / f"cena-{cena['id']:02d}.wav"
        if a.motor == "google":
            google(texto, destino, a.voz, a.projeto, a.velocidade)
        elif a.motor == "piper":
            piper(texto, destino, a.modelo)
        else:
            espeak(texto, destino)
        print(f"cena {cena['id']:2d} → {destino}")


if __name__ == "__main__":
    main()
