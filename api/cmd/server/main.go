package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"sudoku-api/internal/puzzles"
	httpTransport "sudoku-api/internal/transport/http"
	"sudoku-api/pkg/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	// Load pre-generated puzzles
	if err := puzzles.LoadGlobal(cfg.PuzzlesFile); err != nil {
		log.Printf("Warning: Could not load puzzles from %s: %v", cfg.PuzzlesFile, err)
		log.Println("Falling back to on-demand puzzle generation")
	} else {
		log.Printf("Loaded %d pre-generated puzzles", puzzles.Global().Count())
	}

	r := gin.Default()

	httpTransport.RegisterRoutes(r, cfg)

	port := cfg.Port
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("Starting server on port %s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start server: %v", err)
	}
}
