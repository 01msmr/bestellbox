FROM node:22-alpine
WORKDIR /app
COPY package.json server.js db.js ./
COPY public ./public
ENV HOST=0.0.0.0 PORT=3000 DB_FILE=/data/dinedock.db
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "--no-warnings", "server.js"]
