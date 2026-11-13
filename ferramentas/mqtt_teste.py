"""
Cliente MQTT mínimo (só biblioteca padrão do Python) para testar o controlador.

Escuta tudo em <prefixo>/# e, opcionalmente, envia comandos para <prefixo>/cmd.

Uso:
    python mqtt_teste.py --prefixo viveiro-cafe/proto-bea19c --segundos 20
    python mqtt_teste.py --prefixo viveiro-cafe/proto-bea19c --segundos 15 "status" "setor 1 5"

Os comandos são os mesmos do Serial Monitor (digite "ajuda" no Serial para ver a lista).
"""
import argparse
import json
import os
import socket
import struct
import sys
import time


def _str(s: str) -> bytes:
    b = s.encode("utf-8")
    return struct.pack("!H", len(b)) + b


def _tamanho(n: int) -> bytes:
    out = bytearray()
    while True:
        byte = n % 128
        n //= 128
        if n:
            byte |= 0x80
        out.append(byte)
        if not n:
            return bytes(out)


def _pacote(tipo: int, corpo: bytes) -> bytes:
    return bytes([tipo]) + _tamanho(len(corpo)) + corpo


class Mqtt:
    def __init__(self, host: str, porta: int):
        self.sock = socket.create_connection((host, porta), timeout=10)
        self.buf = b""
        cid = "teste-" + os.urandom(3).hex()
        corpo = _str("MQTT") + bytes([4, 0x02]) + struct.pack("!H", 60) + _str(cid)
        self.sock.sendall(_pacote(0x10, corpo))
        tipo, dados = self.ler()
        if tipo != 0x20 or dados[1] != 0:
            raise RuntimeError(f"CONNACK recusado: {dados!r}")

    def _pacote_completo(self):
        """Devolve (tipo, dados) se o buffer já tem um pacote inteiro; senão None."""
        if len(self.buf) < 2:
            return None
        mult, n, i = 1, 0, 1
        while True:
            if i >= len(self.buf):
                return None
            b = self.buf[i]
            n += (b & 0x7F) * mult
            mult *= 128
            i += 1
            if not b & 0x80:
                break
        if len(self.buf) < i + n:
            return None
        tipo, dados = self.buf[0] & 0xF0, self.buf[i:i + n]
        self.buf = self.buf[i + n:]
        return tipo, dados

    def ler(self):
        # Só consome o buffer quando o pacote está completo (um timeout no meio não perde dados).
        while True:
            p = self._pacote_completo()
            if p:
                return p
            parte = self.sock.recv(65536)
            if not parte:
                raise ConnectionError("conexão fechada pelo broker")
            self.buf += parte

    def assinar(self, filtro: str):
        self.sock.sendall(_pacote(0x82, struct.pack("!H", 1) + _str(filtro) + b"\x00"))

    def publicar(self, topico: str, payload: str):
        self.sock.sendall(_pacote(0x30, _str(topico) + payload.encode("utf-8")))

    def ping(self):
        self.sock.sendall(b"\xc0\x00")


def mostrar(prefixo: str, topico: str, payload: str):
    curto = topico[len(prefixo) + 1:] if topico.startswith(prefixo + "/") else topico
    try:
        dados = json.loads(payload)
    except ValueError:
        print(f"[{curto}] {payload}")
        return
    if curto == "evento":
        print(f"[evento] {dados.get('hora')} {dados.get('msg')}")
    elif curto == "resposta":
        print(f"[resposta] > {dados.get('cmd')}\n{dados.get('saida', '').rstrip()}")
    else:
        print(f"[{curto}] {json.dumps(dados, ensure_ascii=False)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="broker.hivemq.com")
    ap.add_argument("--porta", type=int, default=1883)
    ap.add_argument("--prefixo", default="viveiro-cafe/proto-bea19c")
    ap.add_argument("--segundos", type=float, default=20, help="quanto tempo escutar")
    ap.add_argument("--intervalo", type=float, default=3, help="segundos entre um comando e outro")
    ap.add_argument("comandos", nargs="*", help='comandos a enviar, ex.: "status" "setor 1 5"')
    a = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    m = Mqtt(a.host, a.porta)
    m.assinar(a.prefixo + "/#")
    print(f"Conectado a {a.host}:{a.porta}, escutando {a.prefixo}/# por {a.segundos:.0f}s")

    pendentes = list(a.comandos)
    proximo_cmd = time.time() + 2
    fim = time.time() + a.segundos
    ultimo_ping = time.time()
    m.sock.settimeout(0.5)
    while time.time() < fim:
        if pendentes and time.time() >= proximo_cmd:
            cmd = pendentes.pop(0)
            print(f"\n>>> enviando: {cmd}")
            m.publicar(a.prefixo + "/cmd", cmd)
            proximo_cmd = time.time() + a.intervalo
        if time.time() - ultimo_ping > 30:
            m.ping()
            ultimo_ping = time.time()
        try:
            tipo, dados = m.ler()
        except socket.timeout:
            continue
        if tipo == 0x30:
            n = struct.unpack("!H", dados[:2])[0]
            topico = dados[2:2 + n].decode("utf-8", "replace")
            mostrar(a.prefixo, topico, dados[2 + n:].decode("utf-8", "replace"))


if __name__ == "__main__":
    main()
