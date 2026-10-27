# HCC Production (Next.js). Build from this folder:  docker build -t hcc-web .
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Baked into the client bundle at build time
ARG NEXT_PUBLIC_APP_TIMEZONE=
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_APP_TIMEZONE=$NEXT_PUBLIC_APP_TIMEZONE
RUN npm run build && npm run build:scripts

# Runtime: Microsoft's Playwright image already has Chromium and its system libraries,
# pinned to the same Playwright version as package.json (keep these two in step).
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=build --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=build --chown=pwuser:pwuser /app/public ./public
COPY --from=build --chown=pwuser:pwuser /app/drizzle ./drizzle
COPY --from=build --chown=pwuser:pwuser /app/dist ./scripts
# The standalone trace keeps only part of Playwright; PDF export needs the whole package.
COPY --from=build --chown=pwuser:pwuser /app/node_modules/playwright ./node_modules/playwright
COPY --from=build --chown=pwuser:pwuser /app/node_modules/playwright-core ./node_modules/playwright-core
RUN mkdir -p /data && chown pwuser:pwuser /data
USER pwuser
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
