import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectAsset } from "./code-sandbox.tsx";
import type { KilnProjectFile } from "../lib/project-agent.ts";

type Props = {
  files: KilnProjectFile[];
  entryPath?: string;
  assets?: ProjectAsset[];
  restartSignal?: number | string;
  running?: boolean;
  onReady?: () => void;
  onError?: (message: string, stack?: string) => void;
  onWin?: () => void;
  onLose?: () => void;
  onScore?: (value: number) => void;
  onLog?: (args: unknown[]) => void;
  className?: string;
};

type Message =
  | { type: "kiln:ready" }
  | { type: "kiln:error"; message: string; stack?: string }
  | { type: "kiln:win" }
  | { type: "kiln:lose" }
  | { type: "kiln:score"; value: number }
  | { type: "kiln:log"; args: unknown[] };

const READY_TIMEOUT_MS = 8000;

function escapeScript(code: string) {
  return code.replace(/<\/script/gi, "<\\/script");
}

function normalisePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveRelative(from: string, specifier: string, files: Map<string, string>) {
  if (!specifier.startsWith(".")) return null;
  const parts = normalisePath(from).split("/");
  parts.pop();
  for (const part of specifier.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  const raw = parts.join("/");
  const candidates = [raw, `${raw}.js`, `${raw}.mjs`, `${raw}/index.js`];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

/**
 * Builds a graph of data: ES modules. Keeping the modules as data URLs
 * means the sandbox never needs access to parent-origin blob URLs. Relative
 * imports are rewritten to other data modules, while bare imports are
 * rejected so generated projects cannot silently reach the network.
 */
function buildEntryDataUrl(filesInput: KilnProjectFile[], entryPath: string) {
  const files = new Map(filesInput.map((file) => [normalisePath(file.path), file.content]));
  const entry = normalisePath(entryPath);
  if (!files.has(entry)) throw new Error(`Entry file not found: ${entryPath}`);

  const cache = new Map<string, string>();
  const building = new Set<string>();

  const build = (path: string): string => {
    if (cache.has(path)) return cache.get(path)!;
    if (building.has(path)) throw new Error(`Circular project import detected at ${path}.`);
    building.add(path);

    let source = files.get(path);
    if (source == null) throw new Error(`Imported project file not found: ${path}`);

    const importPattern = /(\bimport\s+(?:(?:[\s\S]*?)\s+from\s+)?["'])(\.[^"']+)(["'])/g;
    const exportFromPattern = /(\bexport\s+\{[\s\S]*?\}\s+from\s+["'])(\.[^"']+)(["'])/g;
    const specs: Array<{ start: number; end: number; replacement: string }> = [];

    for (const match of source.matchAll(importPattern)) {
      const spec = match[2];
      const resolved = resolveRelative(path, spec, files);
      if (!resolved) throw new Error(`Cannot resolve import ${spec} from ${path}.`);
      specs.push({ start: match.index! + match[1].length, end: match.index! + match[1].length + spec.length, replacement: build(resolved) });
    }
    for (const match of source.matchAll(exportFromPattern)) {
      const spec = match[2];
      const resolved = resolveRelative(path, spec, files);
      if (!resolved) throw new Error(`Cannot resolve export ${spec} from ${path}.`);
      specs.push({ start: match.index! + match[1].length, end: match.index! + match[1].length + spec.length, replacement: build(resolved) });
    }

    specs.sort((a, b) => b.start - a.start);
    for (const replacement of specs) {
      source = source.slice(0, replacement.start) + replacement.replacement + source.slice(replacement.end);
    }

    if (/\b(?:import|export)\s+(?:["'])(?!\.)/.test(source)) {
      throw new Error(`External imports are not supported in the sandbox: ${path}.`);
    }

    const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
    building.delete(path);
    cache.set(path, url);
    return url;
  };

  return build(entry);
}

async function resolveAssets(assets: ProjectAsset[]) {
  const pairs = await Promise.all(assets.filter((asset) => asset.isImage && asset.url).map(async (asset) => {
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return [asset.name, data] as const;
    } catch { return null; }
  }));
  return Object.fromEntries(pairs.filter(Boolean) as Array<readonly [string, string]>);
}

function makeHarness(entryUrl: string, assetSources: Record<string, string>) {
  const entryJson = JSON.stringify(entryUrl);
  const assetsJson = escapeScript(JSON.stringify(assetSources));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none';"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="kiln-canvas"></canvas><script>
(function(){"use strict";
function post(m){parent.postMessage(m,"*");}
var canvas=document.getElementById("kiln-canvas"),ctx=canvas.getContext("2d"),keys=Object.create(null),frameCallback=null,paused=false,ready=false,done=false,skip=false;
function resize(){var d=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(canvas.clientWidth*d));canvas.height=Math.max(1,Math.floor(canvas.clientHeight*d));ctx.setTransform(d,0,0,d,0,0);} resize(); addEventListener("resize",resize);
addEventListener("keydown",function(e){keys[e.key.toLowerCase()]=true;if([" ","arrowup","arrowdown","arrowleft","arrowright"].indexOf(e.key.toLowerCase())>=0)e.preventDefault();});
addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
addEventListener("error",function(e){post({type:"kiln:error",message:String(e.message||e.error||"Runtime error"),stack:e.error&&e.error.stack});});
addEventListener("unhandledrejection",function(e){post({type:"kiln:error",message:String(e.reason&&e.reason.message||e.reason),stack:e.reason&&e.reason.stack});});
var kiln={canvas:canvas,ctx:ctx,get width(){return canvas.clientWidth},get height(){return canvas.clientHeight},isKeyDown:function(k){return !!keys[String(k).toLowerCase()]},onFrame:function(cb){frameCallback=cb},ready:function(){ready=true;post({type:"kiln:ready"})},win:function(){if(!done){done=true;post({type:"kiln:win"})}},lose:function(){if(!done){done=true;post({type:"kiln:lose"})}},resetOutcome:function(){done=false},setScore:function(v){post({type:"kiln:score",value:Number(v)||0})},log:function(){post({type:"kiln:log",args:Array.prototype.slice.call(arguments).map(function(v){try{return typeof v==="object"?JSON.stringify(v):String(v)}catch(e){return String(v)}})})},assets:{}};
window.Kiln=kiln;
addEventListener("message",function(e){if(!e.data)return;if(e.data.type==="kiln:pause")paused=true;if(e.data.type==="kiln:resume"){paused=false;skip=true;}});
var last=performance.now();function tick(now){if(paused){last=now;requestAnimationFrame(tick);return}var dt=skip?0:Math.min((now-last)/1000,.05);skip=false;last=now;if(frameCallback){try{frameCallback(dt)}catch(err){post({type:"kiln:error",message:String(err&&err.message||err),stack:err&&err.stack});return}}requestAnimationFrame(tick)} requestAnimationFrame(tick);
var assets=${assetsJson},names=Object.keys(assets),left=names.length;
function run(){import(${entryJson}).then(function(){setTimeout(function(){if(!ready)post({type:"kiln:error",message:"Generated code never signaled readiness (Kiln.ready() was not called within the timeout)."})},${READY_TIMEOUT_MS})}).catch(function(err){post({type:"kiln:error",message:String(err&&err.message||err),stack:err&&err.stack})});}
if(!left)run();else names.forEach(function(n){var img=new Image();img.onload=function(){kiln.assets[n]=img;if(!--left)run()};img.onerror=function(){post({type:"kiln:log",args:["Asset failed to load: "+n]});if(!--left)run()};img.src=assets[n]});
})();<\\/script></body></html>`;
}

export function ProjectCodeSandbox({ files, entryPath = "game.js", assets = [], restartSignal, running = true, onReady, onError, onWin, onLose, onScore, onLog, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const generation = useMemo(() => files.map((file) => `${file.path}\0${file.content}`).join("\0"), [files]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBuildError(null);
        const entryUrl = buildEntryDataUrl(files, entryPath);
        const assetSources = await resolveAssets(assets);
        if (!cancelled) setSrcDoc(makeHarness(entryUrl, assetSources));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setBuildError(message); onError?.(message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [generation, entryPath, assets]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: running ? "kiln:resume" : "kiln:pause" }, "*");
  }, [running, srcDoc, restartSignal]);

  useEffect(() => {
    const handler = (event: MessageEvent<Message>) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== "null") return;
      const message = event.data;
      if (!message || typeof message.type !== "string") return;
      if (message.type === "kiln:ready") onReady?.();
      else if (message.type === "kiln:error") onError?.(message.message, message.stack);
      else if (message.type === "kiln:win") onWin?.();
      else if (message.type === "kiln:lose") onLose?.();
      else if (message.type === "kiln:score") onScore?.(message.value);
      else if (message.type === "kiln:log") onLog?.(message.args);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onReady, onError, onWin, onLose, onScore, onLog]);

  if (buildError) return <div className={className} style={{ padding: 16, color: "#fca5a5", background: "#0b090d" }}>{buildError}</div>;
  return <iframe ref={iframeRef} title="Kiln game preview" className={className} srcDoc={srcDoc || undefined} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, display: "block" }} />;
}

export default ProjectCodeSandbox;
