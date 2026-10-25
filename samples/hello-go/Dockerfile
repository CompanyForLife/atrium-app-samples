FROM golang:1.22-alpine AS build
WORKDIR /src
COPY samples/atrium/hello-go/go.mod ./
COPY samples/atrium/hello-go/main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /hello-go . \
    && mkdir /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /hello-go /hello-go
COPY --from=build --chown=65532:65532 /data /data
ENV PORT=5102
ENV ATRIUM_DATA_DIR=/data
USER nonroot:nonroot
EXPOSE 5102
ENTRYPOINT ["/hello-go"]
