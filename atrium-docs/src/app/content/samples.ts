export interface SampleContent {
    slug: string;
    title: string;
    navLabel: string;
    language: string;
    port: number;
    path: string;
    runCommand: string;
    extraNote?: string;
    testsCommand?: string;
}

const ENV_VARS_PARAGRAPH =
    'ATRIUM_SETUP_SECRET is required for connect. Set ATRIUM_DATA_DIR to persist ' +
    'connection secrets and config across restarts. Set ATRIUM_FRAME_ANCESTORS to the ' +
    'COHO origin allowed to embed /ui, and set ATRIUM_PARENT_ORIGIN to that exact origin ' +
    'for the close message (for example http://localhost:4200 in local development).';

export const SAMPLES: SampleContent[] = [
    {
        slug: 'hello-node',
        title: 'hello-node',
        navLabel: 'Node (hello-node)',
        language: 'Node 20+ (stdlib only)',
        port: 5100,
        path: 'samples/hello-node',
        runCommand: 'npm start',
        testsCommand: 'npm test'
    },
    {
        slug: 'hello-python',
        title: 'hello-python',
        navLabel: 'Python (hello-python)',
        language: 'Python 3 (stdlib only)',
        port: 5101,
        path: 'samples/hello-python',
        runCommand: 'python3 app.py',
        extraNote: 'ATRIUM_DATA_DIR persists to hello-python-state.json. No pip install required.',
        testsCommand: 'python3 -m unittest test_app.py -v'
    },
    {
        slug: 'hello-go',
        title: 'hello-go',
        navLabel: 'Go (hello-go)',
        language: 'Go (stdlib only)',
        port: 5102,
        path: 'samples/hello-go',
        runCommand: 'go run .'
    },
    {
        slug: 'hello-dotnet',
        title: 'hello-dotnet',
        navLabel: '.NET (hello-dotnet)',
        language: 'ASP.NET Core Minimal API (.NET 10)',
        port: 5103,
        path: 'samples/hello-dotnet',
        runCommand: 'dotnet run --project HelloAtrium.csproj',
        testsCommand: 'dotnet test HelloAtrium.Tests/HelloAtrium.Tests.csproj'
    }
];

export const ENV_VARS_NOTE = ENV_VARS_PARAGRAPH;
