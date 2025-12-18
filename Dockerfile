# =============================================================================
# Single Dockerfile for Sudoku App (API + Frontend)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Go API
# -----------------------------------------------------------------------------
FROM golang:1.23-alpine AS api-builder

WORKDIR /app

COPY api/go.mod ./
RUN go mod download || true

COPY api/ .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# -----------------------------------------------------------------------------
# Stage 2: Build React Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Runtime - nginx + Go API
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Install supervisor to run multiple processes
RUN apk add --no-cache supervisor wget

# Create data directory for puzzles
RUN mkdir -p /data

# Copy Go API binary
COPY --from=api-builder /app/server /app/server

# Copy frontend build
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy pre-generated puzzles
COPY puzzles.json /data/puzzles.json

# Also copy puzzles to frontend assets for offline use
COPY puzzles.json /usr/share/nginx/html/puzzles.json

# nginx config - proxy /api to localhost:8080 with rate limiting
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
# Rate limiting zones (10MB shared memory each)
# Zone for CPU-intensive solve endpoint: 10 requests per minute
limit_req_zone $binary_remote_addr zone=solve_limit:10m rate=10r/m;
# Zone for general API endpoints: 120 requests per minute with burst
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=120r/m;

server {
    listen 80;
    server_name localhost;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /usr/share/nginx/html;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Serve puzzles.json with caching
    location /puzzles.json {
        add_header Cache-Control "public, max-age=86400";
        gzip on;
        gzip_types application/json;
    }

    # CPU-intensive solve endpoint - strict rate limiting (10 req/min)
    location /api/solve/full {
        limit_req zone=solve_limit burst=2 nodelay;
        limit_req_status 429;
        
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # General API endpoints - rate limiting with burst allowance
    location /api {
        limit_req zone=api_limit burst=10 nodelay;
        limit_req_status 429;
        
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy health check (no rate limiting for health checks)
    location /health {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

# Supervisor config to run both nginx and the API
RUN cat > /etc/supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid

[program:api]
command=/app/server
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PORT="8080",PUZZLES_FILE="/data/puzzles.json"

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

# Fix nginx pid location for non-root user
RUN sed -i 's|pid */run/nginx.pid|pid /tmp/nginx.pid|g' /etc/nginx/nginx.conf && \
    sed -i 's|pid */var/run/nginx.pid|pid /tmp/nginx.pid|g' /etc/nginx/nginx.conf && \
    sed -i 's|^user  nginx;|#user  nginx;|g' /etc/nginx/nginx.conf

# -----------------------------------------------------------------------------
# Security: Run as non-root user
# Note: Running nginx as non-root requires:
#   - Writable directories for cache, run (pid file), and logs
#   - Port 80 binding may require NET_BIND_SERVICE capability or use port >1024
#   - The nginx.pid location in /var/run must be writable
# If issues occur, consider using port 8080 internally and mapping externally.
# -----------------------------------------------------------------------------
RUN adduser -D -u 1001 appuser
RUN chown -R appuser:appuser /app /data /var/cache/nginx /var/run /var/log/nginx /etc/supervisord.conf
RUN chmod -R 755 /var/cache/nginx /var/run
RUN chmod 644 /etc/supervisord.conf

USER appuser

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
