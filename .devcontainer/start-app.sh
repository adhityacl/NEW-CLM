#!/usr/bin/env bash
# Dijalankan otomatis setiap Codespace dimulai (postStartCommand).
# Tujuan: aplikasi langsung menyala tanpa Anda mengetik apa pun di terminal.
#
# Log ada di: /tmp/silegal-dev.log

cd /workspaces/NEW-CLM 2>/dev/null || cd "$(pwd)"

# Jangan jalankan ganda
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "Aplikasi sudah berjalan di port 3000."
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Memasang dependensi (sekali saja)..."
  npm install >/tmp/silegal-install.log 2>&1
fi

nohup npm run dev >/tmp/silegal-dev.log 2>&1 &
sleep 6

if lsof -ti:3000 >/dev/null 2>&1; then
  echo "Aplikasi berjalan. Log: /tmp/silegal-dev.log"
else
  echo "Aplikasi belum berjalan. 20 baris terakhir log:"
  tail -20 /tmp/silegal-dev.log
fi
