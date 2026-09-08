package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	atriumSignatureHeader   = "x-atrium-signature"
	defaultToleranceSeconds = 300
	maxFutureSkewSeconds    = 30
	maxBodyBytes            = 1024 * 1024
	quickViewPath           = "/ui"
	externalConfigPath      = "/configure"
	conversationsProbePath  = "/v1.1/public/conversations?count=1"
	settlementsProbePath    = "/v1.1/public/finance/settlements?page=1&pageSize=1"
)

type connectionState struct {
	SigningSecret string
	ApiKey        string
	ApiBaseUrl    string
}

type probeResult struct {
	Capability string `json:"capability"`
	Path       string `json:"path"`
	Status     int    `json:"status"`
	OK         bool   `json:"ok"`
	Error      string `json:"error,omitempty"`
}

var (
	connections          sync.Map
	configs              sync.Map
	stateMu              sync.Mutex
	stateFile            string
	setupBootstrapSecret string
	outboundHTTPClient   = &http.Client{Timeout: 15 * time.Second}
	configSchema         = map[string]any{
		"$schema":              "https://json-schema.org/draft/2020-12/schema",
		"type":                 "object",
		"title":                "Hello Atrium settings",
		"additionalProperties": false,
		"properties": map[string]any{
			"greeting": map[string]any{
				"type":        "string",
				"title":       "Greeting",
				"description": "Shown at the top of the app quick view.",
				"default":     "Hello from Atrium",
				"minLength":   1,
				"maxLength":   120,
			},
		},
		"required": []string{"greeting"},
	}
)

func main() {
	setupBootstrapSecret = os.Getenv("ATRIUM_SETUP_SECRET")
	if setupBootstrapSecret == "" {
		log.Fatal("ATRIUM_SETUP_SECRET is required")
	}
	if dataDir := os.Getenv("ATRIUM_DATA_DIR"); dataDir != "" {
		if err := os.MkdirAll(dataDir, 0o750); err != nil {
			log.Fatalf("create data directory: %v", err)
		}
		stateFile = filepath.Join(dataDir, "hello-go-state.json")
		if err := loadState(); err != nil {
			log.Fatalf("load state: %v", err)
		}
	}

	port := 5102
	if raw := os.Getenv("PORT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			port = parsed
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/config/schema", handleConfigSchema)
	mux.HandleFunc("/config", handleConfig)
	mux.HandleFunc(quickViewPath, handleQuickView)
	mux.HandleFunc(externalConfigPath, handleExternalConfig)
	mux.HandleFunc("/webhooks/atrium/setup", handleSetup)
	mux.HandleFunc("/webhooks/atrium/disconnect", handleDisconnect)
	mux.HandleFunc("/webhooks/atrium/triggers/event", handleEvent)
	mux.HandleFunc("/webhooks/atrium/triggers/schedule", handleSchedule)

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	log.Printf("[hello-go] listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
		return
	}

	count := 0
	connections.Range(func(_, _ any) bool {
		count++
		return true
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": fmt.Sprintf("hello-go; connections=%d", count),
	})
}

func handleSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
		return
	}

	rawBody, err := readBody(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Invalid body"})
		return
	}

	envelope, err := parseEnvelope(rawBody)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Invalid JSON"})
		return
	}

	data, _ := envelope["data"].(map[string]any)
	setupSecret, _ := data["signingSecret"].(string)
	if setupSecret == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Missing signing secret in setup"})
		return
	}

	connectionReference, _ := envelope["connectionReference"].(string)
	if connectionReference == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Missing connectionReference"})
		return
	}

	if !verifyAtriumSignature(rawBody, r.Header.Get(atriumSignatureHeader), setupBootstrapSecret, r.Method, pathAndQueryForSignature(r), connectionReference) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Invalid signature"})
		return
	}

	apiKey, _ := data["apiKey"].(string)
	apiBaseUrl, _ := data["apiBaseUrl"].(string)
	apiBaseUrl = strings.TrimRight(strings.TrimSpace(apiBaseUrl), "/")

	log.Printf("[hello-go] setup connectionReference=%s organisationReference=%v apiBaseUrl=%s", connectionReference, envelope["organisationReference"], apiBaseUrl)
	if err := storeConnectionState(connectionReference, connectionState{
		SigningSecret: setupSecret,
		ApiKey:        apiKey,
		ApiBaseUrl:    apiBaseUrl,
	}); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "message": "Could not persist setup"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func handleDisconnect(w http.ResponseWriter, r *http.Request) {
	handleSignedWebhook(w, r, "disconnect", func(envelope map[string]any) error {
		ref, _ := envelope["connectionReference"].(string)
		log.Printf("[hello-go] disconnect %s", ref)
		return deleteConnectionState(ref)
	})
}

func handleEvent(w http.ResponseWriter, r *http.Request) {
	handleSignedWebhook(w, r, "event", func(envelope map[string]any) error {
		log.Printf("[hello-go] event %v %v", envelope["type"], envelope["deliveryId"])
		return nil
	})
}

func handleSchedule(w http.ResponseWriter, r *http.Request) {
	handleSignedWebhook(w, r, "schedule", func(envelope map[string]any) error {
		log.Printf("[hello-go] schedule %v %v", envelope["type"], envelope["deliveryId"])
		return nil
	})
}

func handleConfigSchema(w http.ResponseWriter, r *http.Request) {
	handleSignedConfig(w, r, false, func(_ string, _ string) (any, error) {
		return configSchema, nil
	})
}

func handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleSignedConfig(w, r, false, func(connectionReference string, _ string) (any, error) {
			if value, ok := configs.Load(connectionReference); ok {
				return value, nil
			}
			return map[string]any{}, nil
		})
	case http.MethodPut:
		handleSignedConfig(w, r, true, func(connectionReference string, rawBody string) (any, error) {
			var config map[string]any
			if rawBody != "" {
				if err := json.Unmarshal([]byte(rawBody), &config); err != nil {
					return nil, fmt.Errorf("Invalid JSON")
				}
			} else {
				config = map[string]any{}
			}
			if err := storeConfigState(connectionReference, config); err != nil {
				return nil, err
			}
			log.Printf("[hello-go] config saved %s", connectionReference)
			return config, nil
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
	}
}

func handleQuickView(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
		return
	}

	connectionReference, ok := verifyBrowserLaunch(w, r)
	if !ok {
		return
	}

	greeting := "Hello from Atrium"
	if value, found := configs.Load(connectionReference); found {
		if config, valid := value.(map[string]any); valid {
			if configured, valid := config["greeting"].(string); valid && configured != "" {
				greeting = configured
			}
		}
	}

	probes := runPublicAPIProbes(connectionReference)
	frameAncestors := sanitizeFrameAncestors(os.Getenv("ATRIUM_FRAME_ANCESTORS"))
	body := quickViewHTML(greeting, parentOrigin(), probes)
	w.Header().Set("Content-Security-Policy", "frame-ancestors "+frameAncestors)
	writeHTML(w, body)
}

func handleExternalConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
		return
	}

	if _, ok := verifyBrowserLaunch(w, r); !ok {
		return
	}
	writeHTML(w, externalConfigHTML())
}

func verifyBrowserLaunch(w http.ResponseWriter, r *http.Request) (string, bool) {
	connectionReference := r.URL.Query().Get("connectionReference")
	secret, ok := loadSecret(connectionReference)
	if !ok || !verifyAtriumSignature(
		"",
		r.URL.Query().Get("atriumSignature"),
		secret,
		r.Method,
		pathAndQueryForSignature(r),
		connectionReference,
	) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Invalid signature"})
		return "", false
	}
	return connectionReference, true
}

func handleSignedWebhook(w http.ResponseWriter, r *http.Request, label string, handler func(map[string]any) error) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "message": "Method not allowed"})
		return
	}

	rawBody, err := readBody(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Invalid body"})
		return
	}

	envelope, err := parseEnvelope(rawBody)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Invalid JSON"})
		return
	}

	connectionReference, _ := envelope["connectionReference"].(string)
	secret, ok := loadSecret(connectionReference)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Unknown connection"})
		return
	}

	if !verifyAtriumSignature(rawBody, r.Header.Get(atriumSignatureHeader), secret, r.Method, pathAndQueryForSignature(r), connectionReference) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Invalid signature"})
		return
	}

	if err := handler(envelope); err != nil {
		log.Printf("[hello-go] %s error: %v", label, err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func handleSignedConfig(w http.ResponseWriter, r *http.Request, allowBody bool, handler func(string, string) (any, error)) {
	connectionReference := r.URL.Query().Get("connectionReference")
	if connectionReference == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "connectionReference query required"})
		return
	}

	rawBody := ""
	if allowBody {
		body, err := readBody(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": "Invalid body"})
			return
		}
		rawBody = body
	}

	secret, ok := loadSecret(connectionReference)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Unknown connection"})
		return
	}

	if !verifyAtriumSignature(rawBody, r.Header.Get(atriumSignatureHeader), secret, r.Method, pathAndQueryForSignature(r), connectionReference) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "message": "Invalid signature"})
		return
	}

	result, err := handler(connectionReference, rawBody)
	if err != nil {
		if err.Error() == "Invalid JSON" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "message": err.Error()})
			return
		}
		log.Printf("[hello-go] config error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func loadConnection(connectionReference string) (connectionState, bool) {
	value, ok := connections.Load(connectionReference)
	if !ok {
		return connectionState{}, false
	}
	state, ok := value.(connectionState)
	return state, ok && state.SigningSecret != ""
}

func loadSecret(connectionReference string) (string, bool) {
	state, ok := loadConnection(connectionReference)
	if !ok {
		return "", false
	}
	return state.SigningSecret, true
}

func pathAndQueryForSignature(r *http.Request) string {
	pairs := make([]string, 0)
	if r.URL.RawQuery != "" {
		for _, part := range strings.Split(r.URL.RawQuery, "&") {
			if part == "" || strings.HasPrefix(strings.ToLower(part), "atriumsignature") {
				continue
			}
			pairs = append(pairs, part)
		}
	}
	if len(pairs) == 0 {
		return r.URL.Path
	}
	return r.URL.Path + "?" + strings.Join(pairs, "&")
}

func verifyAtriumSignature(rawBody, signatureHeader, signingSecret, method, pathAndQuery, connectionReference string) bool {
	if signatureHeader == "" || signingSecret == "" || method == "" || pathAndQuery == "" || connectionReference == "" {
		return false
	}

	var timestamp int64
	var v1 string
	for _, part := range strings.Split(signatureHeader, ",") {
		trimmed := strings.TrimSpace(part)
		key, value, found := strings.Cut(trimmed, "=")
		if !found {
			continue
		}
		switch key {
		case "t":
			parsed, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return false
			}
			timestamp = parsed
		case "v1":
			v1 = strings.ToLower(strings.TrimSpace(value))
		}
	}

	if timestamp == 0 || v1 == "" {
		return false
	}

	now := float64(time.Now().Unix())
	if float64(timestamp) > now+maxFutureSkewSeconds {
		return false
	}
	if now-float64(timestamp) > defaultToleranceSeconds {
		return false
	}

	signedPayload := fmt.Sprintf("%d.%s.%s.%s.%s", timestamp, strings.ToUpper(method), pathAndQuery, connectionReference, rawBody)
	mac := hmac.New(sha256.New, []byte(signingSecret))
	mac.Write([]byte(signedPayload))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}

func readBody(r *http.Request) (string, error) {
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxBodyBytes {
		return "", fmt.Errorf("body exceeds %d bytes", maxBodyBytes)
	}
	return string(data), nil
}

func parseEnvelope(rawBody string) (map[string]any, error) {
	if rawBody == "" {
		return map[string]any{}, nil
	}
	var envelope map[string]any
	if err := json.Unmarshal([]byte(rawBody), &envelope); err != nil {
		return nil, err
	}
	return envelope, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	payload, err := json.Marshal(body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"ok":false,"message":"failed to encode JSON"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(payload)
}

type persistedConnection struct {
	SigningSecret string `json:"signingSecret"`
	ApiKey        string `json:"apiKey,omitempty"`
	ApiBaseUrl    string `json:"apiBaseUrl,omitempty"`
}

type persistedState struct {
	Connections map[string]persistedConnection `json:"connections"`
	Secrets     map[string]string              `json:"secrets,omitempty"`
	Configs     map[string]map[string]any      `json:"configs"`
}

func loadState() error {
	data, err := os.ReadFile(stateFile)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}
	for reference, connection := range state.Connections {
		if connection.SigningSecret == "" {
			continue
		}
		connections.Store(reference, connectionState{
			SigningSecret: connection.SigningSecret,
			ApiKey:        connection.ApiKey,
			ApiBaseUrl:    strings.TrimRight(strings.TrimSpace(connection.ApiBaseUrl), "/"),
		})
	}
	// Legacy state files only stored signing secrets.
	for reference, secret := range state.Secrets {
		if secret == "" {
			continue
		}
		if _, exists := connections.Load(reference); exists {
			continue
		}
		connections.Store(reference, connectionState{SigningSecret: secret})
	}
	for reference, config := range state.Configs {
		configs.Store(reference, config)
	}
	return nil
}

func persistState() error {
	if stateFile == "" {
		return nil
	}

	stateMu.Lock()
	defer stateMu.Unlock()
	return persistStateLocked()
}

func persistStateLocked() error {
	if stateFile == "" {
		return nil
	}

	state := persistedState{
		Connections: make(map[string]persistedConnection),
		Configs:     make(map[string]map[string]any),
	}
	connections.Range(func(key, value any) bool {
		reference, referenceOK := key.(string)
		connection, connectionOK := value.(connectionState)
		if referenceOK && connectionOK && connection.SigningSecret != "" {
			state.Connections[reference] = persistedConnection{
				SigningSecret: connection.SigningSecret,
				ApiKey:        connection.ApiKey,
				ApiBaseUrl:    connection.ApiBaseUrl,
			}
		}
		return true
	})
	configs.Range(func(key, value any) bool {
		reference, referenceOK := key.(string)
		config, configOK := value.(map[string]any)
		if referenceOK && configOK {
			state.Configs[reference] = config
		}
		return true
	})

	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	tempFile := stateFile + ".tmp"
	if err := os.WriteFile(tempFile, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tempFile, stateFile)
}

func storeConnectionState(connectionReference string, state connectionState) error {
	stateMu.Lock()
	defer stateMu.Unlock()

	connections.Store(connectionReference, state)
	configs.Store(connectionReference, map[string]any{"greeting": "Hello from Atrium"})
	return persistStateLocked()
}

func deleteConnectionState(connectionReference string) error {
	stateMu.Lock()
	defer stateMu.Unlock()

	connections.Delete(connectionReference)
	configs.Delete(connectionReference)
	return persistStateLocked()
}

func storeConfigState(connectionReference string, config map[string]any) error {
	stateMu.Lock()
	defer stateMu.Unlock()

	configs.Store(connectionReference, config)
	return persistStateLocked()
}

func runPublicAPIProbes(connectionReference string) []probeResult {
	state, ok := loadConnection(connectionReference)
	if !ok {
		return []probeResult{
			{Capability: "conversations", Path: conversationsProbePath, Error: "unknown connection"},
			{Capability: "settlements", Path: settlementsProbePath, Error: "unknown connection"},
		}
	}
	if state.ApiBaseUrl == "" || state.ApiKey == "" {
		return []probeResult{
			{Capability: "conversations", Path: conversationsProbePath, Error: "api credentials missing"},
			{Capability: "settlements", Path: settlementsProbePath, Error: "api credentials missing"},
		}
	}

	return []probeResult{
		probePublicAPI(state.ApiBaseUrl, state.ApiKey, "conversations", conversationsProbePath),
		probePublicAPI(state.ApiBaseUrl, state.ApiKey, "settlements", settlementsProbePath),
	}
}

func probePublicAPI(apiBaseUrl, apiKey, capability, path string) probeResult {
	result := probeResult{
		Capability: capability,
		Path:       path,
	}

	request, err := http.NewRequest(http.MethodGet, apiBaseUrl+path, nil)
	if err != nil {
		result.Error = "could not build request"
		return result
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Accept", "application/json")

	response, err := outboundHTTPClient.Do(request)
	if err != nil {
		result.Error = "request failed"
		return result
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64*1024))

	result.Status = response.StatusCode
	result.OK = response.StatusCode >= 200 && response.StatusCode < 300
	return result
}

func sanitizeFrameAncestors(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "'none'"
	}
	for _, character := range value {
		isAlphaNumeric := character >= '0' && character <= '9' ||
			character >= 'A' && character <= 'Z' ||
			character >= 'a' && character <= 'z'
		isPunctuation := strings.ContainsRune(" '*.:/-_", character)
		if !isAlphaNumeric && !isPunctuation {
			return "'none'"
		}
	}
	return value
}

func parentOrigin() string {
	raw := os.Getenv("ATRIUM_PARENT_ORIGIN")
	if raw == "" {
		raw = "http://localhost:4200"
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Path != "" ||
		(parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "http://localhost:4200"
	}
	return parsed.Scheme + "://" + parsed.Host
}

func quickViewHTML(greeting, allowedParentOrigin string, probes []probeResult) string {
	parentOriginJSON, _ := json.Marshal(allowedParentOrigin)
	var probeRows strings.Builder
	for _, probe := range probes {
		statusLabel := "n/a"
		if probe.Status > 0 {
			statusLabel = strconv.Itoa(probe.Status)
		}
		detail := statusLabel
		if probe.Error != "" {
			detail = probe.Error
		}
		outcome := "fail"
		if probe.OK {
			outcome = "ok"
		}
		probeRows.WriteString("<li><strong>")
		probeRows.WriteString(html.EscapeString(probe.Capability))
		probeRows.WriteString("</strong> <code>")
		probeRows.WriteString(html.EscapeString(probe.Path))
		probeRows.WriteString("</code> — <span class=\"probe-")
		probeRows.WriteString(outcome)
		probeRows.WriteString("\">")
		probeRows.WriteString(html.EscapeString(detail))
		probeRows.WriteString("</span></li>")
	}

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello from Go</title>
  <style>
    body { background: #eef8f1; color: #17351f; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    main { margin: auto; max-width: 42rem; }
    .language { color: #087e8b; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    button { background: #17351f; border: 0; border-radius: .35rem; color: white; cursor: pointer; padding: .7rem 1rem; }
    .probes { background: #fff; border: 1px solid #c5dfcc; border-radius: .5rem; margin: 1.5rem 0; padding: 1rem 1.25rem; }
    .probes ul { margin: .5rem 0 0; padding-left: 1.2rem; }
    .probes li { margin: .4rem 0; }
    code { font-size: .85em; }
    .probe-ok { color: #087e8b; font-weight: 600; }
    .probe-fail { color: #9b2226; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <p class="language">Go sample app</p>
    <h1>` + html.EscapeString(greeting) + `</h1>
    <p>This iframe is rendered by the hosted Go process, not by COHO or Node.</p>
    <section class="probes">
      <h2>Public API capability probes</h2>
      <p>Harmless GETs used to demonstrate capability approval. Granted scopes should return 2xx; newly requested scopes return 403 until approved.</p>
      <ul>` + probeRows.String() + `</ul>
    </section>
    <button type="button" id="close">Close quick view</button>
  </main>
  <script>
    document.getElementById('close').addEventListener('click', function () {
      parent.postMessage({ type: 'atrium.quickView.close' }, ` + string(parentOriginJSON) + `);
    });
  </script>
</body>
</html>`
}

func externalConfigHTML() string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Go configuration</title>
  <style>
    body { background: #0d1b2a; color: #e0fbfc; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    main { margin: auto; max-width: 42rem; }
    code { color: #98c1d9; }
  </style>
</head>
<body>
  <main>
    <h1>Hello Go configuration</h1>
    <p>This is the app-owned external configuration surface opened in a new tab.</p>
    <p>The sample keeps organisation settings in COHO's native JSON Schema form. A production app could authenticate its own users here and offer richer settings.</p>
    <p>Runtime: <code>Go net/http</code>.</p>
  </main>
</body>
</html>`
}

func writeHTML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, body)
}
