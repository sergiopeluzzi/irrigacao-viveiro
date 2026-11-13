# Gerar a documentação

1. Suba o ambiente local (Postgres, API e app) — ver README, seção 11. A API local usa o broker público.
2. `npm install` nesta pasta (só o puppeteer-core; usa o Microsoft Edge já instalado).
3. `npm run captura` — abre o Wokwi com o firmware atual, espera conectar, percorre o app e salva os prints em `docs/img/` (~5 min, a maior parte é a fila do Wokwi).
4. Edite `docs/manual.html` se precisar e rode `npm run pdf`.
