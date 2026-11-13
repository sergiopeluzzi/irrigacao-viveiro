// Copie este arquivo para "segredos.h" (na mesma pasta do sketch) e preencha.
// O segredos.h NÃO vai para o git. No Wokwi: crie uma aba "segredos.h" e cole o conteúdo.
#pragma once

#define WIFI_SSID_CFG "Wokwi-GUEST"  // no viveiro: nome da rede Wi-Fi do cliente
#define WIFI_SENHA_CFG ""             // senha do Wi-Fi

// HiveMQ Cloud: Cluster > Overview > "Cluster URL" (sem "mqtts://" e sem porta)
#define MQTT_HOST_CFG "xxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORTA_CFG 8883
#define MQTT_TLS_CFG 1
// HiveMQ Cloud: Access Management > Credentials (crie uma só para o ESP32)
#define MQTT_USUARIO_CFG "viveiro-esp32"
#define MQTT_SENHA_CFG "troque-esta-senha"
