package config

import (
	"strings"
	"testing"
)

const validSecret = "test-jwt-secret-with-at-least-32-characters"

func TestLoadFailsWhenJwtSecretMissing(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("PORT", "")
	t.Setenv("PUZZLES_FILE", "")

	cfg, err := Load()

	if err == nil {
		t.Fatal("expected an error when JWT_SECRET is missing, got nil")
	}
	if cfg != nil {
		t.Errorf("expected nil config on error, got %+v", cfg)
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("expected error to mention JWT_SECRET, got: %v", err)
	}
}

func TestLoadFailsForInsecurePlaceholderSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "changeme")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error for the 'changeme' placeholder secret")
	}
	if !strings.Contains(err.Error(), "changeme") {
		t.Errorf("expected error to mention 'changeme', got: %v", err)
	}
}

func TestLoadFailsForTooShortSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "short-secret")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error for a too-short secret")
	}
	if !strings.Contains(err.Error(), "32 characters") {
		t.Errorf("expected error to mention the length requirement, got: %v", err)
	}
}

func TestLoadAppliesDefaultsWhenOptionalVarsUnset(t *testing.T) {
	t.Setenv("JWT_SECRET", validSecret)
	t.Setenv("PORT", "")
	t.Setenv("PUZZLES_FILE", "")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("expected no error for a valid secret, got: %v", err)
	}
	if cfg.JWTSecret != validSecret {
		t.Errorf("expected JWTSecret to be loaded, got %q", cfg.JWTSecret)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected default port 8080, got %q", cfg.Port)
	}
	if cfg.PuzzlesFile != "/data/puzzles.json" {
		t.Errorf("expected default puzzles file, got %q", cfg.PuzzlesFile)
	}
}

func TestLoadHonorsCustomPortAndPuzzlesFile(t *testing.T) {
	t.Setenv("JWT_SECRET", validSecret)
	t.Setenv("PORT", "9090")
	t.Setenv("PUZZLES_FILE", "/custom/path.json")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if cfg.Port != "9090" {
		t.Errorf("expected custom port 9090, got %q", cfg.Port)
	}
	if cfg.PuzzlesFile != "/custom/path.json" {
		t.Errorf("expected custom puzzles file, got %q", cfg.PuzzlesFile)
	}
}
