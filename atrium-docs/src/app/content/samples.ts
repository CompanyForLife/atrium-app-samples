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
    /** Override the default web-app endpoint list (e.g. agent-class sample). */
    endpoints?: string[];
    endpointsIntro?: string;
}

const ENV_VARS_PARAGRAPH =
    'ATRIUM_SETUP_SECRET is required for connect. Set ATRIUM_DATA_DIR to persist ' +
    'connection secrets and config across restarts. On Atrium Hosting, COHO injects ' +
    'ATRIUM_FRAME_ANCESTORS and ATRIUM_PARENT_ORIGIN (one Store origin per environment). ' +
    'Locally, fall back to http://localhost:4200 when those are unset.';

export const DEFAULT_WEB_APP_ENDPOINTS = [
    '/health',
    'signed /webhooks/atrium/*',
    'signed native config at /config/schema and /config',
    'signed iframe quick view at /ui',
    'external app-owned page at /configure'
];

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
    },
    {
        slug: 'hello-agent-node',
        title: 'hello-agent-node',
        navLabel: 'Agent exception (hello-agent-node)',
        language: 'Node 20+ (stdlib only) — agent class',
        port: 5104,
        path: 'samples/hello-agent-node',
        runCommand: 'npm start',
        testsCommand: 'npm test',
        extraNote:
            'EXCEPTION: no quick view and no /configure. Prefer a web-app hello unless the product is truly background-only.',
        endpointsIntro: 'Agent-class surface (no UI):',
        endpoints: [
            '/health',
            'signed /webhooks/atrium/*',
            'signed native light config at /config/schema and /config',
            'no /ui — Store will not offer Open quick view',
            'no /configure'
        ]
    }
];

export const ENV_VARS_NOTE = ENV_VARS_PARAGRAPH;
