FROM node:22-alpine AS base

# Dependencies stage
FROM base AS deps
WORKDIR /app
# Copy workspace root and commerce package
COPY package.json package-lock.json ./
COPY packages/commerce/package.json ./packages/commerce/
COPY packages/commerce/dist/ ./packages/commerce/dist/
# Copy this site's package.json
COPY site/package.json ./site/
RUN cd site && npm install

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/site/node_modules ./site/node_modules
COPY --from=deps /app/packages ./packages
COPY site/ ./site/
# Build-time env vars (dummy for build, real ones at runtime)
ENV COMMERCE_DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV CHANNEL_ID="1"
RUN cd site && npm run build

# Runtime stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/site/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/site/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/site/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
