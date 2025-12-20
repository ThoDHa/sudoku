package config

import (
	"errors"
	"os"
)

type Config struct {
	JWTSecret   string
	Port        string
	PuzzlesFile string
}

// Load loads configuration from environment variables.
// Returns an error if JWT_SECRET is not set or equals "changeme".
func Load() (*Config, error) {
	jwtSecret := os.Getenv("JWT_SECRET")

	if jwtSecret == "" {
		return nil, errors.New("SECURITY ERROR: JWT_SECRET environment variable is required but not set")
	}

	if jwtSecret == "changeme" {
		return nil, errors.New("SECURITY ERROR: JWT_SECRET cannot be 'changeme' - please set a secure secret")
	}

	if len(jwtSecret) < 32 {
		return nil, errors.New("SECURITY ERROR: JWT_SECRET must be at least 32 characters long")
	}

	return &Config{
		JWTSecret:   jwtSecret,
		Port:        getEnv("PORT", "8080"),
		PuzzlesFile: getEnv("PUZZLES_FILE", "/data/puzzles.json"),
	}, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
