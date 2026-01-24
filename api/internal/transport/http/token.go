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
		return nil, fmt.Errorf("invalid signature")
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
