/*
 * Irrigação Viveiro de Café — Fase 3 (protótipo no Wokwi)
 *
 * Fase 3: Wi-Fi + MQTT + relógio pela internet (NTP).
 * - A rede roda numa tarefa separada (núcleo 0): se a internet cair ou travar,
 *   a irrigação (núcleo 1) continua normalmente.
 * - Publica status, configuração e eventos; recebe os MESMOS comandos do Serial
 *   pelo tópico <prefixo>/cmd e responde em <prefixo>/resposta.
 *
 * Fase 2: rotinas, setores e parâmetros configuráveis, salvos na flash (NVS),
 * rotinas cruzando a meia-noite, prévia, conflitos e watchdog.
 *
 * Segurança (desde a Fase 1): a válvula abre ANTES da bomba ligar e a bomba
 * desliga ANTES da válvula fechar; na troca de setor o próximo abre antes do
 * anterior fechar. Comandos pelo Serial Monitor: digite "ajuda".
 */
#include <Wire.h>
#include <RTClib.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>

// 1 = simulador Wokwi (RTC DS1307, LEDs). 0 = placa real (RTC DS3231, módulo de relés).
#define SIMULADOR 1

// ============================ Rede ============================
// Wi-Fi e broker vêm do arquivo segredos.h (copie de segredos.exemplo.h e preencha).
// Ele NÃO vai para o git. Sem ele, o firmware usa o Wi-Fi do Wokwi e o broker público de testes.
#if __has_include("segredos.h")
#include "segredos.h"
#else
#define WIFI_SSID_CFG "Wokwi-GUEST"
#define WIFI_SENHA_CFG ""
#define MQTT_HOST_CFG "broker.hivemq.com"  // público: qualquer um que souber o prefixo manda comandos
#define MQTT_PORTA_CFG 1883
#define MQTT_TLS_CFG 0
#define MQTT_USUARIO_CFG ""
#define MQTT_SENHA_CFG ""
#endif

const char* WIFI_SSID = WIFI_SSID_CFG;
const char* WIFI_SENHA = WIFI_SENHA_CFG;
const int32_t WIFI_CANAL = SIMULADOR ? 6 : 0;  // no Wokwi o canal 6 conecta mais rápido; 0 = qualquer
const char* MQTT_HOST = MQTT_HOST_CFG;
const uint16_t MQTT_PORTA = MQTT_PORTA_CFG;
#define MQTT_TLS MQTT_TLS_CFG
const char* MQTT_USUARIO = MQTT_USUARIO_CFG;
const char* MQTT_SENHA = MQTT_SENHA_CFG;
const char* MQTT_PREFIXO = "viveiro-cafe/proto-bea19c";  // único por viveiro
const char* FUSO_HORARIO = "<-04>4";                    // Rondônia (UTC-4), sem horário de verão

#if MQTT_TLS
#include <WiFiClientSecure.h>
WiFiClientSecure clienteRede;
// Certificado raiz ISRG Root X1 (Let's Encrypt), usado pelo HiveMQ Cloud. Válido até 2035.
// Com ele o ESP32 confere que está falando com o broker de verdade (não com um impostor).
const char* CA_RAIZ =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n"
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n"
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n"
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n"
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n"
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n"
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n"
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n"
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n"
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n"
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n"
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n"
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n"
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n"
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n"
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n"
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n"
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n"
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n"
"-----END CERTIFICATE-----\n";
#else
WiFiClient clienteRede;
#endif
PubSubClient mqtt(clienteRede);

#if SIMULADOR
RTC_DS1307 rtc;
#else
RTC_DS3231 rtc;
#endif

// ============================ Pinos ============================
const uint8_t NUM_SETORES = 6;
const uint8_t PINO_BOMBA = 23;
const uint8_t PINO_SETOR[NUM_SETORES] = {19, 18, 5, 17, 16, 4};
const uint8_t PINO_BTN_PAUSA = 32;
const uint8_t PINO_BTN_MOTOR = 33;

// Módulos de relé comuns acionam em nível BAIXO. No simulador (LEDs) é ALTO.
const bool RELE_ATIVO_EM_ALTO = SIMULADOR;

// ====================== Tempos de segurança ======================
const uint32_t ANTECIPA_VALVULA_MS = 1000;  // abre a válvula e espera antes de ligar a bomba
const uint32_t SOBREPOSICAO_MS = 500;       // troca de setor: os dois ficam abertos por um instante
const uint32_t RETARDO_FECHA_MS = 2000;     // bomba desliga e espera antes de fechar a válvula
const uint32_t BOMBA_MAX_S = 60UL * 60;     // failsafe: bomba ligada direto por tempo demais
const uint32_t WDT_S = 10;                  // watchdog

// ============================ Tipos ============================
const uint8_t MAX_ROTINAS = 16;
const char* CHAVE_CONFIG = "config";  // chave na NVS (namespace "irrigacao")
Preferences prefs;

enum TipoRotina : uint8_t { IRRIGACAO, ADUBACAO, CLIMATIZACAO };
const char* NOME_TIPO_ROTINA[] = {"irrigacao", "adubacao", "climatizacao"};

enum TipoSetor : uint8_t { INTERNO, EXTERNO };
const char* NOME_TIPO_SETOR[] = {"interno", "externo"};

const char* NOME_DIA[] = {"dom", "seg", "ter", "qua", "qui", "sex", "sab"};
#define DIAS_TODOS 0b1111111

struct Setor {
  char nome[24];
  TipoSetor tipo;
  bool instalado;  // a solenoide existe fisicamente?
  bool mudas;      // bloco com mudas? (vazio = nunca abre na rotina)
};

struct Rotina {
  uint8_t id;
  char nome[24];
  TipoRotina tipo;
  uint8_t dias;             // bit0 = domingo ... bit6 = sábado (dia em que a janela ABRE)
  uint16_t inicio, fim;     // minutos desde 00:00; fim < início = cruza a meia-noite
  uint16_t ligadoS;         // tempo ligado POR SETOR
  uint32_t pausaS;          // pausa depois de desligar (0 = roda uma vez só na janela)
  uint16_t misturaS;        // ADUBACAO: só motor antes do 1º ciclo da janela
  uint8_t setores;          // bit0 = setor 1
  bool ativa;
  uint32_t fimUltimoCiclo;  // estado em execução (não é salvo)
};

struct Config {
  uint16_t pausaVisitaMin;
  uint16_t soMotorMin;
  Setor setores[NUM_SETORES];
  Rotina rotinas[MAX_ROTINAS];
  uint8_t nRotinas;
} cfg;

// ======================== Estado do sistema ========================
enum Modo : uint8_t { AUTOMATICO, PAUSA_VISITA, SO_MOTOR };
const char* NOME_MODO[] = {"AUTOMATICO", "PAUSA VISITA", "SO MOTOR"};

enum Estado : uint8_t { OCIOSO, MISTURANDO, ABRINDO, IRRIGANDO, TROCANDO, DESLIGANDO };
const char* NOME_ESTADO[] = {"ocioso", "misturando adubo", "abrindo valvula", "irrigando", "trocando setor", "desligando"};

struct Ciclo {
  Estado estado = OCIOSO;
  int16_t rotinaId = -1;  // -1 = acionamento manual
  uint8_t fila[NUM_SETORES];
  uint8_t nFila = 0, pos = 0;
  uint32_t ligadoMs = 0, misturaMs = 0;
  uint32_t desde = 0;  // millis() da entrada no estado atual
} ciclo;

struct Botao {
  uint8_t pino;
  bool estavel, ultimo;
  uint32_t t;
};
Botao btnPausa = {PINO_BTN_PAUSA, HIGH, HIGH, 0};
Botao btnMotor = {PINO_BTN_MOTOR, HIGH, HIGH, 0};

Modo modo = AUTOMATICO;
uint32_t modoDesde = 0;
bool bombaLigada = false;
uint32_t bombaDesde = 0;
bool valvula[NUM_SETORES] = {false};
DateTime agora;

// ===================== Comunicação entre as tarefas =====================
struct MsgSaida {
  char* topico;
  char* payload;
  bool retain;
};
QueueHandle_t filaSaida = nullptr;    // MsgSaida: irrigação -> rede
QueueHandle_t filaEntrada = nullptr;  // char*: comandos recebidos via MQTT -> irrigação
volatile bool wifiOnline = false;
volatile bool mqttOnline = false;
volatile bool republicar = false;  // rede reconectou: publicar status e config de novo
volatile int8_t wifiRssi = 0;

// Saída de texto que vai para o Serial e, quando o comando veio do MQTT, também
// é capturada para ser devolvida em <prefixo>/resposta.
class Saida : public Print {
 public:
  String captura;
  bool capturando = false;
  size_t write(uint8_t c) override {
    Serial.write(c);
    if (capturando && captura.length() < 4000) captura += (char)c;
    return 1;
  }
  size_t write(const uint8_t* b, size_t n) override {
    for (size_t i = 0; i < n; i++) write(b[i]);
    return n;
  }
} out;

// ============================ Utilidades ============================
char* duplicar(const String& s) {
  char* p = (char*)malloc(s.length() + 1);
  if (p) memcpy(p, s.c_str(), s.length() + 1);
  return p;
}

// Coloca uma mensagem na fila para a tarefa de rede publicar em <prefixo>/<sufixo>.
void enfileirar(const char* sufixo, const String& payload, bool retain) {
  if (!mqttOnline || !filaSaida) return;
  MsgSaida m = {duplicar(String(MQTT_PREFIXO) + "/" + sufixo), duplicar(payload), retain};
  if (!m.topico || !m.payload || xQueueSend(filaSaida, &m, 0) != pdTRUE) {
    free(m.topico);
    free(m.payload);
  }
}

void registrar(const char* fmt, ...) {
  char buf[200];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  char hora[9];
  snprintf(hora, sizeof hora, "%02d:%02d:%02d", agora.hour(), agora.minute(), agora.second());
  out.printf("[%s] %s\n", hora, buf);
  if (mqttOnline) {
    JsonDocument doc;
    doc["hora"] = hora;
    doc["msg"] = buf;
    String s;
    serializeJson(doc, s);
    enfileirar("evento", s, false);
  }
}

String fmtHora(uint16_t minutos) {
  char b[6];
  snprintf(b, sizeof b, "%02u:%02u", (minutos / 60) % 24, minutos % 60);
  return String(b);
}

bool lerHora(const char* s, uint16_t& minutos) {
  int h, m;
  if (!s || sscanf(s, "%d:%d", &h, &m) != 2 || h < 0 || h > 23 || m < 0 || m > 59) return false;
  minutos = h * 60 + m;
  return true;
}

int indiceDe(const char* s, const char* const* lista, uint8_t n) {
  for (uint8_t i = 0; i < n; i++) if (s && strcmp(s, lista[i]) == 0) return i;
  return -1;
}

uint32_t meiaNoiteHoje() {
  return agora.unixtime() - (agora.hour() * 3600UL + agora.minute() * 60UL + agora.second());
}

int rotinaPorId(int id) {
  for (uint8_t i = 0; i < cfg.nRotinas; i++) if (cfg.rotinas[i].id == id) return i;
  return -1;
}

// ===================== Configuração: JSON <-> structs =====================
Rotina rotinaVazia() {
  Rotina r;
  memset(&r, 0, sizeof r);
  r.tipo = IRRIGACAO;
  r.dias = DIAS_TODOS;
  r.ativa = true;
  return r;
}

// Aplica os campos presentes em "o" sobre "r" (campos ausentes ficam como estão).
bool rotinaDeJson(JsonObjectConst o, Rotina& r, String& erro) {
  if (!o["nome"].isNull()) strlcpy(r.nome, o["nome"] | "", sizeof r.nome);
  if (!o["tipo"].isNull()) {
    int t = indiceDe(o["tipo"] | "", NOME_TIPO_ROTINA, 3);
    if (t < 0) { erro = "tipo invalido (irrigacao | adubacao | climatizacao)"; return false; }
    r.tipo = (TipoRotina)t;
  }
  if (!o["dias"].isNull()) {
    JsonVariantConst v = o["dias"];
    if (v.is<const char*>() && strcmp(v.as<const char*>(), "todos") == 0) r.dias = DIAS_TODOS;
    else if (v.is<JsonArrayConst>()) {
      uint8_t dias = 0;
      for (JsonVariantConst d : v.as<JsonArrayConst>()) {
        int k = indiceDe(d | "", NOME_DIA, 7);
        if (k < 0) { erro = "dia invalido (use dom seg ter qua qui sex sab)"; return false; }
        dias |= 1 << k;
      }
      r.dias = dias;
    } else { erro = "dias: use \"todos\" ou [\"seg\",\"qua\",...]"; return false; }
  }
  if (!o["inicio"].isNull() && !lerHora(o["inicio"] | "", r.inicio)) { erro = "inicio invalido (HH:MM)"; return false; }
  if (!o["fim"].isNull() && !lerHora(o["fim"] | "", r.fim)) { erro = "fim invalido (HH:MM)"; return false; }
  if (!o["ligado"].isNull()) {
    long v = o["ligado"] | -1L;
    if (v < 1 || v > 3600) { erro = "ligado: 1 a 3600 segundos"; return false; }
    r.ligadoS = v;
  }
  if (!o["pausa"].isNull()) {
    long v = o["pausa"] | -1L;
    if (v < 0 || v > 86400) { erro = "pausa: 0 a 86400 segundos"; return false; }
    r.pausaS = v;
  }
  if (!o["mistura"].isNull()) {
    long v = o["mistura"] | -1L;
    if (v < 0 || v > 3600) { erro = "mistura: 0 a 3600 segundos"; return false; }
    r.misturaS = v;
  }
  if (!o["setores"].isNull()) {
    if (!o["setores"].is<JsonArrayConst>()) { erro = "setores: use [1,2,3]"; return false; }
    uint8_t s = 0;
    for (JsonVariantConst v : o["setores"].as<JsonArrayConst>()) {
      int n = v | 0;
      if (n < 1 || n > NUM_SETORES) { erro = "setor invalido (1 a 6)"; return false; }
      s |= 1 << (n - 1);
    }
    r.setores = s;
  }
  if (!o["ativa"].isNull()) r.ativa = o["ativa"] | true;

  if (r.nome[0] == 0) { erro = "falta o nome"; return false; }
  if (r.inicio == r.fim) { erro = "inicio e fim iguais (ou faltando)"; return false; }
  if (r.ligadoS == 0) { erro = "falta o tempo ligado"; return false; }
  if (r.setores == 0) { erro = "falta a lista de setores"; return false; }
  if (r.dias == 0) { erro = "nenhum dia selecionado"; return false; }
  return true;
}

void rotinaParaJson(const Rotina& r, JsonObject o) {
  o["id"] = r.id;
  o["nome"] = r.nome;
  o["tipo"] = NOME_TIPO_ROTINA[r.tipo];
  if (r.dias == DIAS_TODOS) o["dias"] = "todos";
  else {
    JsonArray a = o["dias"].to<JsonArray>();
    for (uint8_t k = 0; k < 7; k++) if ((r.dias >> k) & 1) a.add(NOME_DIA[k]);
  }
  o["inicio"] = fmtHora(r.inicio);
  o["fim"] = fmtHora(r.fim);
  o["ligado"] = r.ligadoS;
  o["pausa"] = r.pausaS;
  if (r.tipo == ADUBACAO) o["mistura"] = r.misturaS;
  JsonArray s = o["setores"].to<JsonArray>();
  for (uint8_t i = 0; i < NUM_SETORES; i++) if ((r.setores >> i) & 1) s.add(i + 1);
  o["ativa"] = r.ativa;
}

bool setorDeJson(JsonObjectConst o, Setor& s, String& erro) {
  if (!o["nome"].isNull()) strlcpy(s.nome, o["nome"] | "", sizeof s.nome);
  if (!o["tipo"].isNull()) {
    int t = indiceDe(o["tipo"] | "", NOME_TIPO_SETOR, 2);
    if (t < 0) { erro = "tipo de setor invalido (interno | externo)"; return false; }
    s.tipo = (TipoSetor)t;
  }
  if (!o["instalado"].isNull()) s.instalado = o["instalado"] | true;
  if (!o["mudas"].isNull()) s.mudas = o["mudas"] | true;
  return true;
}

void configParaJson(JsonDocument& doc) {
  doc["versao"] = 1;
  doc["pausaVisitaMin"] = cfg.pausaVisitaMin;
  doc["soMotorMin"] = cfg.soMotorMin;
  JsonArray ss = doc["setores"].to<JsonArray>();
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    JsonObject o = ss.add<JsonObject>();
    o["n"] = i + 1;
    o["nome"] = cfg.setores[i].nome;
    o["tipo"] = NOME_TIPO_SETOR[cfg.setores[i].tipo];
    o["instalado"] = cfg.setores[i].instalado;
    o["mudas"] = cfg.setores[i].mudas;
  }
  JsonArray rs = doc["rotinas"].to<JsonArray>();
  for (uint8_t i = 0; i < cfg.nRotinas; i++) rotinaParaJson(cfg.rotinas[i], rs.add<JsonObject>());
}

void publicarConfig() {
  JsonDocument doc;
  configParaJson(doc);
  String s;
  serializeJson(doc, s);
  enfileirar("config", s, true);
}

// ========================= Configuração: flash =========================
void adicionarPadrao(const char* nome, TipoRotina tipo, uint8_t dias, uint16_t ini, uint16_t fim,
                     uint16_t ligado, uint32_t pausa, uint16_t mistura, uint8_t setores) {
  Rotina r = rotinaVazia();
  r.id = cfg.nRotinas + 1;
  strlcpy(r.nome, nome, sizeof r.nome);
  r.tipo = tipo;
  r.dias = dias;
  r.inicio = ini;
  r.fim = fim;
  r.ligadoS = ligado;
  r.pausaS = pausa;
  r.misturaS = mistura;
  r.setores = setores;
  cfg.rotinas[cfg.nRotinas++] = r;
}

void configPadrao() {
  memset(&cfg, 0, sizeof cfg);
  cfg.pausaVisitaMin = 30;
  cfg.soMotorMin = 15;
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    Setor& s = cfg.setores[i];
    s.tipo = i < 4 ? INTERNO : EXTERNO;
    snprintf(s.nome, sizeof s.nome, i < 4 ? "Bloco %u" : "Externo %u", i < 4 ? i + 1 : i - 3);
    s.instalado = true;
    s.mudas = true;
  }
  adicionarPadrao("Manha", IRRIGACAO, DIAS_TODOS, 7 * 60, 8 * 60, 30, 4 * 60, 0, 0b001111);
  adicionarPadrao("Tarde", IRRIGACAO, DIAS_TODOS, 12 * 60, 17 * 60 + 30, 60, 5 * 60, 0, 0b001111);
  adicionarPadrao("Adubacao", ADUBACAO, 0b0000010, 9 * 60, 9 * 60 + 1, 60, 0, 3 * 60, 0b001111);
}

// A NVS grava de forma atômica: se faltar energia no meio, fica a versão anterior.
bool salvarConfig() {
  JsonDocument doc;
  configParaJson(doc);
  String json;
  serializeJson(doc, json);
  if (prefs.putBytes(CHAVE_CONFIG, json.c_str(), json.length()) != json.length()) {
    registrar("ERRO: nao foi possivel gravar a configuracao");
    return false;
  }
  enfileirar("config", json, true);  // o app recebe a configuração nova
  return true;
}

void carregarConfig() {
  configPadrao();
  size_t n = prefs.isKey(CHAVE_CONFIG) ? prefs.getBytesLength(CHAVE_CONFIG) : 0;
  if (n == 0) {
    registrar("Sem configuracao salva: usando o padrao de fabrica");
    salvarConfig();
    return;
  }
  char* buf = (char*)malloc(n);
  if (!buf) { registrar("ERRO: memoria insuficiente para ler a configuracao"); return; }
  prefs.getBytes(CHAVE_CONFIG, buf, n);
  JsonDocument doc;
  DeserializationError e = deserializeJson(doc, buf, n);
  free(buf);
  if (e) {
    registrar("ERRO ao ler a configuracao (%s): usando o padrao", e.c_str());
    return;
  }
  cfg.pausaVisitaMin = doc["pausaVisitaMin"] | 30;
  cfg.soMotorMin = doc["soMotorMin"] | 15;
  String erro;
  uint8_t i = 0;
  for (JsonVariantConst v : doc["setores"].as<JsonArrayConst>()) {
    if (i < NUM_SETORES) setorDeJson(v.as<JsonObjectConst>(), cfg.setores[i++], erro);
  }
  cfg.nRotinas = 0;
  for (JsonVariantConst v : doc["rotinas"].as<JsonArrayConst>()) {
    if (cfg.nRotinas >= MAX_ROTINAS) break;
    JsonObjectConst o = v.as<JsonObjectConst>();
    Rotina r = rotinaVazia();
    r.id = o["id"] | 0;
    if (r.id > 0 && rotinaDeJson(o, r, erro)) cfg.rotinas[cfg.nRotinas++] = r;
    else registrar("Rotina invalida ignorada: %s", erro.c_str());
  }
  registrar("Configuracao carregada: %u rotinas", cfg.nRotinas);
}

// ============================ Saídas ============================
void escreverRele(uint8_t pino, bool ligado) {
  digitalWrite(pino, ligado == RELE_ATIVO_EM_ALTO ? HIGH : LOW);
}

void setBomba(bool ligar) {
  if (ligar == bombaLigada) return;
  bombaLigada = ligar;
  if (ligar) bombaDesde = millis();
  escreverRele(PINO_BOMBA, ligar);
  registrar("Bomba %s", ligar ? "LIGADA" : "desligada");
}

void setValvula(uint8_t i, bool abrir) {
  if (valvula[i] == abrir) return;
  valvula[i] = abrir;
  escreverRele(PINO_SETOR[i], abrir);
  registrar("Setor %u (%s) %s", i + 1, cfg.setores[i].nome, abrir ? "ABERTO" : "fechado");
}

void fecharTodas() {
  for (uint8_t i = 0; i < NUM_SETORES; i++) setValvula(i, false);
}

// ======================= Máquina do ciclo =======================
void entrar(Estado e) {
  ciclo.estado = e;
  ciclo.desde = millis();
}

// manual = true ignora o status "vazio" (mas nunca abre setor não instalado)
bool iniciarCiclo(int16_t rotinaId, uint8_t setores, uint16_t ligadoS, uint16_t misturaS, bool manual) {
  ciclo.nFila = 0;
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    if (!((setores >> i) & 1)) continue;
    const Setor& s = cfg.setores[i];
    if (!s.instalado) registrar("Setor %u nao instalado: pulado", i + 1);
    else if (!s.mudas && !manual) registrar("Setor %u (%s) vazio: pulado", i + 1, s.nome);
    else ciclo.fila[ciclo.nFila++] = i;
  }
  if (ciclo.nFila == 0) {
    registrar("Nenhum setor disponivel: ciclo nao executado (bomba nao liga)");
    return false;
  }
  ciclo.rotinaId = rotinaId;
  ciclo.pos = 0;
  ciclo.ligadoMs = ligadoS * 1000UL;
  ciclo.misturaMs = misturaS * 1000UL;
  if (ciclo.misturaMs > 0) {
    registrar("Misturando adubo por %us (so motor, agua volta pelo retorno)", misturaS);
    setBomba(true);
    entrar(MISTURANDO);
  } else {
    setValvula(ciclo.fila[0], true);
    entrar(ABRINDO);
  }
  return true;
}

void finalizarCiclo() {
  int i = rotinaPorId(ciclo.rotinaId);
  if (i >= 0) cfg.rotinas[i].fimUltimoCiclo = agora.unixtime();
  ciclo.estado = OCIOSO;
  ciclo.rotinaId = -1;
  registrar("Ciclo encerrado");
}

void abortarCiclo(const char* motivo) {
  if (ciclo.estado == OCIOSO || ciclo.estado == DESLIGANDO) return;
  registrar("Ciclo interrompido: %s", motivo);
  setBomba(false);
  entrar(DESLIGANDO);
}

void tickCiclo() {
  uint32_t t = millis() - ciclo.desde;
  switch (ciclo.estado) {
    case OCIOSO:
      break;
    case MISTURANDO:  // bomba já ligada; abre o 1º setor direto
      if (t >= ciclo.misturaMs) {
        setValvula(ciclo.fila[0], true);
        entrar(IRRIGANDO);
      }
      break;
    case ABRINDO:  // válvula aberta, bomba ainda desligada
      if (t >= ANTECIPA_VALVULA_MS) {
        setBomba(true);
        entrar(IRRIGANDO);
      }
      break;
    case IRRIGANDO:
      if (t >= ciclo.ligadoMs) {
        if (ciclo.pos + 1 < ciclo.nFila) {
          setValvula(ciclo.fila[ciclo.pos + 1], true);  // abre o próximo antes de fechar o atual
          entrar(TROCANDO);
        } else {
          setBomba(false);
          entrar(DESLIGANDO);
        }
      }
      break;
    case TROCANDO:
      if (t >= SOBREPOSICAO_MS) {
        setValvula(ciclo.fila[ciclo.pos], false);
        ciclo.pos++;
        entrar(IRRIGANDO);
      }
      break;
    case DESLIGANDO:  // bomba já desligada; fecha as válvulas depois do retardo
      if (t >= RETARDO_FECHA_MS) {
        fecharTodas();
        finalizarCiclo();
      }
      break;
  }
}

// ============================ Agendador ============================
// A janela está aberta agora? Devolve em "abertura" o instante (unixtime) em que ela abriu.
bool janelaAberta(const Rotina& r, uint32_t& abertura) {
  uint16_t m = agora.hour() * 60 + agora.minute();
  uint32_t meiaNoite = meiaNoiteHoje();
  uint8_t dia = agora.dayOfTheWeek();
  if (r.inicio < r.fim) {
    if (m < r.inicio || m >= r.fim) return false;
    abertura = meiaNoite + r.inicio * 60UL;
  } else {  // cruza a meia-noite (ex.: 22:00 -> 02:00)
    if (m >= r.inicio) abertura = meiaNoite + r.inicio * 60UL;
    else if (m < r.fim) {
      abertura = meiaNoite - 86400UL + r.inicio * 60UL;
      dia = (dia + 6) % 7;  // a janela abriu ontem
    } else return false;
  }
  return (r.dias >> dia) & 1;
}

bool rotinaDevida(const Rotina& r, bool& primeiro) {
  uint32_t abertura;
  if (!r.ativa || !janelaAberta(r, abertura)) return false;
  primeiro = r.fimUltimoCiclo < abertura;
  if (primeiro) return true;
  if (r.pausaS == 0) return false;  // execução única por janela
  return agora.unixtime() >= r.fimUltimoCiclo + r.pausaS;
}

void agendador() {
  if (modo != AUTOMATICO || ciclo.estado != OCIOSO) return;
  for (uint8_t i = 0; i < cfg.nRotinas; i++) {
    Rotina& r = cfg.rotinas[i];
    bool primeiro;
    if (!rotinaDevida(r, primeiro)) continue;
    uint16_t mistura = (r.tipo == ADUBACAO && primeiro) ? r.misturaS : 0;
    registrar("Rotina #%u '%s': iniciando ciclo", r.id, r.nome);
    if (!iniciarCiclo(r.id, r.setores, r.ligadoS, mistura, false)) {
      r.fimUltimoCiclo = agora.unixtime();  // tenta de novo só depois da pausa
    }
    return;
  }
}

// ============================ Modos ============================
void mudarModo(Modo m) {
  if (m == modo) return;
  if (modo == SO_MOTOR) setBomba(false);
  modo = m;
  modoDesde = millis();
  registrar(">>> Modo: %s", NOME_MODO[m]);
  if (m != AUTOMATICO) abortarCiclo(NOME_MODO[m]);
}

uint32_t modoRestanteS() {
  uint32_t s = (millis() - modoDesde) / 1000;
  uint32_t lim = modo == PAUSA_VISITA ? cfg.pausaVisitaMin * 60UL : modo == SO_MOTOR ? cfg.soMotorMin * 60UL : 0;
  return lim > s ? lim - s : 0;
}

void tickModo() {
  if (modo == SO_MOTOR && ciclo.estado == OCIOSO) setBomba(true);  // só liga depois das válvulas fechadas
  if (modo != AUTOMATICO && modoRestanteS() == 0) {
    registrar("Tempo maximo do modo %s atingido", NOME_MODO[modo]);
    mudarModo(AUTOMATICO);
  }
}

void failsafe() {
  if (!bombaLigada || modo == SO_MOTOR) return;
  if ((millis() - bombaDesde) / 1000 >= BOMBA_MAX_S) abortarCiclo("FAILSAFE: bomba ligada tempo demais");
}

bool apertou(Botao& b) {
  bool leitura = digitalRead(b.pino);
  if (leitura != b.ultimo) {
    b.ultimo = leitura;
    b.t = millis();
  }
  if (millis() - b.t > 40 && leitura != b.estavel) {
    b.estavel = leitura;
    return leitura == LOW;
  }
  return false;
}

// ======================= Prévia e conflitos =======================
bool contemMinuto(uint16_t ini, uint16_t fim, uint16_t m) {
  return ini < fim ? (m >= ini && m < fim) : (m >= ini || m < fim);
}

void avisarConflitos(const Rotina& r) {
  if (!r.ativa) return;
  for (uint8_t i = 0; i < cfg.nRotinas; i++) {
    const Rotina& o = cfg.rotinas[i];
    if (o.id == r.id || !o.ativa || !(o.dias & r.dias)) continue;
    if (contemMinuto(r.inicio, r.fim, o.inicio) || contemMinuto(o.inicio, o.fim, r.inicio)) {
      out.printf("  ATENCAO: conflita com a rotina #%u '%s' (%s-%s). Quem estiver rodando termina o ciclo antes.\n",
                 o.id, o.nome, fmtHora(o.inicio).c_str(), fmtHora(o.fim).c_str());
    }
  }
}

void imprimirPrevia(const Rotina& r) {
  uint8_t n = 0;
  for (uint8_t i = 0; i < NUM_SETORES; i++)
    if (((r.setores >> i) & 1) && cfg.setores[i].instalado && cfg.setores[i].mudas) n++;
  if (n == 0) {
    out.println(F("  Previa: nenhum setor instalado e com mudas -> a bomba nao vai ligar."));
    return;
  }
  uint32_t janela = ((r.fim + 1440 - r.inicio) % 1440) * 60UL;
  uint32_t duracao = (ANTECIPA_VALVULA_MS + RETARDO_FECHA_MS) / 1000 + n * (uint32_t)r.ligadoS;
  uint32_t t = 0;
  uint16_t ciclos = 0;
  out.print(F("  Previa (aprox.):"));
  while (t < janela) {
    if (ciclos < 12) {
      uint32_t s = r.inicio * 60UL + t;
      out.printf(" %02u:%02u:%02u", (unsigned)((s / 3600) % 24), (unsigned)((s / 60) % 60), (unsigned)(s % 60));
    }
    ciclos++;
    t += duracao + (ciclos == 1 && r.tipo == ADUBACAO ? r.misturaS : 0) + r.pausaS;
    if (r.pausaS == 0) break;
  }
  out.printf("%s\n  => %u ciclo(s) por janela, ~%us cada, %u setor(es) com mudas\n",
             ciclos > 12 ? " ..." : "", ciclos, (unsigned)duracao, n);
}

// ============================ Impressão ============================
void imprimirRotina(const Rotina& r) {
  out.printf("#%-2u %-12s %-12s %s-%s  ligado %us/setor  pausa %us", r.id, r.nome, NOME_TIPO_ROTINA[r.tipo],
             fmtHora(r.inicio).c_str(), fmtHora(r.fim).c_str(), r.ligadoS, (unsigned)r.pausaS);
  if (r.tipo == ADUBACAO) out.printf("  mistura %us", r.misturaS);
  out.print(F("  setores "));
  for (uint8_t s = 0; s < NUM_SETORES; s++) if ((r.setores >> s) & 1) out.print(s + 1);
  out.print(F("  dias "));
  if (r.dias == DIAS_TODOS) out.print(F("todos"));
  else for (uint8_t d = 0; d < 7; d++) if ((r.dias >> d) & 1) out.printf("%s ", NOME_DIA[d]);
  out.println(r.ativa ? "" : "  (DESATIVADA)");
}

void imprimirRotinas() {
  out.printf("---- Rotinas (%u de %u) ----\n", cfg.nRotinas, MAX_ROTINAS);
  for (uint8_t i = 0; i < cfg.nRotinas; i++) imprimirRotina(cfg.rotinas[i]);
}

void imprimirRede() {
  out.printf("Rede: Wi-Fi %s", wifiOnline ? "conectado" : "DESCONECTADO");
  if (wifiOnline) out.printf(" (%s, IP %s, sinal %d dBm)", WIFI_SSID, WiFi.localIP().toString().c_str(), wifiRssi);
  out.printf(" | MQTT %s (%s:%u, prefixo %s)\n", mqttOnline ? "conectado" : "DESCONECTADO", MQTT_HOST, MQTT_PORTA, MQTT_PREFIXO);
}

void imprimirStatus() {
  out.printf("==== STATUS %s %02d/%02d/%04d %02d:%02d:%02d ====\n", NOME_DIA[agora.dayOfTheWeek()],
             agora.day(), agora.month(), agora.year(), agora.hour(), agora.minute(), agora.second());
  out.printf("Modo: %s", NOME_MODO[modo]);
  if (modo != AUTOMATICO) out.printf(" (volta ao automatico em %us)", (unsigned)modoRestanteS());
  out.printf(" | Ciclo: %s", NOME_ESTADO[ciclo.estado]);
  if (ciclo.estado != OCIOSO) {
    int i = rotinaPorId(ciclo.rotinaId);
    out.printf(" (%s, setor %u de %u)", i >= 0 ? cfg.rotinas[i].nome : "manual", ciclo.pos + 1, ciclo.nFila);
  }
  out.printf("\nBomba: %s\n", bombaLigada ? "LIGADA" : "desligada");
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    const Setor& s = cfg.setores[i];
    out.printf("Setor %u: %-12s %-8s %-15s %s\n", i + 1, s.nome, NOME_TIPO_SETOR[s.tipo],
               !s.instalado ? "NAO INSTALADO" : (s.mudas ? "com mudas" : "VAZIO"), valvula[i] ? "ABERTO" : "fechado");
  }
  imprimirRede();
}

void imprimirAjuda() {
  out.println(F("---- Comandos (Serial ou MQTT <prefixo>/cmd) ----"));
  out.println(F("status | rotinas | config | rede  estado, rotinas, configuracao (JSON), conexao"));
  out.println(F("hora HH:MM[:SS] | data AAAA-MM-DD"));
  out.println(F("pausa | motor | parar            pausa visita, so motor, interrompe o ciclo atual"));
  out.println(F("setor N S                        abre o setor N por S segundos (manual)"));
  out.println(F("bloco N mudas|vazio              marca o bloco com mudas ou vazio"));
  out.println(F("rotina {json}                    cria (sem id) ou altera (com id) uma rotina"));
  out.println(F("   ex.: rotina {\"nome\":\"Noite\",\"inicio\":\"22:00\",\"fim\":\"02:00\",\"ligado\":20,\"pausa\":600,\"setores\":[1,2]}"));
  out.println(F("   ex.: rotina {\"id\":1,\"ligado\":45}"));
  out.println(F("apagar ID | ativar ID | desativar ID | prever ID"));
  out.println(F("setorcfg N {json}                ex.: setorcfg 5 {\"nome\":\"Nebulizador\",\"instalado\":false}"));
  out.println(F("param {json}                     ex.: param {\"pausaVisitaMin\":20,\"soMotorMin\":10}"));
  out.println(F("fabrica | reiniciar              volta ao padrao de fabrica | reinicia o ESP32"));
}

// ============================ Comandos ============================
void reiniciarAgenda() {
  for (uint8_t i = 0; i < cfg.nRotinas; i++) cfg.rotinas[i].fimUltimoCiclo = 0;
}

void cmdRotina(const String& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) { out.println(F("JSON invalido.")); return; }
  JsonObjectConst o = doc.as<JsonObjectConst>();
  String erro;
  int id = o["id"] | 0;
  int idx = -1;
  Rotina r;
  if (id > 0) {
    idx = rotinaPorId(id);
    if (idx < 0) { out.printf("Rotina #%d nao existe.\n", id); return; }
    r = cfg.rotinas[idx];
  } else {
    if (cfg.nRotinas >= MAX_ROTINAS) { out.println(F("Limite de rotinas atingido.")); return; }
    r = rotinaVazia();
    uint8_t maior = 0;
    for (uint8_t i = 0; i < cfg.nRotinas; i++) maior = max(maior, cfg.rotinas[i].id);
    r.id = maior + 1;
  }
  if (!rotinaDeJson(o, r, erro)) { out.printf("Erro: %s\n", erro.c_str()); return; }
  r.fimUltimoCiclo = 0;
  if (idx >= 0) cfg.rotinas[idx] = r;
  else cfg.rotinas[cfg.nRotinas++] = r;
  salvarConfig();
  registrar("Rotina #%u %s e salva", r.id, idx >= 0 ? "alterada" : "criada");
  imprimirRotina(r);
  imprimirPrevia(r);
  avisarConflitos(r);
}

void cmdApagar(int id) {
  int idx = rotinaPorId(id);
  if (idx < 0) { out.printf("Rotina #%d nao existe.\n", id); return; }
  if (ciclo.rotinaId == id) abortarCiclo("rotina apagada");
  for (uint8_t i = idx; i + 1 < cfg.nRotinas; i++) cfg.rotinas[i] = cfg.rotinas[i + 1];
  cfg.nRotinas--;
  salvarConfig();
  registrar("Rotina #%d apagada", id);
}

void cmdAtivar(int id, bool ativa) {
  int idx = rotinaPorId(id);
  if (idx < 0) { out.printf("Rotina #%d nao existe.\n", id); return; }
  cfg.rotinas[idx].ativa = ativa;
  if (!ativa && ciclo.rotinaId == id) abortarCiclo("rotina desativada");
  salvarConfig();
  registrar("Rotina #%d %s", id, ativa ? "ativada" : "desativada");
}

void processarComando(String linha) {
  linha.trim();
  if (linha.length() == 0) return;
  int esp = linha.indexOf(' ');
  String cmd = esp < 0 ? linha : linha.substring(0, esp);
  String resto = esp < 0 ? "" : linha.substring(esp + 1);
  cmd.toLowerCase();
  resto.trim();
  int a, b, c = 0;

  if (cmd == "ajuda" || cmd == "?") imprimirAjuda();
  else if (cmd == "status") imprimirStatus();
  else if (cmd == "rotinas") imprimirRotinas();
  else if (cmd == "rede") imprimirRede();
  else if (cmd == "config") {
    JsonDocument doc;
    configParaJson(doc);
    serializeJsonPretty(doc, out);
    out.println();
  } else if (cmd == "pausa") mudarModo(modo == PAUSA_VISITA ? AUTOMATICO : PAUSA_VISITA);
  else if (cmd == "motor") mudarModo(modo == SO_MOTOR ? AUTOMATICO : SO_MOTOR);
  else if (cmd == "parar") abortarCiclo("comando parar");
  else if (cmd == "hora" && sscanf(resto.c_str(), "%d:%d:%d", &a, &b, &c) >= 2) {
    rtc.adjust(DateTime(agora.year(), agora.month(), agora.day(), a, b, c));
    agora = rtc.now();
    reiniciarAgenda();
    registrar("Hora ajustada");
  } else if (cmd == "data" && sscanf(resto.c_str(), "%d-%d-%d", &a, &b, &c) == 3) {
    rtc.adjust(DateTime(a, b, c, agora.hour(), agora.minute(), agora.second()));
    agora = rtc.now();
    reiniciarAgenda();
    registrar("Data ajustada: %s %02d/%02d/%04d", NOME_DIA[agora.dayOfTheWeek()], agora.day(), agora.month(), agora.year());
  } else if (cmd == "setor" && sscanf(resto.c_str(), "%d %d", &a, &b) == 2 && a >= 1 && a <= NUM_SETORES && b > 0) {
    if (modo != AUTOMATICO || ciclo.estado != OCIOSO) registrar("Ocupado: aguarde o ciclo atual ou saia do modo %s", NOME_MODO[modo]);
    else {
      registrar("Acionamento manual: setor %d por %ds", a, b);
      iniciarCiclo(-1, 1 << (a - 1), b, 0, true);
    }
  } else if (cmd == "bloco" && sscanf(resto.c_str(), "%d", &a) == 1 && a >= 1 && a <= NUM_SETORES &&
             (resto.endsWith("mudas") || resto.endsWith("vazio"))) {
    cfg.setores[a - 1].mudas = resto.endsWith("mudas");
    salvarConfig();
    registrar("Setor %d (%s) marcado como %s", a, cfg.setores[a - 1].nome, cfg.setores[a - 1].mudas ? "COM MUDAS" : "VAZIO");
  } else if (cmd == "rotina") cmdRotina(resto);
  else if (cmd == "apagar" && sscanf(resto.c_str(), "%d", &a) == 1) cmdApagar(a);
  else if (cmd == "ativar" && sscanf(resto.c_str(), "%d", &a) == 1) cmdAtivar(a, true);
  else if (cmd == "desativar" && sscanf(resto.c_str(), "%d", &a) == 1) cmdAtivar(a, false);
  else if (cmd == "prever" && sscanf(resto.c_str(), "%d", &a) == 1) {
    int idx = rotinaPorId(a);
    if (idx < 0) out.printf("Rotina #%d nao existe.\n", a);
    else {
      imprimirRotina(cfg.rotinas[idx]);
      imprimirPrevia(cfg.rotinas[idx]);
      avisarConflitos(cfg.rotinas[idx]);
    }
  } else if (cmd == "setorcfg" && sscanf(resto.c_str(), "%d", &a) == 1 && a >= 1 && a <= NUM_SETORES) {
    JsonDocument doc;
    String erro;
    int j = resto.indexOf('{');
    if (j < 0 || deserializeJson(doc, resto.substring(j)) || !doc.is<JsonObject>()) out.println(F("JSON invalido."));
    else {
      Setor s = cfg.setores[a - 1];
      if (!setorDeJson(doc.as<JsonObjectConst>(), s, erro)) out.printf("Erro: %s\n", erro.c_str());
      else {
        cfg.setores[a - 1] = s;
        if (!s.instalado) setValvula(a - 1, false);
        salvarConfig();
        registrar("Setor %d salvo: %s, %s, %s", a, s.nome, NOME_TIPO_SETOR[s.tipo], s.instalado ? "instalado" : "NAO instalado");
      }
    }
  } else if (cmd == "param") {
    JsonDocument doc;
    if (deserializeJson(doc, resto) || !doc.is<JsonObject>()) out.println(F("JSON invalido."));
    else {
      long pv = doc["pausaVisitaMin"] | (long)cfg.pausaVisitaMin;
      long sm = doc["soMotorMin"] | (long)cfg.soMotorMin;
      if (pv < 1 || pv > 240 || sm < 1 || sm > 120) out.println(F("Erro: pausaVisitaMin 1-240, soMotorMin 1-120."));
      else {
        cfg.pausaVisitaMin = pv;
        cfg.soMotorMin = sm;
        salvarConfig();
        registrar("Parametros salvos: pausa visita %u min, so motor %u min", cfg.pausaVisitaMin, cfg.soMotorMin);
      }
    }
  } else if (cmd == "fabrica") {
    abortarCiclo("padrao de fabrica");
    configPadrao();
    salvarConfig();
    registrar("Configuracao de fabrica restaurada");
    imprimirRotinas();
  } else if (cmd == "reiniciar") {
    registrar("Reiniciando...");
    delay(500);  // dá tempo da tarefa de rede publicar a resposta
    ESP.restart();
  } else out.println(F("Comando desconhecido ou incompleto. Digite 'ajuda'."));
}

void lerSerial() {
  static String linha;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      processarComando(linha);
      linha = "";
    } else if (linha.length() < 400) {
      linha += ch;
    }
  }
}

// Comandos que chegaram pelo MQTT: executa e devolve a saída em <prefixo>/resposta.
void processarFilaEntrada() {
  char* cmd;
  while (filaEntrada && xQueueReceive(filaEntrada, &cmd, 0) == pdTRUE) {
    out.printf("[mqtt] > %s\n", cmd);
    out.captura = "";
    out.capturando = true;
    processarComando(String(cmd));
    out.capturando = false;
    JsonDocument doc;
    doc["cmd"] = cmd;
    doc["saida"] = out.captura;
    String s;
    serializeJson(doc, s);
    enfileirar("resposta", s, false);
    out.captura = "";
    free(cmd);
  }
}

// ============================ Status (MQTT) ============================
String statusJson(bool completo) {
  JsonDocument doc;
  doc["modo"] = NOME_MODO[modo];
  doc["ciclo"] = NOME_ESTADO[ciclo.estado];
  if (ciclo.estado != OCIOSO) {
    int i = rotinaPorId(ciclo.rotinaId);
    doc["rotinaId"] = ciclo.rotinaId;
    doc["rotina"] = i >= 0 ? cfg.rotinas[i].nome : "manual";
  }
  doc["bomba"] = bombaLigada;
  JsonArray a = doc["setores"].to<JsonArray>();
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    JsonObject o = a.add<JsonObject>();
    o["n"] = i + 1;
    o["aberto"] = valvula[i];
    o["mudas"] = cfg.setores[i].mudas;
    o["instalado"] = cfg.setores[i].instalado;
  }
  if (completo) {  // campos que mudam o tempo todo: não disparam publicação sozinhos
    char iso[20];
    snprintf(iso, sizeof iso, "%04d-%02d-%02dT%02d:%02d:%02d", agora.year(), agora.month(), agora.day(),
             agora.hour(), agora.minute(), agora.second());
    doc["hora"] = iso;
    if (modo != AUTOMATICO) doc["modoRestanteS"] = modoRestanteS();
    doc["uptimeS"] = millis() / 1000;
    doc["wifiRssi"] = wifiRssi;
  }
  String s;
  serializeJson(doc, s);
  return s;
}

// Publica o status quando algo muda, ou a cada 30 s (retido: o app vê o último estado ao abrir).
void tickStatus() {
  static String ultimo;
  static uint32_t ultimoEnvio = 0, ultimaChecagem = 0;
  if (!mqttOnline || millis() - ultimaChecagem < 250) return;
  ultimaChecagem = millis();
  bool reconectou = republicar;
  String s = statusJson(false);
  if (s != ultimo || reconectou || millis() - ultimoEnvio > 30000) {
    ultimo = s;
    ultimoEnvio = millis();
    enfileirar("status", statusJson(true), true);
  }
  if (reconectou) {
    republicar = false;
    publicarConfig();
  }
}

// ============================ Relógio (NTP) ============================
// Acerta o RTC pela internet na 1ª sincronização e depois a cada 6 h.
void sincronizarRelogio() {
  static uint32_t ultima = 0, ultimaChecagem = 0;
  static bool sincronizado = false;
  if (!wifiOnline || millis() - ultimaChecagem < 1000) return;
  ultimaChecagem = millis();
  if (sincronizado && millis() - ultima < 6UL * 3600 * 1000) return;
  struct tm tm;
  if (!getLocalTime(&tm, 0)) return;  // NTP ainda não respondeu
  sincronizado = true;
  ultima = millis();
  DateTime ntp(tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
  long dif = (long)ntp.unixtime() - (long)agora.unixtime();
  if (labs(dif) <= 2) {
    registrar("Relogio conferido pela internet (ok)");
    return;
  }
  rtc.adjust(ntp);
  agora = rtc.now();
  if (labs(dif) > 300) reiniciarAgenda();
  registrar("Relogio acertado pela internet (diferenca de %lds)", dif);
}

// ============================ Tarefa de rede ============================
void aoReceberMqtt(char* topico, byte* payload, unsigned int len) {
  char* cmd = (char*)malloc(len + 1);
  if (!cmd) return;
  memcpy(cmd, payload, len);
  cmd[len] = 0;
  if (xQueueSend(filaEntrada, &cmd, 0) != pdTRUE) free(cmd);
}

void tarefaRede(void* arg) {
  String tConexao = String(MQTT_PREFIXO) + "/conexao";
  String tCmd = String(MQTT_PREFIXO) + "/cmd";
  String idCliente = String("viveiro-") + String((uint32_t)ESP.getEfuseMac(), HEX) + "-" + String(esp_random() & 0xffff, HEX);
  uint32_t ultimaTentativaWifi = millis(), ultimaTentativaMqtt = 0;

#if MQTT_TLS
  clienteRede.setCACert(CA_RAIZ);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORTA);
  mqtt.setCallback(aoReceberMqtt);
  mqtt.setBufferSize(6144);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(5);

  WiFi.begin(WIFI_SSID, WIFI_SENHA, WIFI_CANAL);
  Serial.printf("[rede] Conectando ao Wi-Fi '%s'...\n", WIFI_SSID);

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiOnline) {
        wifiOnline = mqttOnline = false;
        Serial.println("[rede] Wi-Fi caiu (a irrigacao continua normalmente)");
      }
      if (millis() - ultimaTentativaWifi > 15000) {
        ultimaTentativaWifi = millis();
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_SENHA, WIFI_CANAL);
      }
    } else {
      if (!wifiOnline) {
        wifiOnline = true;
        Serial.printf("[rede] Wi-Fi conectado, IP %s\n", WiFi.localIP().toString().c_str());
      }
      wifiRssi = WiFi.RSSI();
      if (!mqtt.connected()) {
        if (mqttOnline) {
          mqttOnline = false;
          Serial.println("[rede] MQTT desconectado");
        }
        if (millis() - ultimaTentativaMqtt > 5000) {
          ultimaTentativaMqtt = millis();
          bool ok = MQTT_USUARIO[0]
                        ? mqtt.connect(idCliente.c_str(), MQTT_USUARIO, MQTT_SENHA, tConexao.c_str(), 1, true, "offline")
                        : mqtt.connect(idCliente.c_str(), tConexao.c_str(), 1, true, "offline");
          if (ok) {
            mqtt.publish(tConexao.c_str(), "online", true);
            mqtt.subscribe(tCmd.c_str(), 1);
            mqttOnline = true;
            republicar = true;
            Serial.printf("[rede] MQTT conectado em %s - prefixo %s\n", MQTT_HOST, MQTT_PREFIXO);
          } else {
            Serial.printf("[rede] Falha no MQTT (codigo %d), nova tentativa em 5 s\n", mqtt.state());
          }
        }
      } else {
        mqtt.loop();
      }
    }
    MsgSaida m;
    while (xQueueReceive(filaSaida, &m, 0) == pdTRUE) {
      if (mqtt.connected()) mqtt.publish(m.topico, (const uint8_t*)m.payload, strlen(m.payload), m.retain);
      free(m.topico);
      free(m.payload);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// ============================ Watchdog ============================
void iniciarWatchdog() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t c = {};
  c.timeout_ms = WDT_S * 1000;
  c.idle_core_mask = 0;
  c.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&c) != ESP_OK) esp_task_wdt_init(&c);  // o core 3.x normalmente já inicia o WDT
#else
  esp_task_wdt_init(WDT_S, true);
#endif
  esp_task_wdt_add(NULL);  // vigia só a tarefa da irrigação; a de rede pode demorar à vontade
}

// ============================ Setup / Loop ============================
void setup() {
  Serial.begin(115200);

  escreverRele(PINO_BOMBA, false);
  pinMode(PINO_BOMBA, OUTPUT);
  for (uint8_t i = 0; i < NUM_SETORES; i++) {
    escreverRele(PINO_SETOR[i], false);
    pinMode(PINO_SETOR[i], OUTPUT);
  }
  pinMode(PINO_BTN_PAUSA, INPUT_PULLUP);
  pinMode(PINO_BTN_MOTOR, INPUT_PULLUP);

  Wire.begin(21, 22);
  if (!rtc.begin()) Serial.println(F("ERRO: RTC nao encontrado!"));
#if SIMULADOR
  if (!rtc.isrunning()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
#else
  if (rtc.lostPower()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
#endif
  agora = rtc.now();
  modoDesde = millis();

  Serial.println(F("\n=== Irrigacao Viveiro - Fase 3 ==="));
  if (!prefs.begin("irrigacao", false)) Serial.println(F("ERRO: NVS indisponivel (configuracao nao sera salva)"));
  carregarConfig();
  iniciarWatchdog();

  // A pilha de rede e o NTP são iniciados aqui, na tarefa principal (no core 3.x o
  // configTzTime chamado de outra tarefa derruba o ESP32 com "assert failed").
  WiFi.mode(WIFI_STA);
  configTzTime(FUSO_HORARIO, "pool.ntp.org", "time.google.com");
  filaEntrada = xQueueCreate(10, sizeof(char*));
  filaSaida = xQueueCreate(40, sizeof(MsgSaida));
  xTaskCreatePinnedToCore(tarefaRede, "rede", 8192, nullptr, 1, nullptr, 0);

  imprimirRotinas();
  out.println(F("Digite 'ajuda' para ver os comandos."));
  imprimirStatus();
}

void loop() {
  static uint32_t ultimaLeitura = 0;
  if (millis() - ultimaLeitura >= 200) {
    ultimaLeitura = millis();
    agora = rtc.now();
  }

  lerSerial();
  processarFilaEntrada();
  if (apertou(btnPausa)) mudarModo(modo == PAUSA_VISITA ? AUTOMATICO : PAUSA_VISITA);
  if (apertou(btnMotor)) mudarModo(modo == SO_MOTOR ? AUTOMATICO : SO_MOTOR);

  tickModo();
  agendador();
  tickCiclo();
  failsafe();
  sincronizarRelogio();
  tickStatus();
  esp_task_wdt_reset();
  delay(5);
}
