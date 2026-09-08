using HelloAtrium;

var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var parsedPort)
    ? parsedPort
    : 5103;

AtriumLogic.SetupBootstrapSecret = Environment.GetEnvironmentVariable("ATRIUM_SETUP_SECRET")
    ?? throw new InvalidOperationException("ATRIUM_SETUP_SECRET is required");

var dataDir = Environment.GetEnvironmentVariable("ATRIUM_DATA_DIR");
if (!string.IsNullOrWhiteSpace(dataDir))
{
    Directory.CreateDirectory(dataDir);
    if (!OperatingSystem.IsWindows())
    {
        try
        {
            File.SetUnixFileMode(
                dataDir,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute
                | UnixFileMode.GroupRead | UnixFileMode.GroupExecute);
        }
        catch
        {
            // Best-effort directory mode (0750).
        }
    }

    AtriumLogic.StateFile = Path.Combine(dataDir, "hello-dotnet-state.json");
    AtriumLogic.LoadState();
}

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", AtriumLogic.HandleHealth);
app.MapGet("/config/schema", AtriumLogic.HandleConfigSchemaAsync);
app.MapGet("/config", AtriumLogic.HandleGetConfigAsync);
app.MapPut("/config", AtriumLogic.HandlePutConfigAsync);
app.MapGet(AtriumLogic.QuickViewPath, AtriumLogic.HandleQuickViewAsync);
app.MapGet(AtriumLogic.ExternalConfigPath, AtriumLogic.HandleExternalConfigAsync);
app.MapPost("/webhooks/atrium/setup", AtriumLogic.HandleSetupAsync);
app.MapPost("/webhooks/atrium/disconnect", AtriumLogic.HandleDisconnectAsync);
app.MapPost("/webhooks/atrium/triggers/event", AtriumLogic.HandleEventAsync);
app.MapPost("/webhooks/atrium/triggers/schedule", AtriumLogic.HandleScheduleAsync);

Console.WriteLine($"[hello-dotnet] listening on http://0.0.0.0:{port}");
app.Run($"http://0.0.0.0:{port}");
