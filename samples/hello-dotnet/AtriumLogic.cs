using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace HelloAtrium;

public sealed record ConnectionState(
    string SigningSecret,
    string ApiKey = "",
    string ApiBaseUrl = "");

public sealed record ProbeResult(
    [property: JsonPropertyName("capability")] string Capability,
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("status")] int Status = 0,
    [property: JsonPropertyName("ok")] bool Ok = false,
    [property: JsonPropertyName("error")] string? Error = null);

public static class AtriumLogic
{
    public const string AtriumSignatureHeader = "X-Atrium-Signature";
    public const int DefaultToleranceSeconds = 300;
    public const int MaxFutureSkewSeconds = 30;
    public const int MaxBodyBytes = 1024 * 1024;
    public const string QuickViewPath = "/ui";
    public const string ExternalConfigPath = "/configure";
    public const string ConversationsProbePath = "/v1.1/public/conversations?count=1";
    public const string SettlementsProbePath = "/v1.1/public/finance/settlements?page=1&pageSize=1";

    private static readonly JsonDocument ConfigSchemaDocument = JsonDocument.Parse("""
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "title": "Hello Atrium settings",
          "additionalProperties": false,
          "properties": {
            "greeting": {
              "type": "string",
              "title": "Greeting",
              "description": "Shown at the top of the app quick view.",
              "default": "Hello from Atrium",
              "minLength": 1,
              "maxLength": 120
            }
          },
          "required": ["greeting"]
        }
        """);

    public static readonly JsonElement ConfigSchema = ConfigSchemaDocument.RootElement;

    public static ConcurrentDictionary<string, ConnectionState> Connections { get; private set; } = new();
    public static ConcurrentDictionary<string, JsonObject> Configs { get; private set; } = new();
    public static string? StateFile { get; set; }
    public static string SetupBootstrapSecret { get; set; } = "";
    public static HttpClient OutboundHttpClient { get; set; } = new() { Timeout = TimeSpan.FromSeconds(15) };

    private static readonly object StateLock = new();

    public static void ResetForTests()
    {
        Connections = new ConcurrentDictionary<string, ConnectionState>();
        Configs = new ConcurrentDictionary<string, JsonObject>();
        StateFile = null;
    }

    public static IResult HandleHealth()
    {
        return Results.Json(new
        {
            ok = true,
            message = $"hello-dotnet; connections={Connections.Count}",
        });
    }

    public static async Task<IResult> HandleSetupAsync(HttpRequest request)
    {
        string rawBody;
        try
        {
            rawBody = await ReadRawBodyAsync(request);
        }
        catch (InvalidOperationException)
        {
            return Results.Json(new { ok = false, message = "Invalid body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        JsonElement envelope;
        try
        {
            envelope = ParseEnvelope(rawBody);
        }
        catch (JsonException)
        {
            return Results.Json(new { ok = false, message = "Invalid JSON" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!envelope.TryGetProperty("data", out var data) ||
            !data.TryGetProperty("signingSecret", out var setupSecretElement))
        {
            return Results.Json(new { ok = false, message = "Missing signing secret in setup" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        var setupSecret = setupSecretElement.GetString();
        if (string.IsNullOrWhiteSpace(setupSecret))
        {
            return Results.Json(new { ok = false, message = "Missing signing secret in setup" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!envelope.TryGetProperty("connectionReference", out var connectionReferenceElement))
        {
            return Results.Json(new { ok = false, message = "Missing connectionReference" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var connectionReference = ConnectionReferenceValue(connectionReferenceElement);
        if (string.IsNullOrWhiteSpace(connectionReference))
        {
            return Results.Json(new { ok = false, message = "Missing connectionReference" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!VerifyAtriumSignature(
                rawBody,
                request.Headers[AtriumSignatureHeader].FirstOrDefault(),
                SetupBootstrapSecret,
                request.Method,
                PathAndQueryForSignature(request),
                connectionReference))
        {
            return Results.Json(new { ok = false, message = "Invalid signature" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        var apiKey = data.TryGetProperty("apiKey", out var apiKeyElement) ? apiKeyElement.GetString() ?? "" : "";
        var apiBaseUrl = data.TryGetProperty("apiBaseUrl", out var apiBaseUrlElement)
            ? (apiBaseUrlElement.GetString() ?? "").Trim().TrimEnd('/')
            : "";

        envelope.TryGetProperty("organisationReference", out var organisationReference);
        Console.WriteLine(
            $"[hello-dotnet] setup connectionReference={connectionReference} organisationReference={organisationReference} apiBaseUrl={apiBaseUrl}");

        try
        {
            StoreConnectionState(connectionReference, new ConnectionState(setupSecret!, apiKey, apiBaseUrl));
        }
        catch (Exception)
        {
            return Results.Json(new { ok = false, message = "Could not persist setup" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Json(new { ok = true });
    }

    public static async Task<IResult> HandleDisconnectAsync(HttpRequest request) =>
        await HandleSignedWebhookAsync(request, "disconnect", envelope =>
        {
            var connectionReference = ConnectionReferenceValue(envelope.GetProperty("connectionReference"));
            Console.WriteLine($"[hello-dotnet] disconnect {connectionReference}");
            DeleteConnectionState(connectionReference);
            return Task.CompletedTask;
        });

    public static async Task<IResult> HandleEventAsync(HttpRequest request) =>
        await HandleSignedWebhookAsync(request, "event", envelope =>
        {
            envelope.TryGetProperty("type", out var eventType);
            envelope.TryGetProperty("deliveryId", out var deliveryId);
            Console.WriteLine($"[hello-dotnet] event {eventType} {deliveryId}");
            return Task.CompletedTask;
        });

    public static async Task<IResult> HandleScheduleAsync(HttpRequest request) =>
        await HandleSignedWebhookAsync(request, "schedule", envelope =>
        {
            envelope.TryGetProperty("type", out var eventType);
            envelope.TryGetProperty("deliveryId", out var deliveryId);
            Console.WriteLine($"[hello-dotnet] schedule {eventType} {deliveryId}");
            return Task.CompletedTask;
        });

    public static async Task<IResult> HandleConfigSchemaAsync(HttpRequest request) =>
        await HandleSignedConfigAsync(request, allowBody: false, (_, _) => Task.FromResult<object>(ConfigSchema));

    public static async Task<IResult> HandleGetConfigAsync(HttpRequest request) =>
        await HandleSignedConfigAsync(request, allowBody: false, (connectionReference, _) =>
        {
            object result = Configs.TryGetValue(connectionReference, out var config)
                ? config
                : new JsonObject();
            return Task.FromResult(result);
        });

    public static async Task<IResult> HandlePutConfigAsync(HttpRequest request) =>
        await HandleSignedConfigAsync(request, allowBody: true, (connectionReference, rawBody) =>
        {
            JsonObject config;
            try
            {
                config = string.IsNullOrWhiteSpace(rawBody)
                    ? new JsonObject()
                    : JsonNode.Parse(rawBody) as JsonObject ?? new JsonObject();
            }
            catch (JsonException)
            {
                throw new BadHttpRequestException("Invalid JSON");
            }

            StoreConfigState(connectionReference, config);
            Console.WriteLine($"[hello-dotnet] config saved {connectionReference}");
            return Task.FromResult<object>(config);
        });

    public static async Task HandleQuickViewAsync(HttpContext context)
    {
        if (!HttpMethods.IsGet(context.Request.Method))
        {
            await WriteJsonAsync(context, StatusCodes.Status405MethodNotAllowed, new { ok = false, message = "Method not allowed" });
            return;
        }

        var (connectionReference, ok) = VerifyBrowserLaunch(context.Request);
        if (!ok)
        {
            await WriteJsonAsync(context, StatusCodes.Status401Unauthorized, new { ok = false, message = "Invalid signature" });
            return;
        }

        var greeting = "Hello from Atrium";
        if (Configs.TryGetValue(connectionReference, out var config)
            && config["greeting"]?.GetValue<string>() is { Length: > 0 } configured)
        {
            greeting = configured;
        }

        var probes = await RunPublicApiProbesAsync(connectionReference);
        var frameAncestors = SanitizeFrameAncestors(Environment.GetEnvironmentVariable("ATRIUM_FRAME_ANCESTORS"));
        context.Response.Headers.ContentSecurityPolicy = "frame-ancestors " + frameAncestors;
        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(QuickViewHtml(greeting, ParentOrigin(), probes));
    }

    public static async Task HandleExternalConfigAsync(HttpContext context)
    {
        if (!HttpMethods.IsGet(context.Request.Method))
        {
            await WriteJsonAsync(context, StatusCodes.Status405MethodNotAllowed, new { ok = false, message = "Method not allowed" });
            return;
        }

        var (_, ok) = VerifyBrowserLaunch(context.Request);
        if (!ok)
        {
            await WriteJsonAsync(context, StatusCodes.Status401Unauthorized, new { ok = false, message = "Invalid signature" });
            return;
        }

        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(ExternalConfigHtml());
    }

    private static async Task WriteJsonAsync(HttpContext context, int statusCode, object body)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(body));
    }

    public static (string ConnectionReference, bool Ok) VerifyBrowserLaunch(HttpRequest request)
    {
        var connectionReference = request.Query["connectionReference"].FirstOrDefault() ?? "";
        if (!TryLoadSecret(connectionReference, out var secret)
            || !VerifyAtriumSignature(
                "",
                request.Query["atriumSignature"].FirstOrDefault(),
                secret,
                request.Method,
                PathAndQueryForSignature(request),
                connectionReference))
        {
            return ("", false);
        }

        return (connectionReference, true);
    }

    public static async Task<IResult> HandleSignedWebhookAsync(
        HttpRequest request,
        string label,
        Func<JsonElement, Task> handler)
    {
        string rawBody;
        try
        {
            rawBody = await ReadRawBodyAsync(request);
        }
        catch (InvalidOperationException)
        {
            return Results.Json(new { ok = false, message = "Invalid body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        JsonElement envelope;
        try
        {
            envelope = ParseEnvelope(rawBody);
        }
        catch (JsonException)
        {
            return Results.Json(new { ok = false, message = "Invalid JSON" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!envelope.TryGetProperty("connectionReference", out var connectionReferenceElement))
        {
            return Results.Json(new { ok = false, message = "Missing connectionReference" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var connectionReference = ConnectionReferenceValue(connectionReferenceElement);
        if (!TryLoadSecret(connectionReference, out var secret))
        {
            return Results.Json(new { ok = false, message = "Unknown connection" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!VerifyAtriumSignature(
                rawBody,
                request.Headers[AtriumSignatureHeader].FirstOrDefault(),
                secret,
                request.Method,
                PathAndQueryForSignature(request),
                connectionReference))
        {
            return Results.Json(new { ok = false, message = "Invalid signature" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        try
        {
            await handler(envelope);
            return Results.Json(new { ok = true });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[hello-dotnet] {label} error: {ex.Message}");
            return Results.Json(new { ok = false, message = ex.Message }, statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    public static async Task<IResult> HandleSignedConfigAsync(
        HttpRequest request,
        bool allowBody,
        Func<string, string, Task<object>> handler)
    {
        var connectionReference = request.Query["connectionReference"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(connectionReference))
        {
            return Results.Json(new { ok = false, message = "connectionReference query required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        string rawBody = "";
        if (allowBody)
        {
            try
            {
                rawBody = await ReadRawBodyAsync(request);
            }
            catch (InvalidOperationException)
            {
                return Results.Json(new { ok = false, message = "Invalid body" }, statusCode: StatusCodes.Status400BadRequest);
            }
        }

        if (!TryLoadSecret(connectionReference, out var secret))
        {
            return Results.Json(new { ok = false, message = "Unknown connection" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!VerifyAtriumSignature(
                rawBody,
                request.Headers[AtriumSignatureHeader].FirstOrDefault(),
                secret,
                request.Method,
                PathAndQueryForSignature(request),
                connectionReference))
        {
            return Results.Json(new { ok = false, message = "Invalid signature" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        try
        {
            var result = await handler(connectionReference, rawBody);
            return Results.Json(result);
        }
        catch (BadHttpRequestException ex)
        {
            return Results.Json(new { ok = false, message = ex.Message }, statusCode: StatusCodes.Status400BadRequest);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[hello-dotnet] config error: {ex.Message}");
            return Results.Json(new { ok = false, message = ex.Message }, statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    public static bool TryLoadConnection(string connectionReference, out ConnectionState state)
    {
        if (Connections.TryGetValue(connectionReference, out state!)
            && !string.IsNullOrEmpty(state.SigningSecret))
        {
            return true;
        }

        state = new ConnectionState("");
        return false;
    }

    public static bool TryLoadSecret(string connectionReference, out string secret)
    {
        if (TryLoadConnection(connectionReference, out var state))
        {
            secret = state.SigningSecret;
            return true;
        }

        secret = "";
        return false;
    }

    public static string PathAndQueryForSignature(HttpRequest request)
    {
        var path = request.Path.HasValue ? request.Path.Value! : "/";
        var query = request.QueryString.HasValue ? request.QueryString.Value!.TrimStart('?') : string.Empty;
        if (string.IsNullOrEmpty(query))
        {
            return path;
        }

        var filtered = query.Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(part =>
                !part.Equals("atriumSignature", StringComparison.OrdinalIgnoreCase)
                && !part.StartsWith("atriumSignature=", StringComparison.OrdinalIgnoreCase));
        var joined = string.Join("&", filtered);
        return string.IsNullOrEmpty(joined) ? path : $"{path}?{joined}";
    }

    public static bool VerifyAtriumSignature(
        string rawBody,
        string? signatureHeader,
        string signingSecret,
        string method,
        string pathAndQuery,
        string connectionReference,
        int toleranceSeconds = DefaultToleranceSeconds)
    {
        if (string.IsNullOrWhiteSpace(signatureHeader)
            || string.IsNullOrWhiteSpace(signingSecret)
            || string.IsNullOrWhiteSpace(method)
            || string.IsNullOrWhiteSpace(pathAndQuery)
            || string.IsNullOrWhiteSpace(connectionReference))
        {
            return false;
        }

        long? timestamp = null;
        string? v1 = null;
        foreach (var part in signatureHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }

            var key = part[..eq];
            var value = part[(eq + 1)..];
            if (key == "t" && long.TryParse(value, out var parsedTimestamp))
            {
                timestamp = parsedTimestamp;
            }
            else if (key == "v1")
            {
                v1 = value.Trim().ToLowerInvariant();
            }
        }

        if (timestamp is null || string.IsNullOrWhiteSpace(v1))
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (timestamp.Value > now + MaxFutureSkewSeconds)
        {
            return false;
        }

        if (now - timestamp.Value > toleranceSeconds)
        {
            return false;
        }

        var signedPayload = $"{timestamp}.{method.ToUpperInvariant()}.{pathAndQuery}.{connectionReference}.{rawBody}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(v1));
    }

    public static async Task<string> ReadRawBodyAsync(HttpRequest request)
    {
        using var limited = new MemoryStream();
        await request.Body.CopyToAsync(limited);
        if (limited.Length > MaxBodyBytes)
        {
            throw new InvalidOperationException($"body exceeds {MaxBodyBytes} bytes");
        }

        return Encoding.UTF8.GetString(limited.ToArray());
    }

    public static JsonElement ParseEnvelope(string rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return JsonDocument.Parse("{}").RootElement.Clone();
        }

        using var document = JsonDocument.Parse(rawBody);
        return document.RootElement.Clone();
    }

    public static string ConnectionReferenceValue(JsonElement element) =>
        element.ValueKind == JsonValueKind.String ? element.GetString() ?? string.Empty : element.ToString();

    public static void LoadState()
    {
        if (string.IsNullOrEmpty(StateFile) || !File.Exists(StateFile))
        {
            return;
        }

        var data = File.ReadAllText(StateFile);
        var state = JsonSerializer.Deserialize<PersistedState>(data) ?? new PersistedState();

        foreach (var (reference, connection) in state.Connections ?? [])
        {
            if (string.IsNullOrEmpty(connection.SigningSecret))
            {
                continue;
            }

            Connections[reference] = new ConnectionState(
                connection.SigningSecret,
                connection.ApiKey ?? "",
                (connection.ApiBaseUrl ?? "").Trim().TrimEnd('/'));
        }

        // Legacy state files only stored signing secrets.
        foreach (var (reference, secret) in state.Secrets ?? [])
        {
            if (string.IsNullOrEmpty(secret) || Connections.ContainsKey(reference))
            {
                continue;
            }

            Connections[reference] = new ConnectionState(secret);
        }

        foreach (var (reference, config) in state.Configs ?? [])
        {
            Configs[reference] = JsonSerializer.SerializeToNode(config)?.AsObject() ?? new JsonObject();
        }
    }

    public static void PersistState()
    {
        if (string.IsNullOrEmpty(StateFile))
        {
            return;
        }

        lock (StateLock)
        {
            PersistStateLocked();
        }
    }

    private static void PersistStateLocked()
    {
        if (string.IsNullOrEmpty(StateFile))
        {
            return;
        }

        var state = new PersistedState
        {
            Connections = Connections
                .Where(pair => !string.IsNullOrEmpty(pair.Value.SigningSecret))
                .ToDictionary(
                    pair => pair.Key,
                    pair => new PersistedConnection
                    {
                        SigningSecret = pair.Value.SigningSecret,
                        ApiKey = pair.Value.ApiKey,
                        ApiBaseUrl = pair.Value.ApiBaseUrl,
                    }),
            Configs = Configs.ToDictionary(
                pair => pair.Key,
                pair => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(pair.Value.ToJsonString())
                        ?? new Dictionary<string, JsonElement>()),
            Secrets = null,
        };

        var data = JsonSerializer.SerializeToUtf8Bytes(state);
        var tempFile = StateFile + ".tmp";
        var directory = Path.GetDirectoryName(StateFile);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        WriteFileRestrictive(tempFile, data);
        File.Move(tempFile, StateFile, overwrite: true);
        TrySetRestrictivePermissions(StateFile);
    }

    public static void StoreConnectionState(string connectionReference, ConnectionState state)
    {
        lock (StateLock)
        {
            Connections[connectionReference] = state;
            Configs[connectionReference] = JsonNode.Parse("""{"greeting":"Hello from Atrium"}""")!.AsObject();
            PersistStateLocked();
        }
    }

    public static void DeleteConnectionState(string connectionReference)
    {
        lock (StateLock)
        {
            Connections.TryRemove(connectionReference, out _);
            Configs.TryRemove(connectionReference, out _);
            PersistStateLocked();
        }
    }

    public static void StoreConfigState(string connectionReference, JsonObject config)
    {
        lock (StateLock)
        {
            Configs[connectionReference] = config;
            PersistStateLocked();
        }
    }

    public static async Task<IReadOnlyList<ProbeResult>> RunPublicApiProbesAsync(string connectionReference)
    {
        if (!TryLoadConnection(connectionReference, out var state))
        {
            return
            [
                new ProbeResult("conversations", ConversationsProbePath, Error: "unknown connection"),
                new ProbeResult("settlements", SettlementsProbePath, Error: "unknown connection"),
            ];
        }

        if (string.IsNullOrEmpty(state.ApiBaseUrl) || string.IsNullOrEmpty(state.ApiKey))
        {
            return
            [
                new ProbeResult("conversations", ConversationsProbePath, Error: "api credentials missing"),
                new ProbeResult("settlements", SettlementsProbePath, Error: "api credentials missing"),
            ];
        }

        return
        [
            await ProbePublicApiAsync(state.ApiBaseUrl, state.ApiKey, "conversations", ConversationsProbePath),
            await ProbePublicApiAsync(state.ApiBaseUrl, state.ApiKey, "settlements", SettlementsProbePath),
        ];
    }

    public static async Task<ProbeResult> ProbePublicApiAsync(string apiBaseUrl, string apiKey, string capability, string path)
    {
        var result = new ProbeResult(capability, path);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, apiBaseUrl + path);
            request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + apiKey);
            request.Headers.TryAddWithoutValidation("Accept", "application/json");

            using var response = await OutboundHttpClient.SendAsync(request);
            _ = await response.Content.ReadAsByteArrayAsync();
            var status = (int)response.StatusCode;
            return result with
            {
                Status = status,
                Ok = status is >= 200 and < 300,
            };
        }
        catch
        {
            return result with { Error = "request failed" };
        }
    }

    public static string SanitizeFrameAncestors(string? value)
    {
        value = (value ?? "").Trim();
        if (value.Length == 0)
        {
            return "'none'";
        }

        foreach (var character in value)
        {
            var isAlphaNumeric = character is (>= '0' and <= '9') or (>= 'A' and <= 'Z') or (>= 'a' and <= 'z');
            var isPunctuation = " '*.:/-_".Contains(character);
            if (!isAlphaNumeric && !isPunctuation)
            {
                return "'none'";
            }
        }

        return value;
    }

    public static string ParentOrigin()
    {
        var raw = Environment.GetEnvironmentVariable("ATRIUM_PARENT_ORIGIN");
        if (string.IsNullOrWhiteSpace(raw))
        {
            raw = "http://localhost:4200";
        }

        // .NET Uri reports AbsolutePath "/" for origin-only URLs; reject anything beyond that.
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed)
            || (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrEmpty(parsed.Host)
            || parsed.PathAndQuery is not ("/" or "")
            || !string.IsNullOrEmpty(parsed.Fragment))
        {
            return "http://localhost:4200";
        }

        return $"{parsed.Scheme}://{parsed.Authority}";
    }

    public static string QuickViewHtml(string greeting, string allowedParentOrigin, IReadOnlyList<ProbeResult> probes)
    {
        var parentOriginJson = JsonSerializer.Serialize(allowedParentOrigin);
        var probeRows = new StringBuilder();
        foreach (var probe in probes)
        {
            var statusLabel = probe.Status > 0 ? probe.Status.ToString() : "n/a";
            var detail = string.IsNullOrEmpty(probe.Error) ? statusLabel : probe.Error!;
            var outcome = probe.Ok ? "ok" : "fail";
            probeRows.Append("<li><strong>")
                .Append(WebUtility.HtmlEncode(probe.Capability))
                .Append("</strong> <code>")
                .Append(WebUtility.HtmlEncode(probe.Path))
                .Append("</code> — <span class=\"probe-")
                .Append(outcome)
                .Append("\">")
                .Append(WebUtility.HtmlEncode(detail))
                .Append("</span></li>");
        }

        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Hello from .NET</title>
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
                <p class="language">.NET sample app</p>
                <h1>{{WebUtility.HtmlEncode(greeting)}}</h1>
                <p>This iframe is rendered by the hosted .NET process, not by COHO or Node.</p>
                <section class="probes">
                  <h2>Public API capability probes</h2>
                  <p>Harmless GETs used to demonstrate capability approval. Granted scopes should return 2xx; newly requested scopes return 403 until approved.</p>
                  <ul>{{probeRows}}</ul>
                </section>
                <button type="button" id="close">Close quick view</button>
              </main>
              <script>
                document.getElementById('close').addEventListener('click', function () {
                  parent.postMessage({ type: 'atrium.quickView.close' }, {{parentOriginJson}});
                });
              </script>
            </body>
            </html>
            """;
    }

    public static string ExternalConfigHtml() =>
        """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Hello .NET configuration</title>
          <style>
            body { background: #0d1b2a; color: #e0fbfc; font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
            main { margin: auto; max-width: 42rem; }
            code { color: #98c1d9; }
          </style>
        </head>
        <body>
          <main>
            <h1>Hello .NET configuration</h1>
            <p>This is the app-owned external configuration surface opened in a new tab.</p>
            <p>The sample keeps organisation settings in COHO's native JSON Schema form. A production app could authenticate its own users here and offer richer settings.</p>
            <p>Runtime: <code>ASP.NET Core</code>.</p>
          </main>
        </body>
        </html>
        """;

    private static void WriteFileRestrictive(string path, byte[] data)
    {
        var options = new FileStreamOptions
        {
            Mode = FileMode.Create,
            Access = FileAccess.Write,
            Share = FileShare.None,
        };
        if (!OperatingSystem.IsWindows())
        {
            options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        }

        using var stream = new FileStream(path, options);
        stream.Write(data);
    }

    private static void TrySetRestrictivePermissions(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        try
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch
        {
            // Best-effort on platforms that support Unix modes.
        }
    }

    private sealed class PersistedConnection
    {
        [JsonPropertyName("signingSecret")]
        public string SigningSecret { get; set; } = "";

        [JsonPropertyName("apiKey")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ApiKey { get; set; }

        [JsonPropertyName("apiBaseUrl")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ApiBaseUrl { get; set; }
    }

    private sealed class PersistedState
    {
        [JsonPropertyName("connections")]
        public Dictionary<string, PersistedConnection>? Connections { get; set; }

        [JsonPropertyName("secrets")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public Dictionary<string, string>? Secrets { get; set; }

        [JsonPropertyName("configs")]
        public Dictionary<string, Dictionary<string, JsonElement>>? Configs { get; set; }
    }
}
