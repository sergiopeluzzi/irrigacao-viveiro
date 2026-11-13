# Automação de Irrigação — Viveiro de Mudas de Café

Controlador de irrigação/fertirrigação para um viveiro de mudas de café, com app web para acesso remoto.
Substitui o temporizador atual (que só permite "tempo em tempo" e "tempo ligado").

> Status: **Fases 1 a 4 prontas e publicadas (app: https://irrigacao-viveiro.vercel.app) — próximo passo: Fase 5 (sensores) ou compra do hardware (Fase 6).**
> Última atualização: 2026-11-12

---

## 1. Pedido original do cliente

- Ativar o motor elétrico (bomba d'água) e as válvulas solenoides que dividem os setores do viveiro.
- Rotina personalizada, ex.:
  - Liga às 07:00 por 30 s, intervalo de 4 min, liga mais 30 s… (manhã)
  - Do meio-dia ao fim da tarde: intervalos de 5 min com irrigação de 1 min.
- Acesso remoto às informações (está ligado ou não).
- Ligar **só o motor**, sem abrir solenoides (para misturar o adubo antes de mandar para as plantas).
- Ligar/desligar a irrigação **com um clique** (para não molhar visitas olhando as mudas).

Extras propostos por nós: sensores de umidade/temperatura e automações baseadas neles.

---

## 2. Respostas do levantamento

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Quantos setores? | Hoje existe **1 solenoide**; a divisão de setores é feita **na mão, por registros**. Objetivo: **6 solenoides** = **4 setores internos** (blocos de mudas) + **2 externos "para climatização"**. |
| 1b | Setores em sequência ou juntos? | **Em sequência** (um por vez) — por causa da pressão (ver §4.3). |
| 2 | Tensão | Solenoide: **110 V**. Bomba: cliente **acha que é 220 V, talvez bivolt** — **não confirmado**. Potência desconhecida. |
| 3 | Rotinas | **Totalmente configuráveis**. Formato: *liga às 07:00, por 30 s, a cada 4 min, até 08:00*. |
| 4 | Cano de retorno volta pro tanque de mistura? | **Não sabe** (provável que sim, já que misturam adubo ligando só o motor). |
| 5 | Wi‑Fi no local? | **Sim.** Falta testar o sinal no local do quadro. |
| — | Localização | Viveiro em **Rondônia** (fuso UTC‑4, sem horário de verão). |
| 6 | Substitui ou fica em paralelo ao controlador atual? | **Substitui.** |
| 7 | Nobreak? | Falta de energia não é frequente, mas **vale ter**. |
| 8 | Stack do app | **A mesma já usada** (NestJS + Prisma + Postgres + React/Vite PWA). |

### Contexto importante (áudios do cliente)

- **Cano de retorno na bomba:** hoje, a cada troca de setor, eles **regulam o retorno na mão** para acertar a pressão.
- **Blocos vazios:** o viveiro trabalha em **rotação de produção** (4 blocos). Quando um bloco está sem bandejas e esquecem o registro aberto, **o adubo vai para o chão**. Querem que, **se o bloco estiver vazio, a solenoide não abra**.

---

## 3. Pendências com o cliente

- [ ] **Foto da plaqueta do motor da bomba** (tensão, potência em cv, corrente, ligação se for bivolt) → define contator e disjuntor.
- [ ] **O que são os 2 setores externos "de climatização"?** Nebulização/resfriamento (aciona por temperatura/umidade) **ou** irrigação de mudas que ficam fora (aclimatação/rustificação)?
- [ ] **O retorno volta para o tanque/caixa onde misturam o adubo?**
- [ ] **Sinal do Wi‑Fi no local do quadro** (teste: abrir um vídeo no celular ali).
- [ ] A "pausa visita" deve parar **também** os setores externos ou só os internos?
- [ ] Foto do quadro elétrico atual e da solenoide existente (etiqueta).

---

## 4. Decisões técnicas

### 4.1 Microcontrolador: ESP32 (não Arduino UNO)
- O UNO não tem Wi‑Fi. O **ESP32** tem Wi‑Fi/Bluetooth, mais memória e pinos, custa ~R$ 40–60 e programa na mesma IDE do Arduino.
- O **Wokwi** simula ESP32 com Wi‑Fi real (dá pra conectar no MQTT).
- O UNO fica para testes de bancada de relés/sensores.

### 4.2 Arquitetura

```
[Sensores] → [ESP32 no viveiro] ⇄ MQTT (internet) ⇄ [Broker HiveMQ] ⇄ [API NestJS + Postgres] ⇄ [App PWA React]
                   ↓
         [Módulo 8 relés] → [Contator da bomba] + [6 solenoides 110 V]
```

**Regra de ouro:** as rotinas **rodam no ESP32**, não no servidor. Sem internet, a irrigação continua.
O app só envia configuração/comandos; o ESP32 guarda tudo na flash.

- **Hora:** NTP pela internet + **RTC DS3231** de backup.
- **Comunicação:** MQTT (status publicado a cada X s, comandos e rotinas recebidos; *Last Will* indica offline).

### 4.3 Pressão por setor
Hoje a pressão é ajustada no retorno, na mão. Automatizado, ninguém mexe no registro — e com blocos entrando/saindo a combinação muda o tempo todo.
- **Recomendação:** **válvula reguladora de pressão em cada setor** (barata) + retorno com abertura fixa.
- Alternativas: (a) só regulagem fixa do retorno (custo zero, pressão desigual); (c) inversor de frequência na bomba (mais caro).
- Setores de irrigação rodam **em sequência**.

### 4.4 Segurança
- **Sequenciamento:** abre a válvula **antes** de ligar a bomba; desliga a bomba **antes** de fechar a válvula (evita golpe de aríete).
- **Tempo máximo** ligado (failsafe) em qualquer modo; modo "só motor" com limite configurável (ex.: 15 min).
- **Watchdog** reinicia o ESP32 se travar.
- Bomba **sempre via contator** (o relé do módulo só aciona a bobina do contator).
- **Chave MANUAL / DESLIGADO / AUTOMÁTICO** no quadro, para operar a bomba se o controlador falhar.
- Instalação elétrica de força feita por **eletricista**.

### 4.5 Energia
- **Nobreak só do controlador** (módulo UPS 5 V com bateria 18650). Mantém o ESP32 online e permite **alerta de falta de energia**.

---

## 5. Regras de negócio

### 5.1 Setores
- Até **6 setores** (sistema preparado para 8). Hoje só o setor 1 está instalado; os outros são ativados no app quando instalados.
- Tipos: **Irrigação/Bloco interno** e **Externo** (a definir — ver pendências).
- Cada bloco interno tem status **🟢 Com mudas / ⚪ Vazio**:
  - Bloco **vazio nunca abre** (vale para água e adubo).
  - Se **todos** os blocos da rotina estiverem vazios, a bomba nem liga.

### 5.2 Rotina
> **Liga às** `07:00` · **por** `30 s` · **pausa** `4 min` · **até** `08:00`

Campos: nome, tipo (Irrigação / Adubação / Climatização), dias da semana, início, fim, tempo ligado, pausa, setores participantes.

- **"Pausa" = intervalo depois de desligar** (como o cliente descreveu: "dá um intervalo de 4 minutos").
- Com vários blocos, cada ciclo: Bloco 1 por 30 s → Bloco 2 por 30 s → … (pulando vazios) → fecha tudo → pausa → repete até o horário final.
- App mostra **prévia** ("vai irrigar 12 vezes entre 07:00 e 08:00", com os horários) e **avisa conflito** entre rotinas sobrepostas.

### 5.3 Adubação (fertirrigação)
1. Liga **só o motor** por X min (mistura via retorno).
2. Abre em sequência **só os blocos com mudas**.
3. Histórico registra quando cada bloco recebeu adubo.

### 5.4 Modos de operação
| Modo | Comportamento |
|------|---------------|
| **Automático** | Segue as rotinas cadastradas. |
| **Pausa visita** | Um clique suspende a irrigação; **volta sozinho** ao automático após X min. |
| **Só motor** | Liga a bomba sem abrir setores, com tempo máximo. |
| **Manual** | Liga/desliga um setor na hora (com tempo máximo). |

### 5.5 Sensores (Fase 5)
- Temperatura/umidade do ar, umidade do solo; gráficos no app.
- Regras ex.: "pula o ciclo se o solo estiver úmido", "aumenta o tempo acima de 32 °C", "nebuliza 20 s a cada 3 min se > 30 °C ou UR < 60 %" (se os externos forem nebulização).

### 5.6 Futuro (opcional)
- **Lote por bloco** (data de entrada, variedade, fase da muda): sugerir rotina pela idade e marcar como vazio na data de saída. O banco já deve prever isso.

---

## 6. Stack do app

| Parte | Tecnologia |
|-------|-----------|
| Firmware | ESP32, Arduino framework (PlatformIO ou Arduino IDE) |
| Broker | EMQX Cloud Serverless (plano grátis) |
| API | NestJS + `@nestjs/microservices` (MQTT) + Prisma |
| Banco | Postgres (Neon grátis) |
| Front | React + Vite, **PWA** (instala no celular) |
| Deploy | Front na Vercel; API no Render **plano pago** (o grátis dorme após 15 min e perde histórico/alertas) |

Funções do app: login, dashboard ao vivo (online/offline, bomba, setores, modo, sensores), botões grandes **Pausar irrigação** e **Só motor**, cadastro de rotinas e de status dos blocos, histórico, alertas (offline, falta de energia).

---

## 7. Lista de compras preliminar (validar após pendências)

| Item | Obs. |
|------|------|
| ESP32 DevKit V1 (ou versão com antena externa) | Antena externa se o Wi‑Fi for fraco no quadro |
| Módulo **8 relés** com optoacoplador | Bomba + 6 setores + 1 reserva (contatos 10 A / 250 VAC) |
| **Contator** para a bomba | Dimensionar pela plaqueta (220 V?, cv?) |
| Disjuntor/proteção do motor | Idem |
| RTC **DS3231** | Backup de hora |
| Sensor do ar **SHT31/SHT40** | DHT22 sofre em ambiente sempre úmido |
| Sensor de solo **capacitivo** v1.2 | Resistivo corrói |
| 5 solenoides **110 V** adicionais | Total de 6 |
| Válvulas **reguladoras de pressão** por setor | Ver §4.3 |
| Fonte 5 V + módulo UPS 18650 | Nobreak do controlador |
| Chave seletora MAN/0/AUT, caixa **IP65**, bornes, prensa-cabos | Quadro |
| Opcional: sensor de corrente **SCT-013** | Confirma que a bomba está rodando |
| Opcional: sensor de fluxo/pressão, botão físico de pausa | — |

---

## 8. Plano em fases

- [ ] **Fase 0 — Levantamento:** responder pendências (§3).
- [x] **Fase 1 — Firmware básico no Wokwi** (testado em 2026-11-13: rotina da manhã, troca de setores, só motor, pausa visita, bloco vazio e início da adubação): ESP32 + RTC + 8 relés/LEDs + botão; rotinas fixas no código; sequenciamento seguro bomba/válvula.
  ✅ LEDs piscam no ritmo das rotinas de exemplo.
- [x] **Fase 2 — Rotinas configuráveis e persistentes** (testado em 2026-11-13: criar/alterar rotina, validação, bloco vazio, setor não instalado, reiniciar mantendo tudo, rotina cruzando a meia-noite): JSON na flash (NVS/Preferences), modos Pausa/Só motor/Manual, status dos blocos, comandos via Serial.
  ✅ Reinicia e mantém as rotinas.
- [x] **Fase 3 — Conectividade** (testado em 2026-11-13 com broker público: status, config, eventos, comandos e respostas pelo MQTT, aviso de offline, relógio pela internet): Wi‑Fi + MQTT, status periódico, comandos, Last Will.
  ✅ Comando via MQTT Explorer acende o LED no Wokwi.
- [x] **Fase 4 — App web** (testado em 2026-11-13 contra o Wokwi, rodando local; ainda não publicado): API NestJS + Postgres + PWA React (login, dashboard, rotinas, blocos, histórico).
  ✅ Cliente opera tudo pelo celular contra o simulador.
- [ ] **Fase 5 — Sensores e automações:** sensores (potenciômetros no Wokwi), gráficos, regras.
- [ ] **Fase 6 — Hardware real / bancada:** comprar, montar, testar com solenoide real e lâmpada no lugar da bomba por 3–7 dias.
- [ ] **Fase 7 — Instalação:** quadro IP65, contator, chave MAN/0/AUT, eletricista; comissionamento setor a setor.
- [ ] **Fase 8 — Operação:** OTA (atualização remota), alerta de offline, manual simples do cliente.

---

## 9. Firmware (Fases 1 a 3) — como rodar no Wokwi

Arquivos em [`firmware/`](firmware/): `sketch.ino` (firmware), `diagram.json` (circuito), `libraries.txt` (bibliotecas).

1. Acesse **https://wokwi.com/projects/new/esp32** (faça login pra poder salvar o projeto).
2. Aba **sketch.ino** → apague tudo e cole o conteúdo de `firmware/sketch.ino`.
3. Aba **diagram.json** → apague tudo e cole o conteúdo de `firmware/diagram.json`.
4. As bibliotecas **RTClib**, **ArduinoJson** e **PubSubClient** são detectadas pelos `#include` (aba `libraries.txt`). Se não aparecerem, adicione pelo **Library Manager → +**.
5. Clique em **▶ (play)**. A compilação pode demorar (fila do Wokwi na conta grátis).

### O circuito

| Componente | Pino ESP32 | Papel |
|------------|-----------|-------|
| LED vermelho "Bomba" | 23 | Relé/contator da bomba |
| LEDs verdes S1–S4 | 19, 18, 5, 17 | Solenoides dos blocos internos |
| LEDs azuis S5–S6 | 16, 4 | Solenoides dos setores externos |
| Botão amarelo | 32 | Pausa visita (liga/desliga) |
| Botão azul | 33 | Só motor (liga/desliga) |
| RTC DS1307 (SDA/SCL) | 21 / 22 | Relógio (na placa real será DS3231) |

> No simulador as saídas acendem em nível ALTO (LED). Na placa real, módulos de relé costumam acionar em BAIXO — o firmware trata isso com `#define SIMULADOR 0`.
> A chave DIP da Fase 1 saiu: o status "com mudas / vazio" agora é configuração salva (comando `bloco`, e depois pelo app).

### Configuração (salva na flash — NVS / Preferences)

Tudo que o cliente vai cadastrar no app fica num JSON — **o mesmo formato que o app vai mandar via MQTT na Fase 3**. Veja com o comando `config`:

```json
{
  "pausaVisitaMin": 30, "soMotorMin": 15,
  "setores": [
    { "n": 1, "nome": "Bloco 1", "tipo": "interno", "instalado": true, "mudas": true },
    { "n": 5, "nome": "Externo 1", "tipo": "externo", "instalado": true, "mudas": true }
  ],
  "rotinas": [
    { "id": 1, "nome": "Manha", "tipo": "irrigacao", "dias": "todos",
      "inicio": "07:00", "fim": "08:00", "ligado": 30, "pausa": 240, "setores": [1,2,3,4], "ativa": true },
    { "id": 3, "nome": "Adubacao", "tipo": "adubacao", "dias": ["seg"],
      "inicio": "09:00", "fim": "09:01", "ligado": 60, "pausa": 0, "mistura": 180, "setores": [1,2,3,4], "ativa": true }
  ]
}
```

**Campos da rotina**

| Campo | Valores | Observação |
|-------|---------|-----------|
| `nome` | até 23 caracteres | obrigatório |
| `tipo` | `irrigacao`, `adubacao`, `climatizacao` | padrão `irrigacao` |
| `dias` | `"todos"` ou `["seg","qua",...]` (dom seg ter qua qui sex sab) | dia em que a janela **abre** |
| `inicio` / `fim` | `"HH:MM"` | `fim` menor que `inicio` = **cruza a meia-noite** (ex.: 22:00 → 02:00) |
| `ligado` | 1–3600 s | tempo **por setor** |
| `pausa` | 0–86400 s | intervalo depois de desligar; **0 = roda uma vez só** na janela |
| `mistura` | 0–3600 s | só `adubacao`: motor sozinho antes do 1º ciclo |
| `setores` | `[1,2,3,4]` | setores vazios ou não instalados são pulados |
| `ativa` | `true` / `false` | |

Padrão de fábrica: as 3 rotinas de exemplo (Manha 07:00–08:00, Tarde 12:00–17:30, Adubacao segunda 09:00), setores 1–4 internos e 5–6 externos, todos instalados e com mudas.

### Comandos no Serial Monitor

| Comando | O que faz |
|---------|-----------|
| `ajuda` | lista os comandos |
| `status` / `rotinas` / `config` | estado atual / lista de rotinas / configuração completa em JSON |
| `hora 06:59:50` / `data 2026-11-16` | ajusta relógio (pra testar sem esperar) |
| `pausa` / `motor` / `parar` | pausa visita / só motor / interrompe o ciclo atual |
| `setor 3 20` | abre o setor 3 por 20 s (manual; funciona mesmo com o bloco vazio) |
| `bloco 2 vazio` / `bloco 2 mudas` | marca o bloco (salvo na flash) |
| `rotina {json}` | **sem `id` cria**, **com `id` altera** só os campos enviados. Mostra prévia e conflitos |
| `apagar 4` / `ativar 4` / `desativar 4` | gerencia rotinas pelo id |
| `prever 1` | prévia dos horários e conflitos de uma rotina |
| `setorcfg 5 {"nome":"Nebulizador","instalado":false}` | configura um setor |
| `param {"pausaVisitaMin":20,"soMotorMin":10}` | parâmetros gerais |
| `fabrica` / `reiniciar` | volta ao padrão de fábrica / reinicia o ESP32 |

Exemplos:
```
rotina {"nome":"Noite","inicio":"22:00","fim":"02:00","ligado":20,"pausa":600,"setores":[1,2]}
rotina {"id":1,"ligado":45}
rotina {"nome":"Nebulizacao","tipo":"climatizacao","inicio":"12:00","fim":"16:00","ligado":20,"pausa":180,"setores":[5,6]}
```

### Roteiro de teste

1. **Rotina da manhã:** `hora 06:59:50` → às 07:00 abre S1, 1 s depois liga a bomba; a cada 30 s troca de setor (o próximo abre antes do anterior fechar); no fim desliga a bomba e 2 s depois fecha a válvula. Próximo ciclo 4 min depois.
2. **Bloco vazio:** `bloco 2 vazio` → no próximo ciclo o S2 é pulado. Com 1–4 vazios a bomba nem liga.
3. **Pausa visita / só motor:** botões amarelo/azul (ou `pausa` / `motor`).
4. **Adubação:** `data 2026-11-16` e `hora 08:59:55` → 3 min só motor, depois os blocos com mudas por 60 s cada.
5. **Persistência:** crie uma rotina, marque um bloco vazio, digite `reiniciar` → depois do boot, `rotinas` e `status` mostram tudo igual.
6. **Meia-noite:** crie a rotina "Noite" acima e `hora 23:59:50`; depois `hora 00:30:00` → continua rodando (a janela abriu "ontem").

> No Wokwi a flash é apagada quando você para e inicia a simulação de novo; ela só sobrevive ao `reiniciar` (que é o que acontece na placa real quando falta energia).
> Depois de reiniciar, uma rotina cuja janela está aberta roda um ciclo na hora (o "último ciclo" não é salvo) — de propósito: depois de uma queda de energia, é melhor irrigar do que esperar.

### Limitações conhecidas (Fase 2)
- O aviso de conflito é aproximado (compara horários e dias, não simula a fila).
- Mudar um bloco para vazio no meio de um ciclo só vale a partir do próximo ciclo.

---

## 10. Fase 3 — Wi‑Fi, MQTT e relógio pela internet

### Como funciona
- O ESP32 roda **duas tarefas**: a irrigação (núcleo 1, vigiada pelo watchdog) e a rede (núcleo 0). Se o Wi‑Fi cair ou o broker travar, **a irrigação segue normal**; a rede tenta reconectar sozinha (Wi‑Fi a cada 15 s, MQTT a cada 5 s).
- Ao conectar, acerta o relógio (RTC) pela internet (NTP, fuso `<-04>4` = Rondônia) e confere de novo a cada 6 h.
- Todo comando do Serial também funciona pelo MQTT — o app (Fase 4) vai usar exatamente esses comandos.

### Configuração (topo do `sketch.ino`)

| Constante | Protótipo (Wokwi) | Produção |
|-----------|-------------------|----------|
| `WIFI_SSID` / `WIFI_SENHA` | `Wokwi-GUEST` / vazio | Wi‑Fi do viveiro |
| `MQTT_HOST` / `MQTT_PORTA` | `broker.hivemq.com` / 1883 | EMQX Cloud / 8883 (via `segredos.h`) |
| `MQTT_TLS` | 0 | 1 |
| `MQTT_USUARIO` / `MQTT_SENHA` | vazio | usuário do EMQX (via `segredos.h`) |
| `MQTT_PREFIXO` | `viveiro-cafe/proto-bea19c` | um prefixo único por cliente |
| `FUSO_HORARIO` | `<-04>4` | `<-04>4` — o viveiro fica em **Rondônia** (UTC‑4) |

> ⚠️ **O broker público é só para testes**: qualquer pessoa que souber o prefixo consegue ler e mandar comandos. Em produção usamos EMQX Cloud com usuário/senha e TLS (seção 12): com `MQTT_TLS 1` o ESP32 valida o certificado do broker (raízes Let's Encrypt e DigiCert embutidas).

### Tópicos (`<prefixo>` = `viveiro-cafe/proto-bea19c`)

| Tópico | Direção | Retido | Conteúdo |
|--------|---------|--------|----------|
| `<prefixo>/conexao` | ESP32 → app | sim | `online` ou `offline` (o `offline` é publicado **pelo broker** quando o ESP32 some — "Last Will") |
| `<prefixo>/status` | ESP32 → app | sim | estado atual; publicado quando muda e a cada 30 s |
| `<prefixo>/config` | ESP32 → app | sim | configuração completa (mesmo JSON do comando `config`); publicada no boot e a cada alteração |
| `<prefixo>/evento` | ESP32 → app | não | cada linha de log: `{"hora":"07:00:00","msg":"Setor 1 (Bloco 1) ABERTO"}` — vira o histórico do app |
| `<prefixo>/cmd` | app → ESP32 | não | comando em texto, igual ao Serial: `pausa`, `setor 1 30`, `rotina {...}`… |
| `<prefixo>/resposta` | ESP32 → app | não | `{"cmd":"…","saida":"texto que o comando imprimiu"}` |

Exemplo de `status`:
```json
{"modo":"AUTOMATICO","ciclo":"irrigando","rotinaId":1,"rotina":"Manha","bomba":true,
 "setores":[{"n":1,"aberto":true,"mudas":true,"instalado":true}, "..."],
 "hora":"2026-11-13T07:00:31","uptimeS":1234,"wifiRssi":-65}
```
(`modoRestanteS` aparece quando está em pausa visita ou só motor: segundos até voltar ao automático.)

### Testando pelo computador

Ferramenta sem dependências: [`ferramentas/mqtt_teste.py`](ferramentas/mqtt_teste.py) (só Python 3).

```bash
python ferramentas/mqtt_teste.py --segundos 30
```

```bash
python ferramentas/mqtt_teste.py --segundos 40 "status" "setor 1 5" "bloco 2 vazio"
```

Ela escuta `<prefixo>/#`, envia os comandos (um a cada 3 s) e mostra eventos, status e respostas. Também dá pra usar o **MQTT Explorer** (app) ou o cliente web da HiveMQ (broker.hivemq.com, porta 8884 com TLS).

### Testado em 2026-11-13
- Wi‑Fi + MQTT conectam; `config`, `status` e `conexao=online` chegam retidos.
- Pelo MQTT: `rede`, `setor 1 3` (válvula → bomba → desliga → fecha, com eventos e status a cada mudança), `bloco 2 vazio` (config nova publicada), `rotina {...}` (resposta com prévia), comando inválido (resposta com erro).
- Parando a simulação, o broker publicou `conexao=offline` sozinho (~45 s depois).
- Relógio acertado pela internet ao conectar.

### Limitações conhecidas (Fase 3)
- Broker público e sem autenticação (ver aviso acima).
- Se a internet cair, os eventos desse período não são guardados para envio posterior (o status atual é republicado ao reconectar).
- No Wokwi, com o painel do navegador oculto, a simulação fica mais lenta e os tempos aparecem esticados.

---

## 11. Fase 4 — App web (API + PWA)

```
[ESP32] ⇄ MQTT ⇄ [Broker] ⇄ [API NestJS + Postgres] ⇄ HTTPS + tempo real (SSE) ⇄ [App PWA no celular]
```

O navegador **nunca fala direto com o broker**: a API é a ponte (guarda as credenciais do MQTT, valida quem pode mandar o quê e registra tudo).

### Estrutura

```
apps/api   NestJS 12 + Prisma 7 + Postgres (mesma base do sistema do ateliê)
apps/app   React 19 + Vite + Tailwind + React Query, instalável no celular (PWA)
firmware/  ESP32 (Fases 1–3)
ferramentas/mqtt_teste.py
```

### Rodando localmente

```bash
npm install
```

```bash
npm run db:up
```

```bash
npm run db:migrate -w apps/api
```

```bash
npm run seed -w apps/api
```

```bash
npm run dev:api
```

```bash
npm run dev:app
```

- App: http://localhost:5174 · API: http://localhost:3002 · Postgres: porta **5433** (docker compose).
- Login inicial (seed): `admin@viveiro.local` / `trocar123` — **trocar antes de publicar**.
- `.npmrc` usa `legacy-peer-deps` (o npm 10 tem um bug ao resolver os "peers" do vitest).
- `apps/api/.env` (copiar de `.env.example`): banco, `JWT_SECRET`, `MQTT_URL/USUARIO/SENHA`, `CORS_ORIGINS`.
- Testes da API: `npm test`.

### Banco (Prisma)

| Tabela | O que guarda |
|--------|--------------|
| `Usuario` | login, perfil **ADMIN** ou **OPERADOR**, ativo |
| `Controlador` | um ESP32: nome, **prefixo MQTT**, online, última notícia, último status e última config (JSON) |
| `Evento` | histórico: cada linha publicada em `<prefixo>/evento` |
| `Comando` | auditoria: quem mandou qual comando, quando e o que o controlador respondeu |

Já suporta **vários controladores** (um seletor aparece no topo do app quando há mais de um) — útil se o sistema for vendido para outros viveiros.

### API

| Rota | Quem | O que faz |
|------|------|-----------|
| `POST /auth/login`, `GET /auth/me` | todos | login (JWT, 7 dias) |
| `GET /controladores`, `GET /controladores/:id` | todos | status, config, online |
| `GET /controladores/:id/tempo-real?token=` | todos | **SSE**: `status`, `config`, `conexao`, `evento` (+ `ping` a cada 25 s) |
| `GET /controladores/:id/eventos?antes=&limite=` | todos | histórico paginado |
| `GET /controladores/:id/comandos` | todos | quem fez o quê |
| `POST /controladores/:id/comandos {texto}` | por perfil | publica em `<prefixo>/cmd`, espera a resposta (até 15 s) e devolve `{saida, erro}` |
| `POST /controladores` | admin | cadastra outro controlador |
| `GET/POST/PATCH /usuarios` | admin | usuários |

**Permissões dos comandos** (`apps/api/src/controladores/comandos.ts`):
- **Operador**: `status rede rotinas config prever pausa motor parar setor bloco`
- **Admin**: tudo isso + `rotina apagar ativar desativar setorcfg param hora data reiniciar fabrica`

### Telas do app

| Tela | O que tem |
|------|-----------|
| **Painel** | o que está acontecendo agora, bomba, próxima rotina; botões grandes **Pausar irrigação** (com contagem até voltar sozinho) e **Só motor**; **Parar ciclo**; cada setor com 💦 quando aberto, botão **Com mudas / Vazio** e **Acionar agora** (15 s a 5 min); últimos acontecimentos |
| **Rotinas** | lista com resumo e nº de ciclos; criar/editar (dias, horário, tempo ligado, pausa, mistura de adubo, setores) com **prévia dos horários** antes de salvar; ativar/desativar; apagar |
| **Setores** | nome, interno/externo, instalado, com mudas |
| **Histórico** | acontecimentos por dia (carrega mais) e "quem fez o quê" |
| **Ajustes** | dados do controlador (relógio, tempo ligado, sinal Wi‑Fi), limites da pausa visita / só motor, usuários, sair |

Tudo se atualiza em tempo real; se a conexão cair, o app reconecta e ressincroniza sozinho. Quando o controlador está offline, os botões de comando ficam desabilitados e aparece um aviso.

### Testado em 2026-11-13 (app local + Wokwi + broker público)
- Login; painel recebendo status/config/eventos do ESP32 simulado.
- **Acionar agora** (Bloco 1, 15 s) e **Pausar irrigação** pelo app → ESP32 executou, eventos e status apareceram no app; pausa com contagem regressiva e botão "Retomar".
- Histórico com os eventos agrupados por dia; aviso de offline quando o ESP32 sumiu.
- Tela de rotinas e formulário com prévia; layout no celular (375 px).
- 5 testes unitários da API (permissões dos comandos e detecção de erro nas respostas).
- Correção durante o teste: o broker público marca até as mensagens ao vivo como "retidas"; a API agora só ignora as retidas que chegam logo após assinar (senão a "última notícia" ficava parada).

### Pendências da Fase 4
- ~~Publicar~~ feito em 2026-11-13 (seção 12). API no Render **grátis**: dorme sem acesso e perde eventos — ativar o despertador ou passar para o Starter antes do cliente usar.
- **Broker com senha** (EMQX Cloud + TLS no ESP32 e na API) antes de ir para o cliente — preparado na seção 12.
- Trocar a senha do admin do seed; criar os usuários do cliente.
- O firmware que está no Wokwi ainda é o de antes do fuso de Rondônia — colar o `sketch.ino` atual.
- Não testado: salvar rotina pelo app até o fim (o Wokwi estava a 3 % de velocidade com o painel do navegador oculto); o caminho é o mesmo dos outros comandos, já testados.

---

## 12. Publicação (Neon + EMQX Cloud + Render + Vercel)

```
[ESP32] ⇄ MQTT/TLS ⇄ [EMQX Cloud]  ⇄ [API no Render] ⇄ [Postgres no Neon]
                                          ⇅
                                   [App na Vercel]
```

Repositório: **github.com/sergiopeluzzi/irrigacao-viveiro** (privado). Segredos **nunca** vão para o git: ficam no painel de cada serviço e no `firmware/segredos.h` (ignorado pelo git).

### 1. Banco — Neon (grátis)
1. neon.tech → New project (região **AWS São Paulo** ou a mais próxima do Render).
2. Copie a **connection string** (Dashboard → Connect). Ela vai no Render como `DATABASE_URL`.

### 2. Broker — EMQX Cloud Serverless (grátis)
> O HiveMQ Cloud deixou de ter plano grátis gerenciado (em nov/2026 só oferecia broker para você mesmo hospedar).
1. https://www.emqx.com/en/cloud → crie a conta → **New Deployment → Serverless** (grátis: 1 milhão de minutos de sessão/mês; nosso uso, ESP32 + API ligados 24 h, é ~86 mil).
2. Na **Overview** do deployment, anote o **Address** (ex.: `xxxxxxxx.ala.us-east-1.emqxsl.com`) e a porta **MQTT over TLS: 8883**.
3. **Access Control → Authentication → Add**: crie **dois** usuários:
   - `viveiro-api` → vai no Render (`MQTT_USUARIO` / `MQTT_SENHA`);
   - `viveiro-esp32` → vai no `firmware/segredos.h`.
4. O certificado do EMQX (DigiCert Global Root G2) já está no firmware, junto com o do Let's Encrypt.

### 3. API — Render (plano grátis)
1. dashboard.render.com → **New → Blueprint** → escolha o repositório `irrigacao-viveiro` (ele lê o `render.yaml`).
2. Preencha as variáveis pedidas:
   - `DATABASE_URL` = connection string do Neon
   - `MQTT_URL` = `mqtts://<Address do EMQX>:8883`, `MQTT_USUARIO` / `MQTT_SENHA` = credencial `viveiro-api`
   - `SEED_ADMIN_NOME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SENHA` = seu login de administrador
   - `CORS_ORIGINS` = deixe em branco por enquanto (preenche no passo 5)
3. O build instala, compila, cria as tabelas (`prisma migrate deploy`) e cria o admin e o controlador (seed). Depois do deploy, `https://<sua-api>.onrender.com/saude` deve responder `{"ok":true,"mqtt":true}`.

> **Plano grátis dorme** após 15 min sem acesso, e dormindo a API não recebe o MQTT (o histórico perde eventos; o ESP32 continua irrigando normalmente). Para amenizar: no GitHub → Settings → Secrets and variables → Actions → **Variables** → `API_URL` = URL da API. O workflow `despertador.yml` acessa `/saude` a cada 10 min. Ele está em `ferramentas/despertador.yml` e precisa ir para `.github/workflows/` (o token do `gh` precisa da permissão `workflow`: `gh auth refresh -h github.com -s workflow`). Para uso real com cliente, o plano Starter (~US$ 7/mês) é o recomendado.

### 4. App — Vercel
1. vercel.com → Add New → Project → importe `irrigacao-viveiro`.
2. **Root Directory**: `apps/app` (framework Vite é detectado).
3. Environment Variable: `VITE_API_URL` = URL da API no Render (sem barra no fim).
4. Deploy. Anote a URL (ex.: `https://irrigacao-viveiro.vercel.app`).

### 5. Ligar as pontas
1. No Render, `CORS_ORIGINS` = URL do app na Vercel → salvar (a API reinicia).
2. Firmware: copie `firmware/segredos.exemplo.h` para `segredos.h`, preencha o Address do EMQX e o usuário `viveiro-esp32`. No **Wokwi**, crie uma aba `segredos.h` com esse conteúdo e cole o `sketch.ino` atual.
   ⚠️ Não salve/compartilhe o projeto do Wokwi com a senha dentro (projetos salvos no Wokwi grátis são públicos).
3. Rode a simulação: no Serial deve aparecer `MQTT conectado em <cluster>`; no app, o controlador fica **Online**.

### No ar desde 2026-11-13
| Peça | Onde |
|------|------|
| App | https://irrigacao-viveiro.vercel.app |
| API | https://viveiro-api-5tq7.onrender.com (`/saude` → `{"ok":true,"mqtt":true}`) |
| Broker | EMQX Serverless `d22ad7dc.ala.us-east-1.emqxsl.com:8883` (TLS, cadeia DigiCert Global Root G2 conferida) |
| Banco | Neon |

Testado: API conectada ao EMQX, CORS liberado só para o app, ESP32 simulado conectado com TLS + usuário/senha e aparecendo online no app.
> No Wokwi, o controlador fica "offline" por alguns segundos quando a aba do simulador vai para segundo plano (o navegador desacelera a simulação e o broker deixa de receber o "estou vivo"). É limitação do simulador; mantenha a janela do Wokwi visível.

### Atualizações
- `git push` na branch `main` → Render e Vercel publicam sozinhos.
- Mudou o banco (`schema.prisma`)? Gere a migração localmente (`npm run db:migrate -w apps/api`) e faça commit da pasta `prisma/migrations`.
