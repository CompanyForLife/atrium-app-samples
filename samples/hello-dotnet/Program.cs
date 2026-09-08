using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var parsedPort)
    ? parsedPort
    : 5103;
var setupBootstrapSecret = Environment.GetEnvironmentVariable("ATRIUM_SETUP_SECRET")
                           ?? throw new InvalidOperationException("ATRIUM_SETUP_SECRET is required");

var secrets = new ConcurrentDictionary<string, string>();
var configs = new ConcurrentDictionary<string, JsonElement>();

var configSchema = JsonDocument.Parse("""
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
""").RootElement;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () =>
{
    return Results.Json(new
    {
        ok = true,
        message = $"hello-dotnet; connections={secrets.Count}",
    });
});

app.MapGet("/config/schema", async (HttpRequest request) =>
    await HandleSignedConfigAsync(request, secrets, async (connectionReference, rawBody) =>
        configSchema));

app.MapGet("/config", async (HttpRequest request) =>
    await HandleSignedConfigAsync(request, secrets, async (connectionReference, rawBody) =>
        configs.TryGetValue(connectionReference, out var config)
            ? config
            : JsonDocument.Parse("{}").RootElement));

app.MapPut("/config", async (HttpRequest request) =>
    await HandleSignedConfigAsync(request, secrets, async (connectionReference, rawBody) =>
    {
        JsonElement config;
        try
        {
            config = string.IsNullOrWhiteSpace(rawBody)
                ? JsonDocument.Parse("{}").RootElement
                : JsonDocument.Parse(rawBody).RootElement;
        }
        catch (JsonException)
        {
            throw new BadHttpRequestException("Invalid JSON");
        }

        configs[connectionReference] = config;
        Console.WriteLine($"[hello-dotnet] config saved {connectionReference}");
        return config;
    }));

app.MapPost("/webhooks/atrium/setup", async (HttpRequest request) =>
{
    var rawBody = await ReadRawBodyAsync(request);
    JsonElement envelope;
    try
    {
        envelope = string.IsNullOrWhiteSpace(rawBody)
            ? JsonDocument.Parse("{}").RootElement
            : JsonDocument.Parse(rawBody).RootElement;
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

    if (!VerifyAtriumSignature(rawBody, request, setupBootstrapSecret, connectionReference))
    {
        return Results.Json(new { ok = false, message = "Invalid signature" }, statusCode: StatusCodes.Status401Unauthorized);
    }

    envelope.TryGetProperty("organisationReference", out var organisationReference);
    Console.WriteLine($"[hello-dotnet] setup connectionReference={connectionReference} organisationReference={organisationReference}");

    secrets[connectionReference] = setupSecret!;
    configs[connectionReference] = JsonDocument.Parse("""{"greeting":"Hello from Atrium"}""").RootElement;
    return Results.Json(new { ok = true });
});

app.MapPost("/webhooks/atrium/disconnect", async (HttpRequest request) =>
    await HandleSignedWebhookAsync(request, secrets, "disconnect", envelope =>
    {
        var connectionReference = ConnectionReferenceValue(envelope.GetProperty("connectionReference"));
        Console.WriteLine($"[hello-dotnet] disconnect {connectionReference}");
        secrets.TryRemove(connectionReference, out _);
        configs.TryRemove(connectionReference, out _);
        return Task.CompletedTask;
    }));

app.MapPost("/webhooks/atrium/triggers/event", async (HttpRequest request) =>
    await HandleSignedWebhookAsync(request, secrets, "event", envelope =>
    {
        envelope.TryGetProperty("type", out var eventType);
        envelope.TryGetProperty("deliveryId", out var deliveryId);
        Console.WriteLine($"[hello-dotnet] event {eventType} {deliveryId}");
        return Task.CompletedTask;
    }));

app.MapPost("/webhooks/atrium/triggers/schedule", async (HttpRequest request) =>
    await HandleSignedWebhookAsync(request, secrets, "schedule", envelope =>
    {
        envelope.TryGetProperty("type", out var eventType);
        envelope.TryGetProperty("deliveryId", out var deliveryId);
        Console.WriteLine($"[hello-dotnet] schedule {eventType} {deliveryId}");
        return Task.CompletedTask;
    }));

Console.WriteLine($"[hello-dotnet] listening on http://0.0.0.0:{port}");
app.Run($"http://0.0.0.0:{port}");

static async Task<IResult> HandleSignedWebhookAsync(
    HttpRequest request,
    ConcurrentDictionary<string, string> secrets,
    string label,
    Func<JsonElement, Task> handler)
{
    var rawBody = await ReadRawBodyAsync(request);
    JsonElement envelope;
    try
    {
        envelope = string.IsNullOrWhiteSpace(rawBody)
            ? JsonDocument.Parse("{}").RootElement
            : JsonDocument.Parse(rawBody).RootElement;
    }
    catch (JsonException)
    {
        return Results.Json(new { ok = false, message = "Invalid JSON" }, statusCode: StatusCodes.Status400BadRequest);
    }

    if (!envelope.TryGetProperty("connectionReference", out var connectionReferenceElement))
    {
        return Results.Json(
            new { ok = false, message = "Missing connectionReference" },
            statusCode: StatusCodes.Status400BadRequest);
    }

    var connectionReference = ConnectionReferenceValue(connectionReferenceElement);
    if (!secrets.TryGetValue(connectionReference, out var secret))
    {
        return Results.Json(new { ok = false, message = "Unknown connection" }, statusCode: StatusCodes.Status401Unauthorized);
    }

    if (!VerifyAtriumSignature(rawBody, request, secret, connectionReference))
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

static async Task<IResult> HandleSignedConfigAsync(
    HttpRequest request,
    ConcurrentDictionary<string, string> secrets,
    Func<string, string, Task<object>> handler)
{
    var connectionReference = request.Query["connectionReference"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(connectionReference))
    {
        return Results.Json(new { ok = false, message = "connectionReference query required" }, statusCode: StatusCodes.Status400BadRequest);
    }

    var rawBody = request.Method == HttpMethods.Put ? await ReadRawBodyAsync(request) : string.Empty;
    if (!secrets.TryGetValue(connectionReference, out var secret))
    {
        return Results.Json(new { ok = false, message = "Unknown connection" }, statusCode: StatusCodes.Status401Unauthorized);
    }

    if (!VerifyAtriumSignature(rawBody, request, secret, connectionReference))
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

static async Task<string> ReadRawBodyAsync(HttpRequest request)
{
    using var reader = new StreamReader(request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
    return await reader.ReadToEndAsync();
}

static string ConnectionReferenceValue(JsonElement element) =>
    element.ValueKind == JsonValueKind.String ? element.GetString() ?? string.Empty : element.ToString();

static string PathAndQueryForSignature(HttpRequest request)
{
    var path = request.Path.HasValue ? request.Path.Value! : "/";
    var query = request.QueryString.HasValue ? request.QueryString.Value!.TrimStart('?') : string.Empty;
    if (string.IsNullOrEmpty(query))
        return path;

    var filtered = query.Split('&', StringSplitOptions.RemoveEmptyEntries)
        .Where(part =>
            !part.Equals("atriumSignature", StringComparison.OrdinalIgnoreCase)
            && !part.StartsWith("atriumSignature=", StringComparison.OrdinalIgnoreCase));
    var joined = string.Join("&", filtered);
    return string.IsNullOrEmpty(joined) ? path : $"{path}?{joined}";
}

static bool VerifyAtriumSignature(string rawBody, HttpRequest request, string signingSecret, string connectionReference, int toleranceSeconds = 300)
{
    var signatureHeader = request.Headers["X-Atrium-Signature"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(signatureHeader) || string.IsNullOrWhiteSpace(signingSecret) || string.IsNullOrWhiteSpace(connectionReference))
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

    if (timestamp == null || string.IsNullOrWhiteSpace(v1))
    {
        return false;
    }

    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    if (timestamp.Value > now + 30)
    {
        return false;
    }

    if (now - timestamp.Value > toleranceSeconds)
    {
        return false;
    }

    var signedPayload = $"{timestamp}.{request.Method.ToUpperInvariant()}.{PathAndQueryForSignature(request)}.{connectionReference}.{rawBody}";
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingSecret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
    var expected = Convert.ToHexString(hash).ToLowerInvariant();
    return CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(expected),
        Encoding.UTF8.GetBytes(v1));
}
