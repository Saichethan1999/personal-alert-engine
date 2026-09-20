FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends xvfb && rm -rf /var/lib/apt/lists/*
ENV PORT=8787
ENV HEADLESS=false
EXPOSE 8787
CMD ["bash","-lc","Xvfb :99 -screen 0 1365x900x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 & export DISPLAY=:99 && node server.js"]
