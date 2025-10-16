echo "[+] USING LAUNCH SCRIPT TO LAUNCH API-SEC"
pm2-runtime ecosystem.config.cjs
echo "[+] LAUNCHING WORKER"
pm2-runtime src/workers/ecosystem.config.cjs