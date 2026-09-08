using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;

namespace HelloAtrium.Tests;

public sealed class HelloAtriumTests
{
    public HelloAtriumTests()
    {
        AtriumLogic.ResetForTests();
    }

    [Fact]
    public async Task QuickView_RejectsMissingSignature()
    {
        const string connectionReference = "11111111-1111-1111-1111-111111111111";
        AtriumLogic.Connections[connectionReference] = new ConnectionState("sample-secret");

        var context = CreateGetContext(
            AtriumLogic.QuickViewPath,
            $"?connectionReference={connectionReference}");

        await AtriumLogic.HandleQuickViewAsync(context);

        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task QuickView_RequiresSignatureAndEscapesGreeting()
    {
        const string connectionReference = "11111111-1111-1111-1111-111111111111";
        const string secret = "sample-secret";
        AtriumLogic.Connections[connectionReference] = new ConnectionState(secret);
        AtriumLogic.Configs[connectionReference] = JsonNode.Parse("""{"greeting":"<script>alert(1)</script>"}""")!.AsObject();
        Environment.SetEnvironmentVariable("ATRIUM_FRAME_ANCESTORS", "https://labs.coho.life");

        try
        {
            var pathAndQuery = $"{AtriumLogic.QuickViewPath}?connectionReference={connectionReference}";
            var signature = CreateTestSignature(secret, HttpMethods.Get, pathAndQuery, connectionReference);
            var context = CreateGetContext(
                AtriumLogic.QuickViewPath,
                $"?connectionReference={connectionReference}&atriumSignature={Uri.EscapeDataString(signature)}");

            await AtriumLogic.HandleQuickViewAsync(context);

            var body = await ReadBodyAsync(context);
            Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
            Assert.Equal("frame-ancestors https://labs.coho.life", context.Response.Headers.ContentSecurityPolicy.ToString());
            Assert.DoesNotContain("<script>alert(1)</script>", body);
            Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", body);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ATRIUM_FRAME_ANCESTORS", null);
        }
    }

    [Fact]
    public async Task ExternalConfig_RequiresSignedLaunch()
    {
        const string connectionReference = "33333333-3333-3333-3333-333333333333";
        const string secret = "external-secret";
        AtriumLogic.Connections[connectionReference] = new ConnectionState(secret);

        var pathAndQuery = $"{AtriumLogic.ExternalConfigPath}?connectionReference={connectionReference}";
        var signature = CreateTestSignature(secret, HttpMethods.Get, pathAndQuery, connectionReference);
        var context = CreateGetContext(
            AtriumLogic.ExternalConfigPath,
            $"?connectionReference={connectionReference}&atriumSignature={Uri.EscapeDataString(signature)}");

        await AtriumLogic.HandleExternalConfigAsync(context);

        var body = await ReadBodyAsync(context);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
        Assert.Contains("external configuration surface", body);
    }

    [Fact]
    public void PersistedState_SurvivesReload()
    {
        var statePath = Path.Combine(Path.GetTempPath(), $"hello-dotnet-state-{Guid.NewGuid():N}.json");
        AtriumLogic.StateFile = statePath;
        const string connectionReference = "22222222-2222-2222-2222-222222222222";

        try
        {
            AtriumLogic.Connections[connectionReference] = new ConnectionState(
                "persisted-secret",
                "api-key-guid",
                "https://api.example.com");
            AtriumLogic.Configs[connectionReference] = JsonNode.Parse("""{"greeting":"Persistent hello"}""")!.AsObject();
            AtriumLogic.PersistState();

            AtriumLogic.ResetForTests();
            AtriumLogic.StateFile = statePath;
            AtriumLogic.LoadState();

            Assert.True(AtriumLogic.TryLoadConnection(connectionReference, out var state));
            Assert.Equal("persisted-secret", state.SigningSecret);
            Assert.Equal("api-key-guid", state.ApiKey);
            Assert.Equal("https://api.example.com", state.ApiBaseUrl);
            Assert.True(AtriumLogic.Configs.TryGetValue(connectionReference, out var config));
            Assert.Equal("Persistent hello", config["greeting"]?.GetValue<string>());

            if (!OperatingSystem.IsWindows())
            {
                var mode = File.GetUnixFileMode(statePath);
                Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, mode);
            }

            using var document = JsonDocument.Parse(File.ReadAllText(statePath));
            Assert.False(document.RootElement.TryGetProperty("secrets", out _));
        }
        finally
        {
            if (File.Exists(statePath))
            {
                File.Delete(statePath);
            }
        }
    }

    [Fact]
    public void LoadState_MigratesLegacySecrets()
    {
        var statePath = Path.Combine(Path.GetTempPath(), $"hello-dotnet-legacy-{Guid.NewGuid():N}.json");
        AtriumLogic.StateFile = statePath;

        try
        {
            File.WriteAllText(
                statePath,
                """{"secrets":{"legacy-ref":"legacy-secret"},"configs":{}}""");
            AtriumLogic.LoadState();

            Assert.True(AtriumLogic.TryLoadSecret("legacy-ref", out var secret));
            Assert.Equal("legacy-secret", secret);
        }
        finally
        {
            if (File.Exists(statePath))
            {
                File.Delete(statePath);
            }
        }
    }

    [Fact]
    public void SanitizeFrameAncestors_RejectsHeaderInjection()
    {
        Assert.Equal("'none'", AtriumLogic.SanitizeFrameAncestors("https://coho.life; script-src *"));
    }

    private static DefaultHttpContext CreateGetContext(string path, string queryString)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = path;
        context.Request.QueryString = new QueryString(queryString);
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static async Task<string> ReadBodyAsync(HttpContext context)
    {
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body, Encoding.UTF8, leaveOpen: true);
        return await reader.ReadToEndAsync();
    }

    private static string CreateTestSignature(string secret, string method, string pathAndQuery, string connectionReference)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var payload = $"{timestamp}.{method}.{pathAndQuery}.{connectionReference}.";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        return $"t={timestamp},v1={hash}";
    }
}
