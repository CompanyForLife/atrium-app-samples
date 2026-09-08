package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestQuickViewRequiresSignatureAndEscapesGreeting(t *testing.T) {
	resetTestState()
	connectionReference := "11111111-1111-1111-1111-111111111111"
	secret := "sample-secret"
	connections.Store(connectionReference, connectionState{SigningSecret: secret})
	configs.Store(connectionReference, map[string]any{"greeting": "<script>alert(1)</script>"})
	t.Setenv("ATRIUM_FRAME_ANCESTORS", "https://labs.coho.life")

	pathAndQuery := quickViewPath + "?connectionReference=" + connectionReference
	signature := createTestSignature(secret, http.MethodGet, pathAndQuery, connectionReference)
	request := httptest.NewRequest(
		http.MethodGet,
		pathAndQuery+"&atriumSignature="+url.QueryEscape(signature),
		nil,
	)
	response := httptest.NewRecorder()

	handleQuickView(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Security-Policy"); got != "frame-ancestors https://labs.coho.life" {
		t.Fatalf("unexpected CSP: %q", got)
	}
	if strings.Contains(response.Body.String(), "<script>alert(1)</script>") {
		t.Fatal("quick-view greeting was not escaped")
	}
	if !strings.Contains(response.Body.String(), "&lt;script&gt;alert(1)&lt;/script&gt;") {
		t.Fatal("escaped greeting was not rendered")
	}
}

func TestQuickViewRejectsMissingSignature(t *testing.T) {
	resetTestState()
	connectionReference := "11111111-1111-1111-1111-111111111111"
	connections.Store(connectionReference, connectionState{SigningSecret: "sample-secret"})
	request := httptest.NewRequest(http.MethodGet, quickViewPath+"?connectionReference="+connectionReference, nil)
	response := httptest.NewRecorder()

	handleQuickView(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}

func TestExternalConfigRequiresSignedLaunch(t *testing.T) {
	resetTestState()
	connectionReference := "33333333-3333-3333-3333-333333333333"
	secret := "external-secret"
	connections.Store(connectionReference, connectionState{SigningSecret: secret})
	pathAndQuery := externalConfigPath + "?connectionReference=" + connectionReference
	signature := createTestSignature(secret, http.MethodGet, pathAndQuery, connectionReference)
	request := httptest.NewRequest(
		http.MethodGet,
		pathAndQuery+"&atriumSignature="+url.QueryEscape(signature),
		nil,
	)
	response := httptest.NewRecorder()

	handleExternalConfig(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "external configuration surface") {
		t.Fatal("external configuration page was not rendered")
	}
}

func TestPersistedStateSurvivesReload(t *testing.T) {
	resetTestState()
	stateFile = filepath.Join(t.TempDir(), "state.json")
	connectionReference := "22222222-2222-2222-2222-222222222222"
	connections.Store(connectionReference, connectionState{
		SigningSecret: "persisted-secret",
		ApiKey:        "api-key-guid",
		ApiBaseUrl:    "https://api.example.com",
	})
	configs.Store(connectionReference, map[string]any{"greeting": "Persistent hello"})

	if err := persistState(); err != nil {
		t.Fatalf("persist state: %v", err)
	}

	connections = sync.Map{}
	configs = sync.Map{}
	if err := loadState(); err != nil {
		t.Fatalf("load state: %v", err)
	}

	state, found := loadConnection(connectionReference)
	if !found || state.SigningSecret != "persisted-secret" {
		t.Fatalf("unexpected loaded signing secret: %#v found=%v", state, found)
	}
	if state.ApiKey != "api-key-guid" || state.ApiBaseUrl != "https://api.example.com" {
		t.Fatalf("unexpected loaded api credentials: %#v", state)
	}
	value, found := configs.Load(connectionReference)
	if !found || value.(map[string]any)["greeting"] != "Persistent hello" {
		t.Fatalf("unexpected loaded config: %#v", value)
	}
	if info, err := os.Stat(stateFile); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("state file mode: info=%v err=%v", info, err)
	}

	raw, err := os.ReadFile(stateFile)
	if err != nil {
		t.Fatalf("read state file: %v", err)
	}
	var persisted persistedState
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}
	if _, hasLegacy := persisted.Secrets[connectionReference]; hasLegacy {
		t.Fatal("new state should not write legacy secrets map")
	}
}

func TestLoadStateMigratesLegacySecrets(t *testing.T) {
	resetTestState()
	stateFile = filepath.Join(t.TempDir(), "state.json")
	legacy := persistedState{
		Secrets: map[string]string{"legacy-ref": "legacy-secret"},
		Configs: map[string]map[string]any{},
	}
	raw, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy: %v", err)
	}
	if err := os.WriteFile(stateFile, raw, 0o600); err != nil {
		t.Fatalf("write legacy: %v", err)
	}
	if err := loadState(); err != nil {
		t.Fatalf("load state: %v", err)
	}
	secret, found := loadSecret("legacy-ref")
	if !found || secret != "legacy-secret" {
		t.Fatalf("legacy secret not migrated: %q found=%v", secret, found)
	}
}

func TestQuickViewProbesGrantedAndUngrantedCapabilities(t *testing.T) {
	resetTestState()
	connectionReference := "44444444-4444-4444-4444-444444444444"
	secret := "probe-secret"
	apiKey := "probe-api-key"

	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+apiKey {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/v1.1/public/conversations"):
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"items":[]}`))
		case strings.HasPrefix(r.URL.Path, "/v1.1/public/finance/settlements"):
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message":"capability required"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer apiServer.Close()
	outboundHTTPClient = apiServer.Client()
	t.Cleanup(func() {
		outboundHTTPClient = &http.Client{Timeout: 15 * time.Second}
	})

	connections.Store(connectionReference, connectionState{
		SigningSecret: secret,
		ApiKey:        apiKey,
		ApiBaseUrl:    apiServer.URL,
	})

	pathAndQuery := quickViewPath + "?connectionReference=" + connectionReference
	signature := createTestSignature(secret, http.MethodGet, pathAndQuery, connectionReference)
	request := httptest.NewRequest(
		http.MethodGet,
		pathAndQuery+"&atriumSignature="+url.QueryEscape(signature),
		nil,
	)
	response := httptest.NewRecorder()
	handleQuickView(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	if !strings.Contains(body, "conversations") || !strings.Contains(body, ">200<") {
		t.Fatalf("expected conversations 200 probe in body: %s", body)
	}
	if !strings.Contains(body, "settlements") || !strings.Contains(body, ">403<") {
		t.Fatalf("expected settlements 403 probe in body: %s", body)
	}
	if strings.Contains(body, apiKey) || strings.Contains(body, secret) {
		t.Fatal("quick view leaked secrets")
	}
}

func TestProbePublicAPIReportsSuccessAfterApproval(t *testing.T) {
	resetTestState()
	apiKey := "approved-key"
	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items":[],"totalCount":0}`))
	}))
	defer apiServer.Close()
	outboundHTTPClient = apiServer.Client()
	t.Cleanup(func() {
		outboundHTTPClient = &http.Client{Timeout: 15 * time.Second}
	})

	result := probePublicAPI(apiServer.URL, apiKey, "settlements", settlementsProbePath)
	if !result.OK || result.Status != http.StatusOK {
		t.Fatalf("expected settlements success after approval, got %#v", result)
	}
}

func TestSanitizeFrameAncestorsRejectsHeaderInjection(t *testing.T) {
	if got := sanitizeFrameAncestors("https://coho.life; script-src *"); got != "'none'" {
		t.Fatalf("expected fail-closed CSP, got %q", got)
	}
}

func resetTestState() {
	connections = sync.Map{}
	configs = sync.Map{}
	stateFile = ""
}

func createTestSignature(secret, method, pathAndQuery, connectionReference string) string {
	timestamp := time.Now().Unix()
	payload := strings.Join([]string{
		fmtInt64(timestamp),
		method,
		pathAndQuery,
		connectionReference,
		"",
	}, ".")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return "t=" + fmtInt64(timestamp) + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func fmtInt64(value int64) string {
	return strconv.FormatInt(value, 10)
}
