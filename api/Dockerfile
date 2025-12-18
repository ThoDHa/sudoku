# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go.mod first, then run tidy to generate go.sum
COPY go.mod ./
RUN go mod download || true

COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache wget

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080

CMD ["./server"]
