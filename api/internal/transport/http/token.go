package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type SessionToken struct {
	DeviceID   string    `json:"device_id"`
	PuzzleID   string    `json:"puzzle_id"`
	Seed       string    `json:"seed"`
	Difficulty string    `json:"difficulty"`
	StartedAt  time.Time `json:"started_at"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// session token helpers are defined in this file

// createToken generates a signed JWT-style session token with HMAC-SHA256 authentication
//
// This token format is NOT standard JWT - it's a custom format for this API:
// Format: base64(JSON_payload).base64(HMAC_signature)
//
// Security Considerations:
// - HMAC-SHA256 provides cryptographic signature integrity
// - Secret key must be kept secure (server-side only)
// - Tokens expire based on SessionToken.ExpiresAt (checked during verification)
// - Constant-time comparison prevents timing attacks during verification
//
// Parameters:
//
//	secret: Server secret key for HMAC signing (must match verification secret)
//	session: SessionToken struct containing device_id, puzzle_id, seed, difficulty, timestamps
//
// Returns: Encoded token string or error if JSON marshaling fails
func createToken(secret string, session SessionToken) (string, error) {
	payload, err := json.Marshal(session)
	if err != nil {
		return "", err
	}

	encoded := base64.URLEncoding.EncodeToString(payload)

	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(encoded))
	sig := base64.URLEncoding.EncodeToString(h.Sum(nil))

	return fmt.Sprintf("%s.%s", encoded, sig), nil
}

// verifyToken validates and decodes a session token
//
// Token format: base64(JSON_payload).base64(HMAC_signature)
//
// Security Considerations:
// - Uses constant-time comparison to prevent timing attacks on signature validation
// - Validates token expiration (tokens older than ExpiryAt are rejected)
// - Returns error if signature verification fails (tampered tokens)
//
// Parameters:
//
//	secret: Server secret key for HMAC verification (must match signing secret)
//	token: Encoded token string to validate
//
// Returns: Decoded SessionToken pointer or error (invalid format, signature mismatch, expired)
func verifyToken(secret, token string) (*SessionToken, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid token format")
	}

	encoded := parts[0]
	sig := parts[1]

	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(encoded))
	expectedSig := base64.URLEncoding.EncodeToString(h.Sum(nil))

	// Use constant-time comparison to prevent timing attacks
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expectedSig)) != 1 {
		return nil, fmt.Errorf("invalid signature: token payload or HMAC is malformed")
	}

	payload, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}

	var session SessionToken
	if err := json.Unmarshal(payload, &session); err != nil {
		return nil, err
	}

	if time.Now().After(session.ExpiresAt) {
		return nil, fmt.Errorf("token expired")
	}

	return &session, nil
}
