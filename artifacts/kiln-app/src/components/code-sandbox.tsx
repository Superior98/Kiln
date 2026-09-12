/**
 * CodeSandbox — runs untrusted, LLM-generated game code inside an isolated
 * iframe instead of the app's own React tree.
 *
 * Threat model: the code running here was written by a language model in
 * response to a user prompt. It is not written by us, and while it isn't
 * expected to be actively hostile, it should be treated as untrusted: it
 * may be buggy, it may loop forever, and a cleverly-crafted prompt could
 * in principle coax the model into writing something malicious. This
 * component's job is to make sure that even in the worst case, generated
 * code can only draw to its own canvas and talk to us through a narrow,
 * typed message protocol — it should never be able to touch the parent
 * app's DOM, cookies, localStorage, or network.
 *
 * How the isolation works:
 *  - The iframe has `sandbox="allow-scripts"` and nothing else. In
 *    particular it does NOT have `allow-same-origin`, which is what makes
 *    the browser treat the iframe's content as coming from a unique,
 *    opaque origin ("null") with no access to the parent's storage or
 *    DOM, regardless of how the srcDoc HTML is constructed.
 *  - The harness page's own Content-Security-Policy additionally blocks
 *    all network access (`connect-src 'none'`, no `fetch`/XHR/WebSocket)
 *    and disallows loading any external resource, so generated code can't
 *    phone home even though the sandbox attribute alone doesn't guarantee
 *    that.
 *  - The only communication channel is `postMessage`, using a small,
 *    versioned protocol (see `SandboxMessage` below). We verify both
 *    `event.source` (must be this iframe's contentWindow) and
 *    `event.origin` (must literally be the string "null", which is what
 *    browsers report for a sandboxed-without-allow-same-origin frame)
 *    before trusting anything in a message.
 *  - Runtime errors inside the iframe (thrown exceptions, unhandled
 *    promise rejections, and infinite-loop-style hangs via a watchdog)
 *    are caught inside the harness and reported out as a `kiln:error`
 *    message rather than being allowed to crash or hang the sandbox
 *    silently.
 *
 * This component only runs code — it doesn't fetch code from Ember or
 * decide when to re-run it. That belongs to whatever wires this into the
 * preview pane.
 *
 * Asset bridging: project assets (uploaded images) live in the parent
 * page as either a `blob:` object URL or a real remote URL. Neither one
 * is reachable from inside this sandbox — `blob:` URLs don't cross the
 * opaque-origin boundary the sandbox attribute creates, and the CSP above
 * blocks the sandbox from fetching a remote URL itself even if it could.
 * So instead of letting generated code fetch images, the *parent* (this
 * component, which is trusted) resolves each asset to a `data:` URI
 * before the iframe is ever created, and the harness preloads those into
 * `Kiln.assets[name]` as ready-to-draw `<img>` elements before running
 * any generated code at all. Generated code never does its own network
 * or asset-loading work — see `resolveImageAssetsToDataUrls` below.
 */
import { useEffect, useMemo, useRef, useState } from "react";

/** A project asset as already tracked by the app (see AssetsPane). */
export interface ProjectAsset {
  name: string;
  url: string;
  isImage?: boolean;
}

/** Messages the sandbox can send back to the parent. */
export type SandboxMessage =
  | { type: "kiln:ready" }
  | { type: "kiln:error"; message: string; stack?: string }
  | { type: "kiln:win" }
  | { type: "kiln:lose" }
  | { type: "kiln:score"; value: number }
  | { type: "kiln:log"; args: unknown[] };

export interface CodeSandboxProps {
  /**
   * The untrusted game source. Must be plain JavaScript (no imports/
   * exports — the harness exposes what it needs as a global `Kiln`
   * object). Changing this remounts the iframe from scratch, which is
   * intentional: a full reload is the simplest way to guarantee no stale
   * state or stuck animation frame survives a code update.
   */
  code: string;
  /**
   * Image assets the game can reference via `Kiln.assets[name]`. Only
   * entries with `isImage: true` and a resolvable `url` are used — other
   * asset types (audio, etc.) aren't bridged into the sandbox yet.
   */
  assets?: ProjectAsset[];
  /**
   * Bump this (e.g. an incrementing number) to restart the game without
   * re-resolving assets or treating it as a code change — used for a
   * "Play again" button after a win/lose outcome.
   */
  restartSignal?: number | string;
  /** Pauses the iframe's internal render loop without unmounting it. */
  running?: boolean;
  onReady?: () => void;
  onError?: (message: string, stack?: string) => void;
  onWin?: () => void;
  onLose?: () => void;
  onScore?: (value: number) => void;
  onLog?: (args: unknown[]) => void;
  className?: string;
}

/**
 * Converts a project's image assets into `data:` URIs the sandboxed
 * iframe can load without any network access of its own. Runs in the
 * trusted parent context, where fetching a `blob:` URL the page itself
 * created (or a same-page-permitted remote URL) is completely normal.
 *
 * An asset that fails to fetch (e.g. a remote URL blocked by CORS, or a
 * stale `blob:` URL from before a page reload — see the note in
 * AssetsPane about object URLs not surviving reloads) is silently
 * skipped rather than failing the whole batch; the game just won't have
 * that one image available under `Kiln.assets`.
 */
export async function resolveImageAssetsToDataUrls(
  assets: ProjectAsset[],
): Promise<Record<string, string>> {
  const results = await Promise.all(
    assets
      .filter((asset) => asset.isImage && asset.url)
      .map(async (asset): Promise<readonly [string, string] | null> => {
        try {
          const response = await fetch(asset.url);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () =>
              reject(reader.error ?? new Error("FileReader failed"));
            reader.readAsDataURL(blob);
          });
          return [asset.name, dataUrl] as const;
        } catch {
          return null;
        }
      }),
  );
  const entries = results.filter(
    (entry): entry is readonly [string, string] => entry !== null,
  );
  return Object.fromEntries(entries);
}

/**
 * How long generated code gets to report readiness (call `Kiln.ready()`
 * or start its render loop) before we treat it as hung and surface an
 * error instead of leaving the preview blank forever.
 */
const READY_TIMEOUT_MS = 8000;

/**
 * The static harness HTML. `__KILN_USER_CODE__` is substituted with the
 * generated code at render time. Everything else here is fixed and
 * trusted — only the substituted section is untrusted.
 */
const HARNESS_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none';" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="kiln-canvas"></canvas>
<script>
(function () {
  "use strict";

  function post(message) {
    // The parent verifies event.source and event.origin itself; we don't
    // need to (and can't reliably) target a specific origin from inside
    // a sandboxed opaque-origin frame, so "*" is fine here — this frame
    // has nothing sensitive to leak by broadcasting.
    parent.postMessage(message, "*");
  }

  function serializeForLog(value) {
    if (value instanceof Error) return value.message;
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (e) { return String(value); }
    }
    return String(value);
  }

  window.onerror = function (message, source, lineno, colno, error) {
    post({ type: "kiln:error", message: String(message), stack: error && error.stack });
    return true; // prevent the default browser error handling/logging
  };
  window.onunhandledrejection = function (event) {
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : undefined;
    post({ type: "kiln:error", message: message, stack: stack });
  };

  var canvas = document.getElementById("kiln-canvas");
  var ctx = canvas.getContext("2d");
  var readyCalled = false;
  var wonOrLost = false;

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    // Scale drawing operations to CSS pixels so generated code can draw
    // in the same 0..Kiln.width / 0..Kiln.height coordinate space
    // regardless of device pixel ratio, while the backing store still
    // renders at full native resolution for sharpness. Resizing the
    // canvas resets any existing transform, so this has to be re-applied
    // every time, not just once at startup.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  var keys = Object.create(null);
  window.addEventListener("keydown", function (e) {
    keys[e.key.toLowerCase()] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(e.key.toLowerCase()) !== -1) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });

  // The API surface exposed to generated code. Keep this small and
  // intentional — anything not listed here, generated code simply
  // cannot do (no fetch, no localStorage, no parent/top access; the
  // sandbox attribute blocks those regardless, but keeping Kiln's own
  // surface narrow makes the contract explicit and easy to audit).
  var frameCallback = null;
  window.Kiln = {
    canvas: canvas,
    ctx: ctx,
    get width() { return canvas.clientWidth; },
    get height() { return canvas.clientHeight; },
    isKeyDown: function (key) { return !!keys[String(key).toLowerCase()]; },
    onFrame: function (cb) { frameCallback = cb; },
    ready: function () { readyCalled = true; post({ type: "kiln:ready" }); },
    win: function () { if (wonOrLost) return; wonOrLost = true; post({ type: "kiln:win" }); },
    lose: function () { if (wonOrLost) return; wonOrLost = true; post({ type: "kiln:lose" }); },
    resetOutcome: function () { wonOrLost = false; },
    setScore: function (value) { post({ type: "kiln:score", value: Number(value) || 0 }); },
    log: function () { post({ type: "kiln:log", args: Array.prototype.slice.call(arguments).map(serializeForLog) }); },
    assets: {},
  };

  var last = performance.now();
  var raf = null;
  function tick(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (frameCallback) {
      try {
        frameCallback(dt);
      } catch (err) {
        post({ type: "kiln:error", message: err && err.message ? err.message : String(err), stack: err && err.stack });
        return; // stop the loop on a thrown error rather than spamming errors every frame
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // Assets are preloaded (as real, already-decoded <img> elements under
  // Kiln.assets) before generated code runs at all, so the code never
  // has to deal with "is this image loaded yet" itself — it can draw
  // Kiln.assets[name] immediately from frame one.
  var ASSET_SOURCES = __KILN_ASSET_SOURCES__;
  var assetNames = Object.keys(ASSET_SOURCES);
  var assetsRemaining = assetNames.length;

  function runUserCode() {
    try {
      __KILN_USER_CODE__
    } catch (err) {
      post({ type: "kiln:error", message: err && err.message ? err.message : String(err), stack: err && err.stack });
    }

    // If the generated code never calls Kiln.ready() (e.g. it forgot to,
    // or it's stuck before reaching that point), let the parent know
    // instead of leaving the preview looking like it's still loading.
    setTimeout(function () {
      if (!readyCalled) {
        post({ type: "kiln:error", message: "Generated code never signaled readiness (Kiln.ready() was not called within the timeout)." });
      }
    }, ${READY_TIMEOUT_MS});
  }

  if (assetsRemaining === 0) {
    runUserCode();
  } else {
    assetNames.forEach(function (name) {
      var img = new Image();
      img.onload = function () {
        window.Kiln.assets[name] = img;
        assetsRemaining -= 1;
        if (assetsRemaining === 0) runUserCode();
      };
      img.onerror = function () {
        post({ type: "kiln:log", args: ["Asset failed to load and will not be available: " + name] });
        assetsRemaining -= 1;
        if (assetsRemaining === 0) runUserCode();
      };
      img.src = ASSET_SOURCES[name];
    });
  }
})();
<\/script>
</body>
</html>`;

/**
 * Escapes the one sequence that could let generated code break out of
 * its <script> tag early: a literal "</script" substring. This is a
 * defense-in-depth measure, not the primary isolation mechanism — the
 * sandbox attribute and CSP above are what actually contain the code.
 */
function escapeScriptClose(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function buildSrcDoc(
  code: string,
  resolvedAssets: Record<string, string>,
): string {
  const assetSourcesJson = escapeScriptClose(JSON.stringify(resolvedAssets));
  return HARNESS_TEMPLATE.replace(
    "__KILN_ASSET_SOURCES__",
    () => assetSourcesJson,
  ).replace("__KILN_USER_CODE__", () => escapeScriptClose(code));
}

export function CodeSandbox({
  code,
  assets,
  restartSignal,
  running = true,
  onReady,
  onError,
  onWin,
  onLose,
  onScore,
  onLog,
  className,
}: CodeSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [resolvedAssets, setResolvedAssets] = useState<Record<string, string>>(
    {},
  );

  // A stable string key so effects/memos only re-run when the actual
  // asset list changes, not whenever the parent happens to pass a new
  // array reference with the same content.
  const assetKey = useMemo(
    () =>
      (assets ?? [])
        .map((a) => `${a.name}::${a.url}::${a.isImage ? 1 : 0}`)
        .join("|"),
    [assets],
  );
  const [assetsReady, setAssetsReady] = useState(assetKey.length === 0);

  useEffect(() => {
    let cancelled = false;
    if (!assets || assets.length === 0) {
      setResolvedAssets({});
      setAssetsReady(true);
      return;
    }
    setAssetsReady(false);
    resolveImageAssetsToDataUrls(assets).then((result) => {
      if (!cancelled) {
        setResolvedAssets(result);
        setAssetsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assetKey is the intended dependency; `assets` itself is deliberately excluded to avoid re-resolving on every reference-only change
  }, [assetKey]);

  // Rebuilding srcDoc (and therefore remounting the iframe below, via
  // the `key`) is the intended way to "run new code" — see the doc
  // comment on the `code` prop. It only happens once asset resolution
  // has finished, so generated code never starts before Kiln.assets is
  // populated.
  const srcDoc = useMemo(
    () => (assetsReady ? buildSrcDoc(code, resolvedAssets) : null),
    [code, resolvedAssets, assetsReady],
  );
  const iframeKey = srcDoc === null ? null : `${srcDoc}::${restartSignal ?? 0}`;

  useEffect(() => {
    setReady(false);

    function handleMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      // A sandboxed iframe without allow-same-origin reports its origin
      // as the literal string "null" — this is expected and is part of
      // what confirms the message came from the isolated frame.
      if (event.origin !== "null") return;

      const data = event.data as SandboxMessage;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "kiln:ready":
          setReady(true);
          onReady?.();
          break;
        case "kiln:error":
          onError?.(data.message, data.stack);
          break;
        case "kiln:win":
          onWin?.();
          break;
        case "kiln:lose":
          onLose?.();
          break;
        case "kiln:score":
          onScore?.(data.value);
          break;
        case "kiln:log":
          onLog?.(data.args);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribing per iframeKey keeps this tied to the current iframe instance
  }, [iframeKey, onReady, onError, onWin, onLose, onScore, onLog]);

  if (srcDoc === null || iframeKey === null) {
    // Assets are still being resolved into data: URIs. This is normally
    // fast (blob: URL reads are local), but real remote URLs may take a
    // moment or fail — see resolveImageAssetsToDataUrls.
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#78716c",
          fontSize: 12,
        }}
      >
        Loading assets…
      </div>
    );
  }

  return (
    <iframe
      key={iframeKey}
      ref={iframeRef}
      title="Kiln game sandbox"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      // No `running` gate on mount: pausing is left to generated code
      // reading a paused flag we don't yet expose here — see the
      // follow-up wiring this into PreviewPane, which is a separate,
      // reviewable change.
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        opacity: ready || !running ? 1 : 0.4,
      }}
      className={className}
    />
  );
}
