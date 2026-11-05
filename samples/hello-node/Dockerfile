# Standalone Dockerfile for this starter.
# CodeBuild clones the app repo and builds with context = repo root.
# Hosting injects PORT=8080, ATRIUM_DATA_DIR=/data, ATRIUM_SETUP_SECRET,
# ATRIUM_FRAME_ANCESTORS, ATRIUM_PARENT_ORIGIN, and runs as UID/GID 65532
# (see atrium-app-developer-spec.md §5.6).
FROM node:22.23-alpine
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY assets ./assets

ENV PORT=8080
ENV ATRIUM_DATA_DIR=/data
RUN mkdir -p /data && chown -R 65532:65532 /data \
  && chown -R 65532:65532 /app

USER 65532:65532
EXPOSE 8080
CMD ["npm", "start"]
