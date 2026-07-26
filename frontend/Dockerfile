# WASM build stage - compile Go solver to WebAssembly with TinyGo
# Must match local dev environment (TinyGo 0.41.1) and CI deploy.
# Image pinned by digest so a rebuilt :0.41.1 cannot silently change behavior;
# Dependabot proposes digest bumps under review.
FROM tinygo/tinygo:0.41.1@sha256:b216f534ddbf277444407b014a3328b5c1ade403cc397f3ab48a14789bf99d0e AS wasm-builder

WORKDIR /go-app

# Copy Go source files
COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ .

# Build WASM with TinyGo (smaller output, matches local dev)
RUN tinygo build -target=wasm -no-debug -opt=z -o /go-app/sudoku.wasm ./cmd/wasm

# Copy wasm_exec.js from TinyGo installation
RUN cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" /go-app/wasm_exec.js

# Frontend build stage. Digest-pinned so the floating 24.x line cannot shift
# under us; Dependabot proposes digest bumps under review.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

WORKDIR /app

# Copy WASM files from previous stage
COPY --from=wasm-builder /go-app/sudoku.wasm ./public/sudoku.wasm
COPY --from=wasm-builder /go-app/wasm_exec.js ./public/wasm_exec.js

# Copy frontend files
COPY frontend/package*.json frontend/.npmrc ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Runtime stage. Previously the bare floating `nginx:alpine` tag; now pinned by
# digest (the tag is retained as a human-readable label, the digest is
# authoritative). Renovate proposes tag+digest bumps under review.
FROM nginx:alpine@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa

COPY --from=builder /app/dist /usr/share/nginx/html
  COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
