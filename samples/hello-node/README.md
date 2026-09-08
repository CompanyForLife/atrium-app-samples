# Hello Atrium (Node)

Minimal self-contained Atrium app (Node 20+, stdlib only). Copy `src/server.js` and adapt it.

Includes an optional **quick view** at `/ui` (`config.quickViewPath`) for the Store iframe.

```bash
npm start   # :5100
```

Register as a private app with Base URL `http://127.0.0.1:5100` and paste [`manifest.example.json`](./manifest.example.json) into Manifest JSON. Connect, then **Open quick view**.

`ATRIUM_FRAME_ANCESTORS` defaults to local Angular origins (`localhost:4200`).

Signature verification is pinned to the published test vectors in the [app developer spec](../../docs/atrium-app-developer-spec.md#311-signature-test-vectors).
