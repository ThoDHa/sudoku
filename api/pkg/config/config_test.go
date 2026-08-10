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
	// An unset secret is also a too-short secret, so the length check would
	// reject it too and any assertion that merely mentions JWT_SECRET passes
	// either way. Naming the reason is what distinguishes the two rejections.
	if !strings.Contains(err.Error(), "required but not set") {
		t.Errorf("expected the missing-secret error rather than the length error, got: %v", err)
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

// The minimum secret length is a bound, and a bound is invisible unless a
// fixture lands exactly on each side of it: "short-secret" above is rejected by
// any threshold from 13 upwards. These two pin it at 32 by rejecting the
// longest secret that must fail and accepting the shortest that must pass.
const (
	secretJustTooShort      = "0123456789012345678901234567890"  // 31 characters
	secretExactlyLongEnough = "01234567890123456789012345678901" // 32 characters
)

func TestLoadRejectsASecretOneCharacterBelowTheMinimum(t *testing.T) {
	if len(secretJustTooShort) != 31 {
		t.Fatalf("fixture must be 31 characters to sit on the boundary, got %d", len(secretJustTooShort))
	}
	t.Setenv("JWT_SECRET", secretJustTooShort)

	_, err := Load()

	if err == nil {
		t.Fatalf("expected a 31-character secret to be rejected as too short")
	}
	if !strings.Contains(err.Error(), "32 characters") {
		t.Errorf("expected the length error, got: %v", err)
	}
}

func TestLoadAcceptsASecretOfExactlyTheMinimumLength(t *testing.T) {
	if len(secretExactlyLongEnough) != 32 {
		t.Fatalf("fixture must be 32 characters to sit on the boundary, got %d", len(secretExactlyLongEnough))
	}
	t.Setenv("JWT_SECRET", secretExactlyLongEnough)

	cfg, err := Load()

	if err != nil {
		t.Fatalf("expected a 32-character secret to be accepted, got: %v", err)
	}
	if cfg.JWTSecret != secretExactlyLongEnough {
		t.Errorf("expected the secret to be loaded verbatim, got %q", cfg.JWTSecret)
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
