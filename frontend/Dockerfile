# WASM build stage - compile Go solver to WebAssembly
FROM golang:1.23-alpine AS wasm-builder

WORKDIR /go-app

# Copy Go source files
COPY api/go.mod api/go.sum ./
RUN go mod download || true

COPY api/ .

# Build WASM with size optimization
RUN GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o /sudoku.wasm ./cmd/wasm

# Copy wasm_exec.js from Go installation
RUN cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" /wasm_exec.js

# Frontend build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy WASM files from previous stage
COPY --from=wasm-builder /sudoku.wasm ./public/sudoku.wasm
COPY --from=wasm-builder /wasm_exec.js ./public/wasm_exec.js

# Copy frontend files
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Add gzip compression for WASM files
RUN echo 'gzip_types application/wasm;' >> /etc/nginx/conf.d/gzip.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
