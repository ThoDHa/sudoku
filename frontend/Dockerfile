# WASM build stage - compile Go solver to WebAssembly with TinyGo
# Must match local dev environment (TinyGo 0.40.1) and CI deploy
FROM tinygo/tinygo:0.40.1 AS wasm-builder

WORKDIR /go-app

# Copy Go source files
COPY api/go.mod api/go.sum ./
RUN go mod download || true

COPY api/ .

# Build WASM with TinyGo (smaller output, matches local dev)
RUN tinygo build -target=wasm -no-debug -opt=z -o /go-app/sudoku.wasm ./cmd/wasm

# Copy wasm_exec.js from TinyGo installation
RUN cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" /go-app/wasm_exec.js

# Frontend build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy WASM files from previous stage
COPY --from=wasm-builder /go-app/sudoku.wasm ./public/sudoku.wasm
COPY --from=wasm-builder /go-app/wasm_exec.js ./public/wasm_exec.js

# Copy frontend files
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
  COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
