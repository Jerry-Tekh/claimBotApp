FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY schema.sql ./
EXPOSE 4000
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = \"true\" ]; then node src/db/migrate.js; fi && node src/index.js"]
