// Copie este arquivo para "segredos.h" (na mesma pasta do sketch) e preencha.
// O segredos.h NÃO vai para o git. No Wokwi: crie uma aba "segredos.h" e cole o conteúdo.
#pragma once

#define WIFI_SSID_CFG "Wokwi-GUEST"  // no viveiro: nome da rede Wi-Fi do cliente
#define WIFI_SENHA_CFG ""             // senha do Wi-Fi

// EMQX Cloud Serverless: Deployment > Overview > "Address" (só o endereço, sem "mqtts://" e sem porta)
#define MQTT_HOST_CFG "xxxxxxxx.ala.us-east-1.emqxsl.com"
#define MQTT_PORTA_CFG 8883
#define MQTT_TLS_CFG 1
// EMQX: Access Control > Authentication (crie um usuário só para o ESP32)
#define MQTT_USUARIO_CFG "viveiro-esp32"
#define MQTT_SENHA_CFG "troque-esta-senha"
