import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const IAI666_PROMPTQUEUE_UI_VER = "2026-02-09-14";
console.info("[PromptQueue] loaded", { ver: IAI666_PROMPTQUEUE_UI_VER });

const _iai666PromptIdToText = new Map();
let _iai666QueueHint = null;

async function _iai666FetchQueueInfo() {
    try {
        if (api && typeof api.fetchApi === "function") {
            const r = await api.fetchApi("/queue");
            if (!r || !r.ok) throw new Error(`fetchApi(/queue) bad status: ${r?.status}`);
            const j = await r.json();
            if (!j || typeof j !== "object") throw new Error("fetchApi(/queue) invalid json");
            return j;
        }
    } catch (e) {
        console.warn("[PromptQueue] fetchApi(/queue) failed, fallback to fetch(/queue)", { err: String(e?.message || e) });
    }
    try {
        const r = await fetch("/queue", { method: "GET" });
        if (!r || !r.ok) throw new Error(`fetch(/queue) bad status: ${r?.status}`);
        const j = await r.json();
        if (!j || typeof j !== "object") throw new Error("fetch(/queue) invalid json");
        return j;
    } catch {
        return null;
    }
}

async function _iai666ClearBackendQueue() {
    try {
        if (api && typeof api.fetchApi === "function") {
            const r = await api.fetchApi("/queue", {
                method: "POST",
                body: JSON.stringify({ clear: true }),
                headers: { "Content-Type": "application/json" },
            });
            if (!r || !r.ok) throw new Error(`fetchApi(/queue) bad status: ${r?.status}`);
            return true;
        }
    } catch (e) {
        console.warn("[PromptQueue] fetchApi(/queue POST clear) failed, fallback to fetch(/queue)", { err: String(e?.message || e) });
    }
    try {
        await fetch("/queue", {
            method: "POST",
            body: JSON.stringify({ clear: true }),
            headers: { "Content-Type": "application/json" },
        });
        return true;
    } catch {
        return false;
    }
}

function _iai666SummarizePromptText(promptId, maxLen = 2200) {
    try {
        const t = _iai666PromptIdToText.get(String(promptId));
        if (typeof t !== "string") return "";
        if (t.length <= maxLen) return t;
        return t.slice(0, maxLen) + "...";
    } catch {
        return "";
    }
}

async function _iai666QueuePromptWithHint(promptObj, hintText) {
    try {
        _iai666QueueHint = typeof hintText === "string" ? hintText : null;
        const resp = await api.queuePrompt(0, promptObj);
        const pid = resp?.prompt_id;
        if (pid && typeof hintText === "string") {
            _iai666PromptIdToText.set(String(pid), hintText);
        }
        return resp;
    } finally {
        _iai666QueueHint = null;
    }
}

function _iai666TraceAllEnabled() {
    try {
        return !!(typeof window !== "undefined" && window && window.__IAI666_TRACE_ALL);
    } catch {
        return false;
    }
}

function _iai666SafeStringify(obj) {
    try {
        const MAX_STR = 4000;
        const seen = new WeakSet();
        return JSON.stringify(obj, (k, v) => {
            if (typeof v === "string" && v.length > MAX_STR) return v.slice(0, MAX_STR) + "...";
            if (typeof v === "object" && v !== null) {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
            }
            return v;
        });
    } catch (e) {
        return `"[stringify_fail:${String(e?.message || e)}]"`;
    }
}

// Guard ComfyUI widget registry from crashing on `Object.entries(null/undefined)`.
// Some extensions may still register invalid `customWidgets` and core code may not defensively check.
try {
    if (!Object.__iai666PatchedEntries) {
        const _entries = Object.entries;
        const patched = function (obj) {
            if (obj === null || obj === undefined) return [];
            return _entries(obj);
        };
        try {
            Object.defineProperty(Object, "entries", {
                value: patched,
                writable: false,
                enumerable: true,
                configurable: false,
            });
        } catch {
            Object.entries = patched;
        }
        Object.__iai666PatchedEntries = true;
        console.info("[PromptQueue] patched Object.entries for null-safe");
    }
} catch {
    // ignore
}

// Guard against extensions that register with `customWidgets: null/undefined`.
// Some ComfyUI builds call `Object.entries(extension.customWidgets)` during registration.
// If any extension provides null here, it can crash the whole widget registry chain.
try {
    if (app && typeof app.registerExtension === "function" && !app.__iai666PatchedRegisterExtension) {
        const prev = app.registerExtension.bind(app);
        app.registerExtension = function (ext) {
            try {
                if (ext && typeof ext === "object") {
                    if (!ext.customWidgets || typeof ext.customWidgets !== "object") ext.customWidgets = {};

                    if (typeof ext.getCustomWidgets === "function" && !ext.getCustomWidgets.__iai666Wrapped) {
                        const prevGet = ext.getCustomWidgets.bind(ext);
                        ext.getCustomWidgets = function () {
                            const r = prevGet.apply(this, arguments);
                            return r && typeof r === "object" ? r : {};
                        };
                        ext.getCustomWidgets.__iai666Wrapped = true;
                    }
                }
            } catch {
                // ignore
            }
            return prev(ext);
        };
        app.__iai666PatchedRegisterExtension = true;

        // Also normalize already-registered extensions if present.
        const exts = app?.extensions;
        if (Array.isArray(exts)) {
            for (const e of exts) {
                if (e && typeof e === "object") {
                    if (!e.customWidgets || typeof e.customWidgets !== "object") e.customWidgets = {};

                    if (typeof e.getCustomWidgets === "function" && !e.getCustomWidgets.__iai666Wrapped) {
                        const prevGet = e.getCustomWidgets.bind(e);
                        e.getCustomWidgets = function () {
                            const r = prevGet.apply(this, arguments);
                            return r && typeof r === "object" ? r : {};
                        };
                        e.getCustomWidgets.__iai666Wrapped = true;
                    }
                }
            }
        }
        console.info("[PromptQueue] patched app.registerExtension to normalize customWidgets");
    }
} catch {
    // ignore
}

// Some ComfyUI frontend versions route extension registration through extensionService.
// Patch it as well, otherwise `customWidgets: null/undefined` can still crash widgetStore.
try {
    const svc = app?.extensionService || window?.extensionService;
    if (svc && typeof svc.registerExtension === "function" && !svc.__iai666PatchedRegisterExtension) {
        const prev = svc.registerExtension.bind(svc);
        svc.registerExtension = function (ext) {
            try {
                if (ext && typeof ext === "object") {
                    if (!ext.customWidgets || typeof ext.customWidgets !== "object") ext.customWidgets = {};

                    if (typeof ext.getCustomWidgets === "function" && !ext.getCustomWidgets.__iai666Wrapped) {
                        const prevGet = ext.getCustomWidgets.bind(ext);
                        ext.getCustomWidgets = function () {
                            const r = prevGet.apply(this, arguments);
                            return r && typeof r === "object" ? r : {};
                        };
                        ext.getCustomWidgets.__iai666Wrapped = true;
                    }
                }
            } catch {
                // ignore
            }
            return prev(ext);
        };
        svc.__iai666PatchedRegisterExtension = true;
        console.info("[PromptQueue] patched extensionService.registerExtension to normalize customWidgets");
    }
} catch {
    // ignore
}

// Some ComfyUI frontend builds may cache `Object.entries` before our patch runs.
// In that case, patching `Object.entries` is not enough.
// We additionally wrap any `registerCustomWidgets` method we can find to ensure
// it never receives null/undefined.
try {
    if (!window.__iai666PatchedRegisterCustomWidgets) {
        const wrapRegisterCustomWidgets = (obj, path) => {
            if (!obj || typeof obj !== "object") return 0;
            const fn = obj.registerCustomWidgets;
            if (typeof fn !== "function" || fn.__iai666Wrapped) return 0;
            obj.registerCustomWidgets = function (customWidgets, ...rest) {
                const safe = customWidgets && typeof customWidgets === "object" ? customWidgets : {};
                return fn.call(this, safe, ...rest);
            };
            obj.registerCustomWidgets.__iai666Wrapped = true;
            console.info("[PromptQueue] wrapped registerCustomWidgets", { path });
            return 1;
        };

        const tryWrapKnownEntrypoints = () => {
            let n = 0;
            try {
                n += wrapRegisterCustomWidgets(app, "app");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(app?.extensionService, "app.extensionService");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(app?.extensionService?.widgetStore, "app.extensionService.widgetStore");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(app?.widgetStore, "app.widgetStore");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(window?.extensionService, "window.extensionService");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(window?.widgetStore, "window.widgetStore");
            } catch {
                // ignore
            }
            try {
                n += wrapRegisterCustomWidgets(window?.app, "window.app");
            } catch {
                // ignore
            }
            return n;
        };

        const visited = new WeakSet();
        const scan = (root, rootName) => {
            let wrapped = 0;
            const q = [{ v: root, p: rootName, d: 0 }];
            while (q.length) {
                const { v, p, d } = q.shift();
                if (!v || (typeof v !== "object" && typeof v !== "function")) continue;
                if (typeof v === "object") {
                    if (visited.has(v)) continue;
                    visited.add(v);
                }
                wrapped += wrapRegisterCustomWidgets(v, p);
                if (d >= 4) continue;
                let keys = [];
                try {
                    keys = Object.keys(v);
                } catch {
                    keys = [];
                }
                for (const k of keys) {
                    if (k === "__proto__" || k === "prototype" || k === "constructor") continue;
                    let child;
                    try {
                        child = v[k];
                    } catch {
                        continue;
                    }
                    if (!child) continue;
                    if (typeof child !== "object" && typeof child !== "function") continue;
                    q.push({ v: child, p: `${p}.${k}`, d: d + 1 });
                }
            }
            return wrapped;
        };

        const tryPatch = () => {
            let count = 0;
            try {
                count += tryWrapKnownEntrypoints();
            } catch {
                // ignore
            }
            try {
                count += scan(app, "app");
            } catch {
                // ignore
            }
            try {
                count += scan(window, "window");
            } catch {
                // ignore
            }
            return count;
        };

        const initial = tryPatch();
        if (initial === 0) {
            let attempts = 0;
            const timer = setInterval(() => {
                attempts += 1;
                const c = tryPatch();
                if (c > 0 || attempts >= 20) {
                    clearInterval(timer);
                }
            }, 250);
        }

        window.__iai666PatchedRegisterCustomWidgets = true;
    }
} catch {
    // ignore
}

const _iai666GlobalSequentialNodeIds = new Set();
let _iai666GlobalQueueInstalled = false;
let _iai666QueuePromptPrev = null;
let _iai666QueuePromptInHook = false;
let _iai666ApiQueuePromptPrev = null;
let _iai666ApiQueuePromptInHook = false;
let _iai666InGlobalQueuePrompt = false;
let _iai666GlobalQueueBtnInstalled = false;
let _iai666InGlobalQueueBtnClick = false;
let _iai666GlobalBtnDebugLastTsCandidate = 0;
let _iai666GlobalBtnDebugLastTsSkip = 0;
let _iai666GlobalBtnLockUntilTs = 0;
const _iai666PendingAutoExpandNodeIds = new Set();

let _iai666ExecutedHandler = null;
function _extractIdxTotalDeep(input, maxDepth = 4) {
    try {
        const visited = new WeakSet();
        const walk = (v, depth) => {
            if (depth > maxDepth) return null;
            if (v === null || v === undefined) return null;

            // Shape: [prompt, index, total]
            if (Array.isArray(v)) {
                if (v.length >= 3) {
                    const i0 = Number(v[1]);
                    const t0 = Number(v[2]);
                    if (Number.isFinite(i0) && Number.isFinite(t0)) return { idx: i0, total: t0 };
                }
                for (const it of v) {
                    const r = walk(it, depth + 1);
                    if (r) return r;
                }
                return null;
            }

            if (typeof v !== "object") return null;
            if (visited.has(v)) return null;
            visited.add(v);

            // Shape: { index, total } OR { outputs: { index, total } }
            const idxRaw = v?.index ?? v?.outputs?.index;
            const totalRaw = v?.total ?? v?.outputs?.total;
            const idx = Array.isArray(idxRaw) ? Number(idxRaw?.[0]) : Number(idxRaw);
            const total = Array.isArray(totalRaw) ? Number(totalRaw?.[0]) : Number(totalRaw);
            if (Number.isFinite(idx) && Number.isFinite(total)) return { idx, total };

            // Common wrappers
            const wrappers = [
                v?.output,
                v?.outputs,
                v?.detail,
                v?.data,
                v?.result,
                v?.ui,
            ];
            for (const w of wrappers) {
                const r = walk(w, depth + 1);
                if (r) return r;
            }

            // Search in object values
            for (const k of Object.keys(v)) {
                const r = walk(v[k], depth + 1);
                if (r) return r;
            }
            return null;
        };

        return walk(input, 0);
    } catch {
        return null;
    }
}

function _wrapPromptQueueNodeOnExecuted(node) {
    try {
        if (!node) return;
        const nodeId = String(node?.id);
        if (!nodeId || nodeId === "-1") return;

        const prev = node.onExecuted;
        if (typeof prev === "function" && prev.__iai666WrappedPromptQueueNodeOnExecuted) {
            return;
        }

        const wrapped = function () {
            try {
                const outArg = arguments?.[0];
                if (typeof _iai666ExecutedHandler === "function") {
                    _iai666ExecutedHandler({ detail: { node: node?.id, display_node: node?.id, output: outArg } }, "PromptQueueNode.onExecuted");
                }
            } catch {
                // ignore
            }
            if (typeof prev === "function") {
                return prev.apply(this, arguments);
            }
        };
        wrapped.__iai666WrappedPromptQueueNodeOnExecuted = true;
        node.onExecuted = wrapped;
        console.info("[PromptQueue] wrapped current PromptQueue node.onExecuted", { nodeId });
    } catch {
        // ignore
    }
}

let _iai666ExecutedHookInstalled = false;
function _matchPendingByApiNodeId(nodeId, displayNodeId) {
    try {
        const nid = nodeId != null ? String(nodeId) : "";
        const did = displayNodeId != null ? String(displayNodeId) : "";
        if (!nid && !did) return null;

        for (const pendingId of _iai666PendingAutoExpandNodeIds) {
            const ctx = _getRunCtx(String(pendingId));
            const v = ctx?.apiNodeIds;
            const set = v instanceof Set ? v : Array.isArray(v) ? new Set(v.map((x) => String(x))) : null;
            if (!set || set.size === 0) continue;
            if ((did && set.has(did)) || (nid && set.has(nid))) {
                return String(pendingId);
            }
        }
        return null;
    } catch {
        return null;
    }
}

function _installExecutedEventHookOnce() {
    if (_iai666ExecutedHookInstalled) return;
    try {
        let dbgLastEvtTs = 0;
        let dbgCount = 0;
        const dbgSeenTypes = new Set();
        const DBG_MAX = 80;
        const DBG_WINDOW_MS = 8000;
        const dbgLogEvt = (tag, name, evtOrDetail) => {
            try {
                const traceAll = _iai666TraceAllEnabled();
                const now = Date.now();
                const pendingCount = _iai666PendingAutoExpandNodeIds?.size || 0;
                if (pendingCount <= 0) return;
                if (!traceAll && dbgCount >= DBG_MAX) return;

                const evtType = typeof name === "string" ? name : String(name);
                const evtLower = evtType.toLowerCase();

                // Noisy events from some extensions can easily drown out the signal.
                // Skip known monitor events unless user explicitly forces debug.
                if (evtLower === "crystools.monitor") {
                    const forced0 = !!(typeof window !== "undefined" && window && window.__IAI666_EXEC_EVT_DEBUG);
                    if (!forced0) return;
                }

                const isInteresting = evtLower.includes("execut") || !dbgSeenTypes.has(evtType);
                if (!isInteresting) return;

                if (!traceAll) {
                    if (now - dbgLastEvtTs < 180) return;
                    dbgLastEvtTs = now;
                }

                // Only print within a short window after run start unless user explicitly forces debug.
                const forced = !!(typeof window !== "undefined" && window && window.__IAI666_EXEC_EVT_DEBUG);
                if (!traceAll && !forced) {
                    // Find the latest run context ts among pending nodes.
                    let latestTs = 0;
                    try {
                        for (const nid of _iai666PendingAutoExpandNodeIds) {
                            const ctx = _getRunCtx(String(nid));
                            if (ctx?.ts && ctx.ts > latestTs) latestTs = ctx.ts;
                        }
                    } catch {
                        // ignore
                    }
                    if (latestTs && now - latestTs > DBG_WINDOW_MS) return;
                }

                dbgCount++;
                dbgSeenTypes.add(evtType);
                const sample = evtOrDetail?.detail ?? evtOrDetail;
                const detailKeys = sample && typeof sample === "object" ? Object.keys(sample).slice(0, 40) : null;
                const detailSample = traceAll
                    ? sample
                    : sample && typeof sample === "object" ? JSON.parse(JSON.stringify(sample, (k, v) => {
                        if (typeof v === "string" && v.length > 400) return v.slice(0, 400) + "...";
                        return v;
                    })) : sample;

                console.info("[PromptQueue] exec-event sniff", {
                    tag,
                    evtType,
                    pendingCount,
                    n: dbgCount,
                    forced,
                    traceAll,
                    detailKeys,
                    detailSample,
                });

                if (traceAll) {
                    console.info("[PromptQueue] exec-event sniff (json)", _iai666SafeStringify({
                        tag,
                        evtType,
                        pendingCount,
                        detail: sample,
                    }));
                }
            } catch {
                // ignore
            }
        };

        const handler = (payload, source) => {
            try {
                const nodeRaw = payload?.detail?.node ?? payload?.node;
                const displayNodeRaw = payload?.detail?.display_node ?? payload?.display_node;
                const nodeId = String(nodeRaw);
                const displayNodeId = String(displayNodeRaw);

                const pendingIds0 = Array.from(_iai666PendingAutoExpandNodeIds).slice(0, 20);

                const matchedNodeId =
                    (displayNodeId && _iai666PendingAutoExpandNodeIds.has(displayNodeId) ? displayNodeId : null) ||
                    (nodeId && _iai666PendingAutoExpandNodeIds.has(nodeId) ? nodeId : null) ||
                    null;

                const mappedPendingId = !matchedNodeId ? _matchPendingByApiNodeId(nodeId, displayNodeId) : null;

                // If we can't match by id (group/virtual nodes may remap ids), but there is exactly one pending node,
                // and output contains parseable index/total, treat it as the PromptQueue execution for that node.
                let fallbackPendingId = null;
                if (!matchedNodeId && !mappedPendingId && _iai666PendingAutoExpandNodeIds.size === 1) {
                    try {
                        const onlyPending = Array.from(_iai666PendingAutoExpandNodeIds)[0];
                        const out0 = payload?.detail ?? payload;

                        const r0 = _extractIdxTotalDeep(out0);
                        if (r0 && Number.isFinite(r0.idx) && Number.isFinite(r0.total)) {
                            fallbackPendingId = String(onlyPending);
                            console.info("[PromptQueue] executed handler fallback match: single pending", {
                                source,
                                fallbackPendingId,
                                nodeId,
                                displayNodeId,
                                idx: r0.idx,
                                total: r0.total,
                            });
                        }
                    } catch {
                        // ignore
                    }
                }

                const effectiveNodeId = matchedNodeId || mappedPendingId || fallbackPendingId;

                if (!effectiveNodeId) {
                    // Mirror-based fallback: some frontends never emit executed/onExecuted for PromptQueue itself.
                    // In that case, downstream nodes that display PromptQueue outputs (index/total) will execute.
                    // When there is exactly one pending PromptQueue, capture idx/total from those mirror nodes.
                    try {
                        if (_iai666PendingAutoExpandNodeIds.size === 1) {
                            const pendingId = Array.from(_iai666PendingAutoExpandNodeIds)[0];
                            const ctxm = _getRunCtx(String(pendingId)) || null;
                            const idxSet = ctxm?.idxMirrorNodeIds instanceof Set ? ctxm.idxMirrorNodeIds : null;
                            const totalSet = ctxm?.totalMirrorNodeIds instanceof Set ? ctxm.totalMirrorNodeIds : null;
                            const hitIdx = !!(idxSet && (idxSet.has(nodeId) || idxSet.has(displayNodeId)));
                            const hitTotal = !!(totalSet && (totalSet.has(nodeId) || totalSet.has(displayNodeId)));
                            if (hitIdx || hitTotal) {
                                const out = payload?.detail?.output ?? payload?.output ?? payload?.detail ?? payload;
                                const txt = out?.text;
                                const raw = Array.isArray(txt) ? txt?.[0] : txt;
                                const num = Number(raw);
                                if (Number.isFinite(num)) {
                                    const ctx1 = _getRunCtx(String(pendingId)) || {};
                                    const curRunId = ctx1?.runId || null;
                                    const next = { ...ctx1 };
                                    if (next.mirrorRunId !== curRunId) {
                                        next.mirrorIdx = undefined;
                                        next.mirrorTotal = undefined;
                                        next.mirrorRunId = curRunId;
                                    }
                                    if (hitIdx) next.mirrorIdx = num;
                                    if (hitTotal) next.mirrorTotal = num;
                                    _setRunCtx(String(pendingId), next);
                                    console.info("[PromptQueue] mirror idx/total captured", {
                                        runId: ctx1?.runId || null,
                                        pendingId: String(pendingId),
                                        source,
                                        nodeId,
                                        displayNodeId,
                                        hitIdx,
                                        hitTotal,
                                        mirrorIdx: next.mirrorIdx,
                                        mirrorTotal: next.mirrorTotal,
                                        mirrorRunId: next.mirrorRunId,
                                    });

                                    if (next.mirrorRunId === curRunId && Number.isFinite(next.mirrorIdx) && Number.isFinite(next.mirrorTotal)) {
                                        const idx0 = Number(next.mirrorIdx);
                                        const total0 = Number(next.mirrorTotal);
                                        const expectedTotal = Number.isFinite(ctx1?.expectedTotal) ? Number(ctx1.expectedTotal) : null;

                                        if (Number.isFinite(expectedTotal) && expectedTotal !== total0) {
                                            console.warn("[PromptQueue] mirror auto expand blocked: total mismatch", {
                                                pendingId: String(pendingId),
                                                runId: curRunId,
                                                idx: idx0,
                                                total: total0,
                                                expectedTotal,
                                            });
                                            return;
                                        }

                                        if (Number.isFinite(expectedTotal) && expectedTotal <= 1) {
                                            _iai666PendingAutoExpandNodeIds.delete(String(pendingId));
                                            _clearRunCtx(String(pendingId));
                                            console.info("[PromptQueue] mirror auto expand stopped: expectedTotal<=1", {
                                                pendingId: String(pendingId),
                                                runId: curRunId,
                                                expectedTotal,
                                            });
                                            return;
                                        }
                                        if (idx0 === 0 && total0 > 1) {
                                            if (next.autoExpandedRunId === curRunId) {
                                                console.info("[PromptQueue] mirror auto expand skipped: already expanded for run", {
                                                    pendingId: String(pendingId),
                                                    runId: curRunId,
                                                    idx: idx0,
                                                    total: total0,
                                                });
                                                return;
                                            }
                                            const node = app?.graph?._nodes?.find?.((n) => String(n?.id) === String(pendingId)) || null;
                                            if (node) {
                                                next.autoExpandedRunId = curRunId;
                                                _setRunCtx(String(pendingId), next);
                                                _iai666PendingAutoExpandNodeIds.add(String(pendingId));
                                                _autoEnqueueRemainingAfterFirstRun(node, total0);
                                            }
                                        }
                                    }
                                }
                                return;
                            }
                        }
                    } catch {
                        // ignore
                    }

                    if ((!nodeId || nodeId === "undefined" || nodeId === "null") && (!displayNodeId || displayNodeId === "undefined" || displayNodeId === "null")) {
                        console.info("[PromptQueue] executed handler skip: no nodeId", {
                            source,
                            nodeRaw,
                            displayNodeRaw,
                            pendingIds: pendingIds0,
                            payloadKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 30) : null,
                            detailKeys: payload?.detail && typeof payload.detail === "object" ? Object.keys(payload.detail).slice(0, 30) : null,
                        });
                        return;
                    }

                    let pendingApiMap = null;
                    try {
                        pendingApiMap = pendingIds0.map((pid) => {
                            const ctx0 = _getRunCtx(String(pid));
                            const v0 = ctx0?.apiNodeIds;
                            const arr0 = v0 instanceof Set ? Array.from(v0) : Array.isArray(v0) ? v0.map((x) => String(x)) : [];
                            return { pid: String(pid), apiNodeIdsHead: arr0.slice(0, 10) };
                        });
                    } catch {
                        pendingApiMap = null;
                    }
                    console.info("[PromptQueue] executed handler skip: not pending", {
                        source,
                        nodeId,
                        displayNodeId,
                        pendingIds: pendingIds0,
                        mappedPendingId,
                        pendingApiMap,
                    });
                    try {
                        console.info("[PromptQueue] executed handler skip: not pending (json)", JSON.stringify({
                            source,
                            nodeId,
                            displayNodeId,
                            pendingIds: pendingIds0,
                            mappedPendingId,
                            pendingApiMap,
                        }));
                    } catch {
                        // ignore
                    }
                    return;
                }

                if (!effectiveNodeId || effectiveNodeId === "undefined" || effectiveNodeId === "null") {
                    console.info("[PromptQueue] executed handler skip: no nodeId", {
                        source,
                        nodeRaw,
                        displayNodeRaw,
                        pendingIds: pendingIds0,
                        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 30) : null,
                        detailKeys: payload?.detail && typeof payload.detail === "object" ? Object.keys(payload.detail).slice(0, 30) : null,
                    });
                    return;
                }

                const ctx = _getRunCtx(effectiveNodeId);
                const out = payload?.detail?.output ?? payload?.output ?? payload?.detail ?? payload;
                console.info("[PromptQueue] executed event pending hit", {
                    runId: ctx?.runId || null,
                    nodeId: effectiveNodeId,
                    nodeIdRaw: nodeId,
                    displayNodeIdRaw: displayNodeId,
                    source,
                    payloadKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : null,
                    outKeys: out && typeof out === "object" ? Object.keys(out).slice(0, 30) : null,
                });

                const r = _extractIdxTotalDeep(out);
                const idx = r?.idx;
                const total = r?.total;

                if (!Number.isFinite(idx) || !Number.isFinite(total)) {
                    console.warn("[PromptQueue] executed event pending but cannot parse idx/total", {
                        runId: ctx?.runId || null,
                        nodeId: effectiveNodeId,
                        outSample: out,
                    });
                    return;
                }

                console.info("[PromptQueue] executed event parsed", {
                    runId: ctx?.runId || null,
                    nodeId: effectiveNodeId,
                    source,
                    idx,
                    total,
                });

                if (idx !== 0) return;
                if (total <= 1) {
                    _iai666PendingAutoExpandNodeIds.delete(effectiveNodeId);
                    _clearRunCtx(effectiveNodeId);
                    return;
                }

                const node = app?.graph?._nodes?.find?.((n) => String(n?.id) === effectiveNodeId) || null;
                if (!node) {
                    console.warn("[PromptQueue] executed event: node not found in graph", {
                        runId: ctx?.runId || null,
                        nodeId: effectiveNodeId,
                        nodeIdRaw: nodeId,
                        displayNodeIdRaw: displayNodeId,
                        source,
                    });
                    _iai666PendingAutoExpandNodeIds.delete(effectiveNodeId);
                    _clearRunCtx(effectiveNodeId);
                    return;
                }

                _autoEnqueueRemainingAfterFirstRun(node, total);
            } catch (e) {
                console.error("[PromptQueue] executed event hook error", {
                    error: String(e?.message || e),
                    stack: e?.stack,
                });
            }
        };

        _iai666ExecutedHandler = handler;

        const maybeHandleExecutedLike = (evtType, payload, source) => {
            try {
                const t = String(evtType || "").toLowerCase();
                if (!t.includes("execut")) return false;
                const d = payload?.detail ?? payload;
                const hasOutput = d && (d.output != null || d.outputs != null);
                // Only treat as an executed-like event when it actually carries outputs.
                // Avoid mis-routing `executing`/progress events that contain only node ids.
                if (!hasOutput) return false;

                console.info("[PromptQueue] executed-like event => handler", {
                    evtType: String(evtType || ""),
                    source,
                    pendingIds: Array.from(_iai666PendingAutoExpandNodeIds).slice(0, 20),
                    detailKeys: d && typeof d === "object" ? Object.keys(d).slice(0, 30) : null,
                });
                handler(payload, source);
                return true;
            } catch {
                return false;
            }
        };

        // Final fallback: some builds may not dispatch a public "executed" event; instead they call
        // node.onExecuted(output) directly. LiteGraph base prototype often DOES NOT define onExecuted,
        // so we must hook via a setter to capture later assignments.
        try {
            const tryInstallLGraphHook = () => {
                try {
                    const g = (typeof window !== "undefined" && window) ? window : null;
                    const LiteGraph = g?.LiteGraph || g?.litegraph;
                    const LGraphNode = LiteGraph?.LGraphNode || g?.LGraphNode;
                    const proto = LGraphNode?.prototype;
                    if (!proto) return false;
                    if (proto.__iai666PatchedOnExecutedSetter) return true;

                    proto.__iai666PatchedOnExecutedSetter = true;
                    const sym = "__iai666OrigOnExecuted";

                    // Preserve existing value (may be undefined).
                    const desc = Object.getOwnPropertyDescriptor(proto, "onExecuted");
                    const prevVal = desc && typeof desc.get === "function" ? desc.get.call(proto) : proto.onExecuted;
                    proto[sym] = prevVal;

                    const makeWrapped = (fn) => {
                        if (typeof fn !== "function") return fn;
                        if (fn.__iai666WrappedOnExecuted) return fn;
                        const wrapped = function () {
                            try {
                                const nodeId = String(this?.id);
                                const outArg = arguments?.[0];

                                // Diagnostic: when there is a pending PromptQueue, print what onExecuted receives.
                                // Rate-limited to avoid flooding.
                                try {
                                    if (_iai666PendingAutoExpandNodeIds.size === 1) {
                                        const onlyPending = Array.from(_iai666PendingAutoExpandNodeIds)[0];
                                        const ctx0 = _getRunCtx(String(onlyPending));
                                        const now = Date.now();
                                        const traceAll = _iai666TraceAllEnabled();
                                        if (traceAll || !ctx0 || !ctx0.__dbgOnExecTs || now - ctx0.__dbgOnExecTs > 800) {
                                            const rDbg = _extractIdxTotalDeep(outArg);
                                            console.info("[PromptQueue] onExecuted sniff", {
                                                pendingId: String(onlyPending),
                                                runId: ctx0?.runId || null,
                                                thisId: nodeId,
                                                outType: Array.isArray(outArg) ? "array" : typeof outArg,
                                                outKeys: outArg && typeof outArg === "object" ? Object.keys(outArg).slice(0, 30) : null,
                                                extracted: rDbg,
                                            });

                                            if (traceAll) {
                                                console.info("[PromptQueue] onExecuted sniff (json)", _iai666SafeStringify({
                                                    pendingId: String(onlyPending),
                                                    runId: ctx0?.runId || null,
                                                    thisId: nodeId,
                                                    outArg,
                                                    extracted: rDbg,
                                                }));
                                            }

                                            _setRunCtx(String(onlyPending), { ...ctx0, __dbgOnExecTs: now });
                                        }
                                    }
                                } catch {
                                    // ignore
                                }

                                // Normal path: the executed node id is exactly the pending PromptQueue node id.
                                if (nodeId && _iai666PendingAutoExpandNodeIds.has(nodeId)) {
                                    handler({ detail: { node: this?.id, display_node: this?.id, output: outArg } }, "node.onExecuted");
                                } else if (_iai666PendingAutoExpandNodeIds.size === 1) {
                                    // Fallback: attribute any parseable PromptQueue output to the only pending node.
                                    const r0 = _extractIdxTotalDeep(outArg);
                                    if (r0 && Number.isFinite(r0.idx) && Number.isFinite(r0.total)) {
                                        const onlyPending = Array.from(_iai666PendingAutoExpandNodeIds)[0];
                                        handler(
                                            { detail: { node: onlyPending, display_node: onlyPending, output: outArg } },
                                            "node.onExecuted(single-pending-fallback)"
                                        );
                                    }
                                }
                            } catch {
                                // ignore
                            }
                            return fn.apply(this, arguments);
                        };
                        wrapped.__iai666WrappedOnExecuted = true;
                        return wrapped;
                    };

                    Object.defineProperty(proto, "onExecuted", {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return this[sym];
                        },
                        set(v) {
                            this[sym] = makeWrapped(v);
                        },
                    });

                    // Wrap existing nodes in graph (best-effort).
                    try {
                        const nodes = app?.graph?._nodes || [];
                        for (const n of nodes) {
                            if (n && typeof n.onExecuted === "function") {
                                n.onExecuted = makeWrapped(n.onExecuted);
                            }
                        }
                    } catch {
                        // ignore
                    }

                    console.info("[PromptQueue] node.onExecuted setter hook installed");
                    return true;
                } catch {
                    return false;
                }
            };

            if (!tryInstallLGraphHook()) {
                const start = Date.now();
                const timer = setInterval(() => {
                    if (tryInstallLGraphHook()) {
                        clearInterval(timer);
                        return;
                    }
                    if (Date.now() - start > 8000) {
                        clearInterval(timer);
                    }
                }, 250);
            }
        } catch {
            // ignore
        }

        // Ultimate fallback: intercept dispatchEvent globally so we can catch CustomEvent("executed")
        // even if the sender uses a module-local dispatchCustomEvent implementation.
        try {
            const proto = (typeof EventTarget !== "undefined" && EventTarget) ? EventTarget.prototype : null;
            if (proto && typeof proto.dispatchEvent === "function" && !proto.__iai666PatchedDispatchEvent) {
                proto.__iai666PatchedDispatchEvent = true;
                const origDispatchEvent = proto.dispatchEvent;
                proto.dispatchEvent = function (evt) {
                    try {
                        const t = evt?.type;
                        dbgLogEvt("dispatchEvent", t, evt);
                        if (t === "executed") {
                            handler(evt, "EventTarget.dispatchEvent");
                        } else {
                            maybeHandleExecutedLike(t, evt, "EventTarget.dispatchEvent");
                        }
                    } catch {
                        // ignore
                    }
                    return origDispatchEvent.apply(this, arguments);
                };
                console.info("[PromptQueue] dispatchEvent hook installed");
            }
        } catch {
            // ignore
        }

        // In some builds/extensions, status events are dispatched through dispatchCustomEvent rather than
        // standard addEventListener("executed") on the same target. Wrap dispatchCustomEvent to ensure we can
        // observe the event name and fire handler for "executed".
        const installDispatchHook = (obj, name) => {
            try {
                if (!obj) return false;
                const fn = obj?.dispatchCustomEvent;
                if (typeof fn !== "function") return false;
                const flag = `__iai666PatchedDispatchCustomEvent_${name}`;
                if (obj[flag]) return true;
                obj[flag] = true;
                const wrapped = function (event, detail) {
                    try {
                        dbgLogEvt("dispatchCustomEvent", event, detail);
                        const payload = { detail };
                        if (event === "executed") {
                            handler(payload, `${name}.dispatchCustomEvent`);
                        } else {
                            maybeHandleExecutedLike(event, payload, `${name}.dispatchCustomEvent`);
                        }
                    } catch {
                        // ignore
                    }
                    return fn.apply(this, arguments);
                };
                try {
                    Object.defineProperty(obj, "dispatchCustomEvent", {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: wrapped,
                    });
                } catch {
                    obj.dispatchCustomEvent = wrapped;
                }
                console.info("[PromptQueue] dispatchCustomEvent hook installed", { target: name });
                return true;
            } catch {
                return false;
            }
        };

        const targets = [];
        if (api && typeof api.addEventListener === "function") targets.push([api, "api"]);
        if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") targets.push([window, "window"]);
        if (typeof document !== "undefined" && document && typeof document.addEventListener === "function") targets.push([document, "document"]);
        const rgthree = (typeof window !== "undefined" && window) ? window.rgthree : null;
        if (rgthree && typeof rgthree.addEventListener === "function") targets.push([rgthree, "rgthree"]);

        if (targets.length === 0) {
            console.warn("[PromptQueue] executed hook not installed: no event targets");
            return;
        }

        const successTargets = [];
        const failedTargets = [];
        for (const [t, name] of targets) {
            try {
                t.addEventListener("executed", (payload) => handler(payload, name));
                successTargets.push(name);
            } catch (e) {
                failedTargets.push({ name, error: String(e?.message || e) });
            }
        }

        // Also hook dispatchCustomEvent on known senders.
        const dispatchHooked = [];
        if (installDispatchHook(api, "api")) dispatchHooked.push("api");
        if (installDispatchHook(rgthree, "rgthree")) dispatchHooked.push("rgthree");

        if (successTargets.length === 0) {
            console.warn("[PromptQueue] executed hook not installed: all targets failed", {
                failedTargets,
            });
            return;
        }

        _iai666ExecutedHookInstalled = true;
        console.info("[PromptQueue] executed hook installed", {
            successTargets,
            failedTargets,
            dispatchHooked,
        });
    } catch {
        // ignore
    }
}

let _iai666RunSeq = 0;
const _iai666RunCtxByNodeId = new Map();
function _nextRunId() {
    _iai666RunSeq = (_iai666RunSeq + 1) % 1000000;
    return `${Date.now()}-${_iai666RunSeq}`;
}

function _getRunCtx(nodeId) {
    try {
        const key = String(nodeId);
        return _iai666RunCtxByNodeId.get(key) || null;
    } catch {
        return null;
    }
}

function _setRunCtx(nodeId, ctx) {
    try {
        const key = String(nodeId);
        if (!key) return;
        _iai666RunCtxByNodeId.set(key, ctx);
    } catch {
        // ignore
    }
}

function _clearRunCtx(nodeId) {
    try {
        _iai666RunCtxByNodeId.delete(String(nodeId));
    } catch {
        // ignore
    }
}

function _resetNodeAutoExpandState(node, reason) {
    try {
        const nodeId = String(node?.id);
        if (!nodeId) return;
        console.info("[PromptQueue] reset auto-expand state start", {
            nodeId,
            reason: String(reason || ""),
            pendingBefore: _iai666PendingAutoExpandNodeIds?.has?.(nodeId) || false,
        });
        try {
            _iai666PendingAutoExpandNodeIds.delete(nodeId);
        } catch {
            // ignore
        }
        _clearRunCtx(nodeId);
        console.info("[PromptQueue] reset auto-expand state ok", {
            nodeId,
            reason: String(reason || ""),
            pendingAfter: _iai666PendingAutoExpandNodeIds?.has?.(nodeId) || false,
        });
    } catch {
        // ignore
    }
}

function _getEnabledPromptQueueNodes() {
    try {
        const nodes = app?.graph?._nodes || [];
        return nodes.filter((n) => {
            const chk = n?._promptQueueUI?.globalChk;
            return !!chk?.checked;
        });
    } catch {
        return [];
    }
}

async function _autoEnqueueRemainingAfterFirstRun(node, total) {
    if (!node) return;
    const nodeId = String(node.id);
    if (!_iai666PendingAutoExpandNodeIds.has(nodeId)) return;
    _iai666PendingAutoExpandNodeIds.delete(nodeId);

    if (!Number.isFinite(total) || total <= 1) return;

    const ctx0 = _getRunCtx(nodeId);
    console.info("[PromptQueue] auto expand after first run", { runId: ctx0?.runId || null, nodeId: node.id, total });
    const basePrompt = await app.graphToPrompt();
    const items = getPromptsFromWidget(node);
    try {
        for (let idx = 1; idx < total; idx++) {
            const p = deepClone(basePrompt);
            const apiNode = p?.output?.[nodeId] ?? p?.output?.[Number(nodeId)];
            if (!apiNode) {
                console.warn("[PromptQueue] auto expand skipped: apiNode not found in prompt output", {
                    runId: ctx0?.runId || null,
                    nodeId,
                    outputKeysSample: Object.keys(p?.output || {}).slice(0, 10),
                });
                continue;
            }
            apiNode.inputs = apiNode.inputs || {};
            apiNode.inputs.index = idx;
            console.info("[PromptQueue] auto expand enqueue", {
                runId: ctx0?.runId || null,
                nodeId,
                idx,
                total,
            });
            const hint = typeof items?.[idx] === "string" ? String(items[idx]) : "";
            await _iai666QueuePromptWithHint(p, hint);
        }
    } catch (e) {
        console.error("[PromptQueue] auto expand failed", {
            runId: ctx0?.runId || null,
            nodeId,
            err: String(e?.message || e),
        });
    }

    _clearRunCtx(nodeId);
}

function _isPromptsInputConnected(node) {
    try {
        const ins = Array.isArray(node?.inputs) ? node.inputs : [];
        const p = ins.find((x) => String(x?.name || "") === "prompts");
        const link = p?.link;
        return link !== null && link !== undefined;
    } catch {
        return false;
    }
}

function _iai666HookSetter(obj, prop, wrapFactory) {
    try {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (desc && desc.configurable === false) return false;

        let current = obj[prop];
        let wrapped = wrapFactory(() => current);
        Object.defineProperty(obj, prop, {
            configurable: true,
            enumerable: true,
            get() {
                return wrapped;
            },
            set(v) {
                current = v;
                wrapped = wrapFactory(() => current);
            },
        });
        return true;
    } catch {
        return false;
    }

}

function _isLikelyGlobalQueueButton(el) {
    const txt = (el?.innerText || el?.textContent || "").trim();
    const title = String(el?.title || "");
    const aria = String(el?.getAttribute?.("aria-label") || "");
    const role = String(el?.getAttribute?.("role") || "");
    const id = String(el?.id || "");
    const cls = String(el?.className || "");
    const hay = `${txt} ${title} ${aria} ${role} ${id} ${cls}`.toLowerCase();
    if (hay.includes("queue prompt")) return true;
    if (hay.includes("queue") && hay.includes("prompt")) return true;
    if (hay.includes("执行") && (hay.includes("队") || hay.includes("queue"))) return true;
    if (hay.includes("运行")) return true;
    if (hay.includes("加入队列")) return true;
    if (hay.includes("排队")) return true;
    if (hay.includes("enqueue")) return true;
    if (hay.includes("prompt") && (hay.includes("run") || hay.includes("start") || hay.includes("执行"))) return true;
    if (id.toLowerCase().includes("queue")) return true;
    if (cls.toLowerCase().includes("queue")) return true;
    return false;
}

function _installGlobalQueueButtonClickHookOnce() {
    if (_iai666GlobalQueueBtnInstalled) return;
    _iai666GlobalQueueBtnInstalled = true;
    console.info("[PromptQueue] installing global queue button click hook");

    const handler = async (e) => {
            try {
                const nowLock = Date.now();
                if (_iai666InGlobalQueueBtnClick || nowLock < _iai666GlobalBtnLockUntilTs) return;
                const enabledNodes = _getEnabledPromptQueueNodes();
                if (enabledNodes.length !== 1) {
                    const now = Date.now();
                    if (now - _iai666GlobalBtnDebugLastTsSkip > 300) {
                        _iai666GlobalBtnDebugLastTsSkip = now;
                        console.info("[PromptQueue] global btn skip: enabledIds.length!=1", {
                            enabledCount: enabledNodes.length,
                            enabledIds: enabledNodes.map((n) => String(n?.id)),
                        });
                    }
                    return;
                }

                const t = e?.target;
                // Don't intercept clicks inside our own PromptQueue node panel.
                if (t?.closest?.("[data-iai666-promptqueue]")) return;

                const path = (typeof e?.composedPath === "function" ? e.composedPath() : []) || [];
                const clickable =
                    path.find((x) => x?.tagName === "BUTTON") ||
                    path.find((x) => (x?.getAttribute?.("role") || "").toLowerCase() === "button") ||
                    null;
                if (!clickable) return;

                // Debug helper (rate-limited): confirm we are seeing the global button event at all.
                const now0 = Date.now();
                if (now0 - _iai666GlobalBtnDebugLastTsCandidate > 1200) {
                    _iai666GlobalBtnDebugLastTsCandidate = now0;
                    console.info("[PromptQueue] global btn candidate", {
                        type: e?.type,
                        text: (clickable?.innerText || clickable?.textContent || "").trim().slice(0, 80),
                        aria: String(clickable?.getAttribute?.("aria-label") || "").slice(0, 80),
                        className: String(clickable?.className || "").slice(0, 120),
                    });
                }

                if (!_isLikelyGlobalQueueButton(clickable)) {
                    // Debug helper (rate-limited): show what button was clicked, so we can match it.
                    const now = Date.now();
                    if (now - _iai666GlobalBtnDebugLastTsSkip > 1200) {
                        _iai666GlobalBtnDebugLastTsSkip = now;
                        console.info("[PromptQueue] global queue btn not matched", {
                            tag: clickable?.tagName,
                            text: (clickable?.innerText || clickable?.textContent || "").trim().slice(0, 80),
                            title: String(clickable?.title || "").slice(0, 80),
                            aria: String(clickable?.getAttribute?.("aria-label") || "").slice(0, 80),
                            id: String(clickable?.id || "").slice(0, 80),
                            className: String(clickable?.className || "").slice(0, 120),
                        });
                    }
                    return;
                }

                // Mark as in-click early to avoid duplicate triggers from pointerdown/mousedown/click.
                _iai666InGlobalQueueBtnClick = true;
                _iai666GlobalBtnLockUntilTs = Date.now() + 350;
                setTimeout(() => {
                    _iai666InGlobalQueueBtnClick = false;
                }, 360);

                const node = enabledNodes[0];
                const nodeId0 = String(node?.id);
                const runId = _nextRunId();
                const prevCtx0 = _getRunCtx(nodeId0) || {};
                _setRunCtx(nodeId0, {
                    ...prevCtx0,
                    runId,
                    source: "global_btn",
                    ts: Date.now(),
                    mirrorIdx: undefined,
                    mirrorTotal: undefined,
                    mirrorRunId: runId,
                    autoExpandedRunId: undefined,
                    expectedTotal: undefined,
                });
                console.info("[PromptQueue] run start", {
                    runId,
                    source: "global_btn",
                    nodeId: node?.id,
                });

                // Ensure executed hook is installed as early as possible for this run.
                try {
                    _installExecutedEventHookOnce();
                    console.info("[PromptQueue] executed hook status", {
                        runId,
                        installed: _iai666ExecutedHookInstalled,
                    });
                } catch {
                    // ignore
                }

                // If node id is not assigned yet (-1), never mass-enqueue cached prompts_json.
                // This situation frequently happens right after node creation and can cause huge stale queues.
                if (String(node?.id) === "-1") {
                    _iai666PendingAutoExpandNodeIds.add(String(node.id));
                    console.info("[PromptQueue] global btn: node id -1, fallback to two-phase", {
                        runId,
                        nodeId: node.id,
                    });
                    return;
                }

                // If upstream prompts is connected/resolved for this run, NEVER use cached prompts_json.
                // We detect it from the real prompt JSON to avoid relying on node.inputs.link (which may be unreliable).
                try {
                    const nodeId = String(node?.id);
                    if (nodeId && nodeId !== "-1") {
                        const p = await app.graphToPrompt();
                        const apiNode = p?.output?.[nodeId] ?? p?.output?.[Number(nodeId)];
                        const hasUpstreamPrompts =
                            apiNode && apiNode.inputs && Object.prototype.hasOwnProperty.call(apiNode.inputs, "prompts");
                        if (hasUpstreamPrompts || _isPromptsInputConnected(node)) {
                            _iai666PendingAutoExpandNodeIds.add(String(node.id));
                            _wrapPromptQueueNodeOnExecuted(node);
                            console.info("[PromptQueue] global btn: upstream prompts detected, will auto expand after first run", {
                                runId,
                                nodeId: node.id,
                            });
                            return;
                        }
                    }
                } catch {
                    // ignore and fallback to cached mode
                }

                const cachedItems = getPromptsFromWidget(node);
                const nonEmpty = cachedItems.filter((s) => typeof s === "string" && s.trim().length > 0);
                if (nonEmpty.length <= 1) {
                    const now = Date.now();
                    if (now - _iai666GlobalBtnDebugLastTsSkip > 300) {
                        _iai666GlobalBtnDebugLastTsSkip = now;
                        console.info("[PromptQueue] global btn skip: nonEmpty<=1", {
                            nodeId: node.id,
                            total: cachedItems.length,
                            nonEmpty: nonEmpty.length,
                        });
                    }
                    return;
                }

                console.info("[PromptQueue] global queue button intercepted", { runId, nodeId: node.id, count: nonEmpty.length });
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                await queueAllPromptsSequential(node);
            } finally {
                // release is handled by timeout to debounce multi-event triggers
            }
        };

    // Some UI libs stop click; capture multiple event types for robustness.
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("click", handler, true);
}

function _installGlobalSequentialQueueHookOnce() {
    if (_iai666GlobalQueueInstalled) return;
    _iai666GlobalQueueInstalled = true;

    _installGlobalQueueButtonClickHookOnce();

    _installExecutedEventHookOnce();

    _iai666HookSetter(api, "queuePrompt", (getCurrent) =>
        async function () {
            const cur = getCurrent();
            _iai666ApiQueuePromptPrev = cur;
            if (_iai666ApiQueuePromptInHook) {
                return await cur.apply(api, arguments);
            }

            const prompt = arguments?.[1];
            if (!prompt || typeof prompt !== "object") {
                return await cur.apply(api, arguments);
            }

            const enabledNodes = _getEnabledPromptQueueNodes();
            if (enabledNodes.length !== 1) {
                return await cur.apply(api, arguments);
            }

            const node = enabledNodes[0];

            const nodeIdRun = String(node?.id);
            const ctxRun = _getRunCtx(nodeIdRun);
            const runId = ctxRun?.runId || null;
            console.info("[PromptQueue] api.queuePrompt hook enter", {
                runId,
                nodeId: nodeIdRun,
                argCount: arguments?.length,
                outputKeysSample: prompt?.output && typeof prompt.output === "object" ? Object.keys(prompt.output).slice(0, 10) : null,
            });

            // Record mirror nodes for PromptQueue index/total (e.g. showAnything that displays [PromptQueue,index] & [PromptQueue,total]).
            try {
                const outAll = prompt?.output;
                const pqKey = String(nodeIdRun);
                if (outAll && typeof outAll === "object" && pqKey) {
                    const idxMirrors = new Set();
                    const totalMirrors = new Set();
                    for (const k of Object.keys(outAll)) {
                        const n = outAll[k];
                        const any = n?.inputs?.anything;
                        if (Array.isArray(any) && String(any?.[0]) === pqKey) {
                            const slot = Number(any?.[1]);
                            if (slot === 1) idxMirrors.add(String(k));
                            if (slot === 2) totalMirrors.add(String(k));
                        }
                    }
                    if (idxMirrors.size || totalMirrors.size) {
                        const prevCtx = _getRunCtx(nodeIdRun) || {};
                        _setRunCtx(nodeIdRun, {
                            ...prevCtx,
                            idxMirrorNodeIds: idxMirrors.size ? idxMirrors : prevCtx.idxMirrorNodeIds,
                            totalMirrorNodeIds: totalMirrors.size ? totalMirrors : prevCtx.totalMirrorNodeIds,
                        });
                        console.info("[PromptQueue] recorded mirror node ids", {
                            runId,
                            nodeId: nodeIdRun,
                            idxMirrorNodeIds: Array.from(idxMirrors),
                            totalMirrorNodeIds: Array.from(totalMirrors),
                        });
                    }
                }
            } catch {
                // ignore
            }

            try {
                if (_iai666TraceAllEnabled()) {
                    const outAll = prompt?.output;
                    const nodes = [];
                    if (outAll && typeof outAll === "object") {
                        for (const k of Object.keys(outAll)) {
                            const n = outAll[k];
                            const inputs = n?.inputs;
                            const inputsKeys = inputs && typeof inputs === "object" ? Object.keys(inputs).slice(0, 40) : null;
                            nodes.push({
                                key: String(k),
                                class_type: String(n?.class_type || ""),
                                inputsKeys,
                                index: inputs?.index,
                                hasPromptsKey: inputs ? Object.prototype.hasOwnProperty.call(inputs, "prompts") : false,
                                promptsType: Array.isArray(inputs?.prompts) ? "array" : typeof inputs?.prompts,
                                promptsLen: Array.isArray(inputs?.prompts) ? inputs.prompts.length : typeof inputs?.prompts === "string" ? inputs.prompts.length : null,
                            });
                        }
                    }
                    console.info("[PromptQueue] api.queuePrompt prompt.output snapshot (json)", _iai666SafeStringify({
                        runId,
                        nodeId: nodeIdRun,
                        nodes,
                    }));
                }
            } catch {
                // ignore
            }

            // Record backend/api node ids for PromptQueue so executed events with remapped node ids can be attributed
            // back to this pending graph node id.
            try {
                const out0 = prompt?.output;
                if (out0 && typeof out0 === "object") {
                    const apiIds = new Set();
                    for (const k of Object.keys(out0)) {
                        const n = out0[k];
                        const ct = String(n?.class_type || "");
                        if (ct === "PromptQueue" || (ct && ct.includes("PromptQueue"))) {
                            apiIds.add(String(k));
                        }
                    }
                    if (apiIds.size > 0) {
                        const prevCtx = _getRunCtx(nodeIdRun) || {};
                        const merged = new Set([...(prevCtx?.apiNodeIds instanceof Set ? prevCtx.apiNodeIds : []), ...apiIds]);
                        _setRunCtx(nodeIdRun, {
                            ...prevCtx,
                            apiNodeIds: merged,
                        });
                        console.info("[PromptQueue] recorded PromptQueue apiNodeIds", {
                            runId,
                            nodeId: nodeIdRun,
                            apiNodeIds: Array.from(merged).slice(0, 20),
                        });
                        try {
                            console.info("[PromptQueue] recorded PromptQueue apiNodeIds (json)", JSON.stringify({
                                runId,
                                nodeId: nodeIdRun,
                                apiNodeIds: Array.from(merged),
                            }));
                        } catch {
                            // ignore
                        }
                    }
                }
            } catch (e) {
                console.error("[PromptQueue] record PromptQueue apiNodeIds fail", {
                    runId,
                    nodeId: nodeIdRun,
                    error: String(e?.message || e),
                });
            }

            // Hotfix: some old workflows may have corrupted widget_values order where index becomes a string like "split".
            // Fix it in prompt JSON before validation/queue.
            try {
                const nodeIdFix = String(node?.id);
                const apiNodeFix = prompt?.output?.[nodeIdFix];
                if (apiNodeFix && apiNodeFix.inputs && Object.prototype.hasOwnProperty.call(apiNodeFix.inputs, "index")) {
                    const raw = apiNodeFix.inputs.index;
                    const fixed = coerceIndexToInt(raw, 0);
                    if (raw !== fixed) {
                        console.warn("[PromptQueue] coerced invalid index", {
                            runId: ctxRun?.runId || null,
                            nodeId: nodeIdFix,
                            raw,
                            fixed,
                        });
                        apiNodeFix.inputs.index = fixed;
                    }
                }
            } catch (e) {
                console.error("[PromptQueue] coerce index fail", {
                    runId: ctxRun?.runId || null,
                    nodeId: String(node?.id),
                    error: String(e?.message || e),
                });
            }

            // If PromptQueue.prompts is dynamically connected (e.g. llama), make sure the prompt JSON contains
            // an explicit 'prompts' key. Otherwise backend validation may fallback to prompts_json (often empty)
            // and reject the prompt with "prompt list is empty".
            try {
                const nodeIdDyn = String(node?.id);
                const apiNodeDyn = prompt?.output?.[nodeIdDyn];
                if (apiNodeDyn) {
                    apiNodeDyn.inputs = apiNodeDyn.inputs || {};

                    const hasKey = Object.prototype.hasOwnProperty.call(apiNodeDyn.inputs, "prompts");
                    if (!hasKey && _isPromptsInputConnected(node)) {
                        apiNodeDyn.inputs.prompts = "";
                        console.info("[PromptQueue] injected empty upstream prompts placeholder", { runId, nodeId: nodeIdDyn });
                    }

                    // If upstream provided an empty array (or undefined), normalize to empty string to pass validation.
                    const v = apiNodeDyn.inputs.prompts;
                    if (v === undefined) {
                        apiNodeDyn.inputs.prompts = "";
                        console.warn("[PromptQueue] normalized undefined prompts to empty string", { runId, nodeId: nodeIdDyn });
                    } else if (Array.isArray(v) && v.length === 0) {
                        apiNodeDyn.inputs.prompts = "";
                        console.warn("[PromptQueue] normalized empty prompts array to empty string", { runId, nodeId: nodeIdDyn });
                    }

                    const pv = apiNodeDyn.inputs.prompts;
                    const mode = getPromptQueueMode(node);
                    console.info("[PromptQueue] prompt inputs snapshot", {
                        runId,
                        nodeId: nodeIdDyn,
                        index: apiNodeDyn.inputs.index,
                        mode: mode,
                        promptsType: Array.isArray(pv) ? "array" : typeof pv,
                        promptsLen: Array.isArray(pv) ? pv.length : typeof pv === "string" ? pv.length : null,
                    });
                }
            } catch (e) {
                console.error("[PromptQueue] inject prompts placeholder fail", {
                    runId,
                    nodeId: String(node?.id),
                    error: String(e?.message || e),
                    stack: e?.stack,
                });
            }

            // If upstream prompts is connected (e.g. llama), and user selected split mode in UI,
            // convert string prompts to list-of-lines directly inside prompt JSON so backend can output total>1.
            try {
                const nodeId0 = String(node?.id);
                const apiNode = prompt?.output?.[nodeId0];
                const curMode = getPromptQueueMode(node);
                const pRaw = apiNode?.inputs?.prompts;
                const isStr = typeof pRaw === "string";
                const isSingleStrArray = Array.isArray(pRaw) && pRaw.length === 1 && typeof pRaw[0] === "string";
                const rawText = isStr ? pRaw : isSingleStrArray ? pRaw[0] : null;
                const hasNewline = typeof rawText === "string" && normalizeNewlines(rawText).includes("\n");
                const hasEscapedNewline = typeof rawText === "string" && String(rawText).includes("\\n");

                if (curMode === "split") {
                    // If upstream already provided an array, flatten any multi-line elements into lines.
                    if (Array.isArray(pRaw) && !isSingleStrArray) {
                        const flattened = [];
                        const partsLens = [];
                        const itemSummaries = [];
                        let anySplit = false;
                        for (const it of pRaw) {
                            if (typeof it !== "string") {
                                itemSummaries.push({
                                    type: typeof it,
                                    len: null,
                                    hasNl: false,
                                    hasEscNl: false,
                                    head: String(it).slice(0, 80),
                                });
                                continue;
                            }

                            const itNorm = normalizeNewlines(it);
                            const hasNl = itNorm.includes("\n");
                            const hasEscNl = it.includes("\\n") || it.includes("\\r");
                            itemSummaries.push({
                                type: "string",
                                len: it.length,
                                hasNl,
                                hasEscNl,
                                head: it.slice(0, 80),
                            });

                            const parts = splitLinesNonEmpty(it);
                            partsLens.push(parts.length);
                            if (parts.length > 1) anySplit = true;
                            if (parts.length > 0) flattened.push(...parts);
                        }
                        console.info("[PromptQueue] split upstream prompts flatten debug", {
                            nodeId: nodeId0,
                            inLen: Array.isArray(pRaw) ? pRaw.length : null,
                            items: itemSummaries,
                            partsLens,
                            outLen: flattened.length,
                            anySplit,
                        });
                        try {
                            console.info(
                                "[PromptQueue] split upstream prompts flatten debug (json)",
                                JSON.stringify(
                                    {
                                        nodeId: nodeId0,
                                        inLen: Array.isArray(pRaw) ? pRaw.length : null,
                                        items: itemSummaries,
                                        partsLens,
                                        outLen: flattened.length,
                                        anySplit,
                                    },
                                    null,
                                    0
                                )
                            );
                        } catch {
                            // ignore
                        }

                        if (anySplit && flattened.length > 0 && apiNode?.inputs) {
                            apiNode.inputs.prompts = flattened;
                            node?._promptQueueUI?.redraw?.();
                            console.info("[PromptQueue] split upstream prompts flattened array", {
                                nodeId: nodeId0,
                                inLen: pRaw.length,
                                outLen: flattened.length,
                            });

                            try {
                                const prevCtx = _getRunCtx(nodeId0) || {};
                                _setRunCtx(nodeId0, {
                                    ...prevCtx,
                                    expectedTotal: flattened.filter((s) => typeof s === "string" && s.trim().length > 0).length,
                                });
                            } catch {
                                // ignore
                            }
                        }
                    }
                }

                if (curMode === "split" && typeof rawText === "string" && rawText.trim().length > 0) {
                    const t0 = performance?.now?.() ?? Date.now();
                    console.info("[PromptQueue] split upstream prompts start", {
                        nodeId: nodeId0,
                        chars: rawText.length,
                    });
                    const lines = splitLinesNonEmpty(rawText);
                    console.info("[PromptQueue] split upstream prompts debug", {
                        nodeId: nodeId0,
                        hasNewline,
                        hasEscapedNewline,
                        lines: lines.length,
                        head: String(rawText).slice(0, 120),
                    });
                    if (apiNode && apiNode.inputs) {
                        if (lines.length > 0) {
                            // Only convert to list when it actually becomes multiple items.
                            // Otherwise keep original string to avoid unexpected behavior.
                            apiNode.inputs.prompts = lines.length > 1 ? lines : String(rawText);

                            if (lines.length > 1) {
                                node?._promptQueueUI?.redraw?.();
                            }

                            try {
                                const prevCtx = _getRunCtx(nodeId0) || {};
                                _setRunCtx(nodeId0, {
                                    ...prevCtx,
                                    expectedTotal: lines.filter((s) => typeof s === "string" && s.trim().length > 0).length,
                                });
                            } catch {
                                // ignore
                            }
                        } else {
                            // Keep as empty string so backend validation can skip in dynamic-upstream cases.
                            apiNode.inputs.prompts = "";
                            console.warn("[PromptQueue] split upstream prompts empty after trim; keep as empty string", {
                                nodeId: nodeId0,
                            });

                            try {
                                const prevCtx = _getRunCtx(nodeId0) || {};
                                _setRunCtx(nodeId0, {
                                    ...prevCtx,
                                    expectedTotal: 0,
                                });
                            } catch {
                                // ignore
                            }
                        }
                    }
                    console.info("[PromptQueue] split upstream prompts ok", {
                        nodeId: nodeId0,
                        lines: lines.length,
                        ms: Math.round((performance?.now?.() ?? Date.now()) - t0),
                    });
                }
            } catch (e) {
                console.error("[PromptQueue] split upstream prompts fail", {
                    nodeId: String(node?.id),
                    error: String(e?.message || e),
                    stack: e?.stack,
                });
            }

            // If this queued prompt already contains an upstream 'prompts' value for PromptQueue,
            // it means the dynamic input is connected/resolved (e.g. llama). In that case we must
            // NOT expand using prompts_json (stale cache), otherwise it can enqueue an old large list.
            const nodeId = String(node?.id);
            const apiNode0 = prompt?.output?.[nodeId];
            const hasUpstreamPrompts = apiNode0 && apiNode0.inputs && Object.prototype.hasOwnProperty.call(apiNode0.inputs, "prompts");
            if (hasUpstreamPrompts) {
                const pv0 = apiNode0?.inputs?.prompts;
                const curModeUp = getPromptQueueMode(node);
                // If pv0 is a ComfyUI link tuple, we must NOT expand immediately.
                // Let the first run resolve upstream outputs (e.g. llama -> splitlines), then auto-expand.
                if (_isComfyLinkTuple(pv0)) {
                    _iai666PendingAutoExpandNodeIds.add(String(node.id));
                    console.info("[PromptQueue] upstream prompts is link tuple; skip immediate expansion", {
                        runId,
                        nodeId,
                        pv0,
                    });
                    return await cur.apply(api, arguments);
                }
                if (Array.isArray(pv0) && pv0.length > 1) {
                    const indices = [];
                    let nonEmptyCount = 0;
                    const pv0Summaries = [];
                    for (let i = 0; i < pv0.length; i++) {
                        const s = pv0[i];
                        const ss = s === null || s === undefined ? "" : String(s);
                        const isEmptyTrim = ss.trim().length === 0;
                        if (!isEmptyTrim) {
                            nonEmptyCount++;
                            indices.push(i);
                        }

                        const sNorm = normalizeNewlines(ss);
                        pv0Summaries.push({
                            i,
                            type: Array.isArray(s) ? "array" : typeof s,
                            len: typeof ss === "string" ? ss.length : null,
                            hasNl: sNorm.includes("\n"),
                            hasEscNl: ss.includes("\\n") || ss.includes("\\r"),
                            head: ss.slice(0, 80),
                            isEmptyTrim,
                        });
                    }

                    console.info("[PromptQueue] upstream prompts expansion check", {
                        nodeId,
                        mode: curModeUp,
                        pv0Len: pv0.length,
                        nonEmptyCount,
                        indicesLen: indices.length,
                        indicesHead: indices.slice(0, 10),
                        curIdxRaw: apiNode0?.inputs?.index,
                        pv0Summaries,
                    });
                    try {
                        console.info(
                            "[PromptQueue] upstream prompts expansion check (json)",
                            JSON.stringify(
                                {
                                    nodeId,
                                    mode: curModeUp,
                                    pv0Len: pv0.length,
                                    nonEmptyCount,
                                    indicesLen: indices.length,
                                    indicesHead: indices.slice(0, 10),
                                    curIdxRaw: apiNode0?.inputs?.index,
                                    pv0Summaries,
                                },
                                null,
                                0
                            )
                        );
                    } catch {
                        // ignore
                    }

                    if (indices.length > 1) {
                        const curIdx0 = coerceIndexToInt(apiNode0?.inputs?.index, indices[0]);
                        if (curIdx0 !== indices[0]) {
                            console.warn("[PromptQueue] upstream expansion skip due to curIdx mismatch", {
                                nodeId,
                                curIdx0,
                                expected: indices[0],
                            });
                            return await cur.apply(api, arguments);
                        }

                        _iai666ApiQueuePromptInHook = true;
                        const t0 = performance?.now?.() ?? Date.now();
                        console.info("[PromptQueue] global sequential(api, upstream) start", {
                            nodeId: node.id,
                            count: indices.length,
                        });
                        try {
                            let last;
                            for (const idx of indices) {
                                const p = deepClone(prompt);
                                const n = p?.output?.[String(node.id)];
                                if (!n) continue;
                                n.inputs = n.inputs || {};
                                n.inputs.index = idx;
                                last = await cur.call(api, arguments?.[0], p);
                            }
                            console.info("[PromptQueue] global sequential(api, upstream) done", {
                                nodeId: node.id,
                                count: indices.length,
                                ms: Math.round((performance?.now?.() ?? Date.now()) - t0),
                            });
                            return last;
                        } finally {
                            _iai666ApiQueuePromptInHook = false;
                        }
                    }
                }

                console.warn("[PromptQueue] skip api expansion: upstream prompts present in prompt JSON", {
                    nodeId,
                });
                return await cur.apply(api, arguments);
            }

            if (_isPromptsInputConnected(node)) return await cur.apply(api, arguments);

            const items = getPromptsFromWidget(node);
            const indices = [];
            for (let i = 0; i < items.length; i++) {
                const s = items[i];
                if (typeof s === "string" && s.trim().length > 0) indices.push(i);
            }
            if (indices.length <= 1) {
                return await cur.apply(api, arguments);
            }

            const apiNode = prompt?.output?.[String(node.id)];
            const curIdx = apiNode?.inputs?.index;
            if (typeof curIdx === "number" && curIdx !== indices[0]) {
                return await cur.apply(api, arguments);
            }

            _iai666ApiQueuePromptInHook = true;
            const t0 = performance?.now?.() ?? Date.now();
            console.info("[PromptQueue] global sequential(api) start", { nodeId: node.id, count: indices.length });
            try {
                let last;
                for (const idx of indices) {
                    const p = deepClone(prompt);
                    const n = p?.output?.[String(node.id)];
                    if (!n) continue;
                    n.inputs = n.inputs || {};
                    n.inputs.index = idx;
                    last = await cur.call(api, arguments?.[0], p);
                }
                console.info("[PromptQueue] global sequential(api) done", {
                    nodeId: node.id,
                    count: indices.length,
                    ms: Math.round((performance?.now?.() ?? Date.now()) - t0),
                });
                return last;
            } finally {
                _iai666ApiQueuePromptInHook = false;
            }
        }
    );

    _iai666HookSetter(app, "queuePrompt", (getCurrent) =>
        async function () {
            const cur = getCurrent();
            _iai666QueuePromptPrev = cur;
            if (_iai666QueuePromptInHook) return await cur.apply(app, arguments);

            _iai666QueuePromptInHook = true;
            try {
                _iai666InGlobalQueuePrompt = true;
                return await cur.apply(app, arguments);
            } finally {
                _iai666InGlobalQueuePrompt = false;
                _iai666QueuePromptInHook = false;
            }
        }
    );
}

try {
    _installExecutedEventHookOnce();
} catch {
    // ignore
}

function getPromptsJsonWidget(node) {
    return node?.widgets?.find((w) => w.name === "prompts_json");
}

function getWidgetByName(node, name) {
    return node?.widgets?.find((w) => w.name === name);
}

function getPromptQueueMode(node) {
    const fromProps = node?.properties?.iai666PromptQueueMode;
    if (typeof fromProps === "string" && fromProps) return fromProps;
    const fromRuntime = node?._iai666PromptQueueMode;
    if (typeof fromRuntime === "string" && fromRuntime) return fromRuntime;
    return "list";
}

function deepClone(obj) {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

function normalizeNewlines(s) {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Unicode line separators that render as newlines but are not "\n".
        .replace(/\u2028/g, "\n")
        .replace(/\u2029/g, "\n")
        .replace(/\u0085/g, "\n");
}

function _isComfyLinkTuple(v) {
    // In ComfyUI prompt JSON, connected inputs may appear as a tuple like ["14", 0] or [14, 0]
    // meaning: from nodeId 14, output slot 0. This is NOT a list of prompts.
    try {
        if (!Array.isArray(v) || v.length !== 2) return false;
        const a = v[0];
        const b = v[1];
        const aOk = typeof a === "number" || (typeof a === "string" && /^\d+$/.test(a));
        const bOk = typeof b === "number" && Number.isFinite(b);
        return aOk && bOk;
    } catch {
        return false;
    }
}

function splitLinesNonEmpty(text) {
    // Some LLM UIs/providers may return literal "\\n" sequences instead of real newlines.
    // Normalize both real newlines and escaped newlines.
    const t = normalizeNewlines(text)
        // Some upstreams may deliver HTML line breaks.
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n");
    return t
        .split("\n")
        .map((s) => String(s ?? "").trim())
        .filter((s) => s.length > 0);
}

function coerceIndexToInt(v, fallback = 0) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string") {
        const t = v.trim();
        if (t.length === 0) return fallback;
        const n = Number.parseInt(t, 10);
        if (Number.isFinite(n)) return n;
        return fallback;
    }
    return fallback;
}

function isFilesDragEvent(e) {
    const dt = e?.dataTransfer;
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    return Array.from(dt.types || []).includes("Files");
}

async function queueCurrent(node) {
    const prompt = await app.graphToPrompt();
    await _iai666QueuePromptWithHint(prompt, "");
}

function setPromptsJson(node, prompts) {
    const w = getPromptsJsonWidget(node);
    if (!w) {
        console.warn("[PromptQueue] setPromptsJson: prompts_json widget missing", { nodeId: node?.id });
        return;
    }
    const arr = Array.isArray(prompts) ? prompts : [];
    w.value = JSON.stringify(arr);
    w.callback?.(w.value);
    console.info("[PromptQueue] setPromptsJson ok", { nodeId: node?.id, count: arr.length });
}

function getPromptsFromWidget(node) {
    const w = getPromptsJsonWidget(node);
    const raw = w?.value;
    const items = safeJsonParse(raw || "[]", []);
    const arr = Array.isArray(items) ? items.map((x) => (x == null ? "" : String(x))) : [];
    return arr;
}

async function queueAllPromptsSequential(node) {
    const items = getPromptsFromWidget(node);
    const indices = [];
    for (let i = 0; i < items.length; i++) {
        const s = items[i];
        if (typeof s === "string" && s.trim().length > 0) indices.push(i);
    }
    if (indices.length === 0) {
        console.warn("[PromptQueue] empty prompt list; nothing to queue");
        return;
    }

    // Performance: build base prompt once, then clone+patch index. Avoid calling graphToPrompt per item.
    const basePrompt = await app.graphToPrompt();
    const nodeId = String(node.id);
    for (const idx of indices) {
        const prompt = deepClone(basePrompt);
        const apiNode = prompt?.output?.[nodeId] ?? prompt?.output?.[Number(nodeId)];
        if (!apiNode) {
            console.warn("[PromptQueue] queueAllPromptsSequential skipped: apiNode not found", {
                nodeId,
                idx,
                outputKeysSample: Object.keys(prompt?.output || {}).slice(0, 10),
            });
            continue;
        }
        apiNode.inputs = apiNode.inputs || {};
        apiNode.inputs.index = idx;
        const hint = typeof items?.[idx] === "string" ? String(items[idx]) : "";
        await _iai666QueuePromptWithHint(prompt, hint);
    }
}

function createPromptQueueUI(node) {
    const wPrompts = getPromptsJsonWidget(node);
    if (!wPrompts) return null;

    _installGlobalSequentialQueueHookOnce();

    wPrompts.type = "hidden";
    wPrompts.computeSize = () => [0, -4];

    const container = document.createElement("div");
    container.dataset.iai666Promptqueue = "1";
    container.style.cssText =
        "width:100%;padding:8px;background:var(--comfy-menu-bg);border:1px solid var(--border-color);border-radius:6px;margin:5px 0;pointer-events:auto;";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;";

    const mkBtn = (label) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText =
            "padding:8px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;font-size:13px;";
        return b;
    };

    const queueBtn = mkBtn("逐条入队");
    const queueOneBtn = mkBtn("入队当前");
    const clearBtn = mkBtn("清空");

    const globalWrap = document.createElement("label");
    globalWrap.style.cssText =
        "display:flex;align-items:center;gap:6px;padding:8px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;font-size:13px;user-select:none;";
    const globalChk = document.createElement("input");
    globalChk.type = "checkbox";
    const globalTxt = document.createElement("span");
    globalTxt.textContent = "全局执行=逐条入队";
    globalWrap.appendChild(globalChk);
    globalWrap.appendChild(globalTxt);

    const setGlobalEnabled = (enabled, { silent = false } = {}) => {
        globalChk.checked = !!enabled;
        if (silent) return;
        if (globalChk.checked) {
            // Enforce single-enabled node: enabling this node will disable others.
            const nodes = app?.graph?._nodes || [];
            for (const other of nodes) {
                if (other === node) continue;
                const chk = other?._promptQueueUI?.globalChk;
                if (chk?.checked) chk.checked = false;
            }
            _iai666GlobalSequentialNodeIds.clear();
            if (typeof node?.id === "number" && node.id >= 0) {
                _iai666GlobalSequentialNodeIds.add(String(node.id));
            }
        } else {
            if (typeof node?.id === "number" && node.id >= 0) {
                _iai666GlobalSequentialNodeIds.delete(String(node.id));
            }
        }
    };

    btnRow.appendChild(queueBtn);
    btnRow.appendChild(queueOneBtn);
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(globalWrap);

    const info = document.createElement("div");
    info.style.cssText = "font-size:12px;opacity:0.85;margin-bottom:6px;";

    const backendWrap = document.createElement("div");
    backendWrap.style.cssText = "font-size:12px;opacity:0.9;margin:6px 0 10px 0;border:1px solid var(--border-color);padding:8px;border-radius:6px;";
    backendWrap.style.display = "none";

    const backendHead = document.createElement("div");
    backendHead.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px;";

    const backendTitle = document.createElement("div");
    backendTitle.innerText = "后端队列(/queue)";

    const backendBtns = document.createElement("div");
    backendBtns.style.cssText = "display:flex;gap:6px;align-items:center;";

    const backendRefreshBtn = document.createElement("button");
    backendRefreshBtn.innerText = "刷新";

    const backendClearBtn = document.createElement("button");
    backendClearBtn.innerText = "清空后端队列";

    backendBtns.appendChild(backendRefreshBtn);
    backendBtns.appendChild(backendClearBtn);

    backendHead.appendChild(backendTitle);
    backendHead.appendChild(backendBtns);

    const backendStatus = document.createElement("div");
    backendStatus.style.cssText = "margin-bottom:6px;white-space:pre-wrap;word-break:break-word;";
    backendStatus.innerText = "running: ? | pending: ?";

    const backendTable = document.createElement("table");
    backendTable.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";

    backendWrap.appendChild(backendHead);
    backendWrap.appendChild(backendStatus);
    backendWrap.appendChild(backendTable);

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:8px;";

    const listWrap = document.createElement("div");
    listWrap.style.cssText =
        "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;height:260px;overflow:auto;background:var(--comfy-input-bg);padding:6px;border-radius:4px;border:1px solid var(--border-color);";

    const listBtnRow = document.createElement("div");
    listBtnRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    const addItemBtn = mkBtn("新增一条");
    const importWholeTxtBtn = mkBtn("导入整体txt(自动拆分)");
    const importSingleTxtBtn = mkBtn("导入单个txt");
    const importFolderBtn = mkBtn("导入文件夹");
    listBtnRow.appendChild(addItemBtn);
    listBtnRow.appendChild(importWholeTxtBtn);
    listBtnRow.appendChild(importSingleTxtBtn);
    listBtnRow.appendChild(importFolderBtn);

    const renderCards = (items, { readonly = false } = {}) => {
        listWrap.innerHTML = "";
        const frag = document.createDocumentFragment();
        items.forEach((text, idx) => {
            const card = document.createElement("div");
            card.style.cssText =
                "display:flex;flex-direction:column;gap:6px;padding:6px;background:var(--comfy-menu-bg);border:1px solid var(--border-color);border-radius:6px;";

            const head = document.createElement("div");
            head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";

            const title = document.createElement("div");
            title.textContent = `#${idx + 1}`;
            title.style.cssText = "font-size:12px;opacity:0.85;";

            const ta = document.createElement("textarea");
            ta.value = String(text ?? "");
            ta.placeholder = `提示词 #${idx + 1}（允许空行）`;
            ta.readOnly = !!readonly;
            ta.style.cssText =
                "width:100%;min-height:96px;padding:6px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;resize:vertical;";

            const del = mkBtn("删除");
            del.style.flex = "0 0 auto";
            del.style.padding = "6px 10px";
            del.style.display = readonly ? "none" : "";
            del.onclick = (e) => {
                e.preventDefault();
                const next = getPromptsFromWidget(node);
                next.splice(idx, 1);
                setPromptsJson(node, next);
                redraw();
            };

            if (!readonly) {
                ta.addEventListener("input", () => {
                    const next = getPromptsFromWidget(node);
                    next[idx] = ta.value;
                    setPromptsJson(node, next);
                    updateInfo();
                });
            }

            head.appendChild(title);
            head.appendChild(del);

            card.appendChild(head);
            card.appendChild(ta);
            frag.appendChild(card);
        });
        listWrap.appendChild(frag);
    };

    const updateInfo = () => {
        const items = getPromptsFromWidget(node);
        info.textContent = `共 ${items.length} 条提示词（可拖拽txt到此面板） v${IAI666_PROMPTQUEUE_UI_VER}`;
    };

    const redraw = () => {
        body.innerHTML = "";
        const items = getPromptsFromWidget(node);
        body.appendChild(listBtnRow);
        body.appendChild(listWrap);
        renderCards(items, { readonly: false });
        updateInfo();
        applyAutoLayout();
        app.graph.setDirtyCanvas(true);
    };

    async function refreshBackendQueue() {
        const t0 = performance?.now?.() ?? Date.now();
        console.info("[PromptQueue] backend queue refresh start", { nodeId: node?.id });
        try {
            const q = await _iai666FetchQueueInfo();
            const running = Array.isArray(q?.queue_running) ? q.queue_running : [];
            const pending = Array.isArray(q?.queue_pending) ? q.queue_pending : [];
            const costMs = Math.round((performance?.now?.() ?? Date.now()) - t0);
            console.info("[PromptQueue] backend queue refresh ok", {
                nodeId: node?.id,
                costMs,
                hasQ: !!q,
                keys: q && typeof q === "object" ? Object.keys(q).slice(0, 30) : null,
                running: running.length,
                pending: pending.length,
            });

            backendStatus.innerText = `running: ${running.length} | pending: ${pending.length}`;

            const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            const rows = [];
            rows.push(
                `<tr>` +
                `<th style="text-align:left;border-bottom:1px solid var(--border-color);padding:4px;">状态</th>` +
                `<th style="text-align:left;border-bottom:1px solid var(--border-color);padding:4px;">prompt_id</th>` +
                `<th style="text-align:left;border-bottom:1px solid var(--border-color);padding:4px;">内容(已知)</th>` +
                `</tr>`
            );

            const addRow = (status, item) => {
                const pid = item?.[1] != null ? String(item[1]) : "";
                const txt = _iai666SummarizePromptText(pid);
                rows.push(
                    `<tr>` +
                    `<td style="vertical-align:top;border-bottom:1px solid var(--border-color);padding:4px;white-space:nowrap;">${esc(status)}</td>` +
                    `<td style="vertical-align:top;border-bottom:1px solid var(--border-color);padding:4px;white-space:nowrap;">${esc(pid)}</td>` +
                    `<td style="vertical-align:top;border-bottom:1px solid var(--border-color);padding:4px;white-space:pre-wrap;word-break:break-word;max-width:360px;">${esc(txt)}</td>` +
                    `</tr>`
                );
            };

            for (const it of running) addRow("running", it);
            for (const it of pending) addRow("pending", it);
            backendTable.innerHTML = rows.join("");
        } catch (e) {
            const costMs = Math.round((performance?.now?.() ?? Date.now()) - t0);
            console.error("[PromptQueue] backend queue refresh fail", {
                nodeId: node?.id,
                costMs,
                err: String(e?.message || e),
            });
            backendStatus.innerText = `running: ? | pending: ? (refresh failed: ${String(e?.message || e)})`;
        }
    }

    const applyAutoLayout = () => {
        const rect = container.getBoundingClientRect?.();
        const h = rect?.height;
        if (!h || typeof h !== "number") return;

        // Estimate header space (buttons + info + paddings). Keep a minimum so UI doesn't collapse.
        const reserved = 150;
        const avail = Math.max(160, Math.floor(h - reserved));

        // listWrap is used for card editor and/or preview.
        listWrap.style.height = `${Math.min(520, avail)}px`;
    };

    const readTxtFile = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("read file error"));
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.readAsText(file);
        });

    const pickTxtFiles = ({ multiple = false, directory = false } = {}) =>
        new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".txt,text/plain";
            input.multiple = !!multiple;
            if (directory) {
                input.webkitdirectory = true;
                input.directory = true;
                input.multiple = true;
            }
            input.onchange = () => {
                const files = Array.from(input.files || []);
                resolve(files);
            };
            input.click();
        });

    const importWholeTxtSplit = async () => {
        const fs = await pickTxtFiles({ multiple: false, directory: false });
        const f = fs?.[0];
        if (!f) return;
        const text = await readTxtFile(f);
        const lines = splitLinesNonEmpty(text);
        setPromptsJson(node, lines);
        redraw();
        console.info("[PromptQueue] import whole txt split lines", { nodeId: node?.id, name: f?.name, count: lines.length });
    };

    const importSingleTxtAsOne = async () => {
        const fs = await pickTxtFiles({ multiple: false, directory: false });
        const f = fs?.[0];
        if (!f) return;
        const text = await readTxtFile(f);
        const t = normalizeNewlines(text).trimEnd();
        if (t.trim().length === 0) return;
        const cur = getPromptsFromWidget(node);
        cur.push(t);
        setPromptsJson(node, cur);
        redraw();
        console.info("[PromptQueue] import single txt append", { nodeId: node?.id, name: f?.name, len: t.length, total: cur.length });
    };

    const importFolderTxts = async () => {
        let fs = await pickTxtFiles({ multiple: true, directory: true });
        fs = Array.from(fs || []).filter((f) => (f?.name || "").toLowerCase().endsWith(".txt"));
        if (!fs || fs.length === 0) return;
        fs.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
        const prompts = [];
        for (const f of fs) {
            const text = await readTxtFile(f);
            const t = normalizeNewlines(text).trimEnd();
            if (t.trim().length === 0) continue;
            prompts.push(t);
        }
        setPromptsJson(node, prompts);
        redraw();
        console.info("[PromptQueue] import folder txt prompts", { nodeId: node?.id, count: prompts.length, files: fs.length });
    };

    const handleDropTxtFiles = async (files) => {
        if (!files || files.length === 0) return;
        let fs = Array.from(files || []);
        fs = fs.filter((f) => (f?.name || "").toLowerCase().endsWith(".txt"));
        if (fs.length === 0) return;

        fs.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));

        if (fs.length === 1) {
            const text = await readTxtFile(fs[0]);
            const lines = splitLinesNonEmpty(text);
            setPromptsJson(node, lines);
            redraw();
            console.info("[PromptQueue] drop imported whole txt split lines", { count: lines.length, name: fs[0].name });
            return;
        }

        const prompts = [];
        for (const f of fs) {
            const text = await readTxtFile(f);
            const t = normalizeNewlines(text).trimEnd();
            if (t.trim().length === 0) continue;
            prompts.push(t);
        }
        setPromptsJson(node, prompts);
        redraw();
        console.info("[PromptQueue] drop imported folder txt prompts", { count: prompts.length });
    };

    globalChk.addEventListener("change", () => setGlobalEnabled(globalChk.checked));

    addItemBtn.onclick = (e) => {
        e.preventDefault();
        const next = getPromptsFromWidget(node);
        next.push("");
        setPromptsJson(node, next);
        redraw();
    };

    importWholeTxtBtn.onclick = async (e) => {
        e.preventDefault();
        try {
            await importWholeTxtSplit();
        } catch (err) {
            console.error("[PromptQueue] import whole txt failed", { nodeId: node?.id, err: String(err?.message || err) });
        }
    };

    importSingleTxtBtn.onclick = async (e) => {
        e.preventDefault();
        try {
            await importSingleTxtAsOne();
        } catch (err) {
            console.error("[PromptQueue] import single txt failed", { nodeId: node?.id, err: String(err?.message || err) });
        }
    };

    importFolderBtn.onclick = async (e) => {
        e.preventDefault();
        try {
            await importFolderTxts();
        } catch (err) {
            console.error("[PromptQueue] import folder failed", { nodeId: node?.id, err: String(err?.message || err) });
        }
    };

    clearBtn.onclick = (e) => {
        e.preventDefault();
        _resetNodeAutoExpandState(node, "ui_clear_local");
        setPromptsJson(node, []);
        redraw();
    };

    backendRefreshBtn.onclick = async (e) => {
        e.preventDefault();
        await refreshBackendQueue();
    };

    backendClearBtn.onclick = async (e) => {
        e.preventDefault();
        _resetNodeAutoExpandState(node, "ui_clear_backend");
        const ok = await _iai666ClearBackendQueue();
        console.info("[PromptQueue] backend queue cleared", { ok });
        await refreshBackendQueue();
    };

    queueBtn.onclick = async (e) => {
        e.preventDefault();
        console.info("[PromptQueue] queue all sequential", { nodeId: node.id });
        await queueAllPromptsSequential(node);
    };

    queueOneBtn.onclick = async (e) => {
        e.preventDefault();
        console.info("[PromptQueue] queue current", { nodeId: node.id });
        await queueCurrent(node);
    };

    container.appendChild(btnRow);
    container.appendChild(info);
    // backendWrap hidden by default
    container.appendChild(backendWrap);
    container.appendChild(body);

    container.addEventListener("dragover", (e) => {
        if (!isFilesDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        container.style.border = "2px dashed #4a6";
    });
    container.addEventListener("dragleave", (e) => {
        if (!isFilesDragEvent(e)) return;
        container.style.border = "1px solid var(--border-color)";
    });
    container.addEventListener("drop", async (e) => {
        if (!isFilesDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        container.style.border = "1px solid var(--border-color)";
        const files = Array.from(e.dataTransfer?.files || []);
        await handleDropTxtFiles(files);
    });

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => applyAutoLayout()) : null;
    ro?.observe?.(container);

    // Default behavior (Option B): enable global sequential queue by default.
    setGlobalEnabled(true);
    redraw();
    // backend queue UI disabled

    return {
        container,
        redraw,
        globalChk,
        cleanup: () => {
            try {
                ro?.disconnect?.();
            } catch {
                // ignore
            }
        },
    };
}

app.registerExtension({
    name: "IAI666.PromptQueue.Extension",
    customWidgets: {},
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PromptQueue") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            const ui = createPromptQueueUI(this);
            if (ui) {
                this._promptQueueUI = ui;
                this.addDOMWidget("prompt_queue", "customwidget", ui.container);
                this.setSize([560, 420]);
            }

            return r;
        };

        // Strong hook: make sure onExecuted stays wrapped even if other extensions overwrite it later.
        if (!nodeType.prototype.__iai666HookedOnExecuted) {
            nodeType.prototype.__iai666HookedOnExecuted = true;
            console.info("[PromptQueue] installing onExecuted hook via setter");
            _iai666HookSetter(nodeType.prototype, "onExecuted", (getCurrent) =>
                function (output) {
                    const cur = getCurrent();
                    cur?.apply(this, arguments);
                    this._promptQueueUI?.redraw?.();

                    try {
                        const node = this;
                        const nodeId = String(node?.id);
                        const ctx = _getRunCtx(nodeId);
                        console.info("[PromptQueue] onExecuted called", {
                            runId: ctx?.runId || null,
                            nodeId: node?.id,
                            hasPending: _iai666PendingAutoExpandNodeIds.has(nodeId),
                        });
                        if (!_iai666PendingAutoExpandNodeIds.has(nodeId)) return;

                        const out = output?.output ?? output;

                        let idx;
                        let total;
                        if (Array.isArray(out)) {
                            idx = Number(out?.[1]);
                            total = Number(out?.[2]);
                        } else {
                            const carrier = out?.outputs ?? out;
                            const idxRaw = carrier?.index;
                            const totalRaw = carrier?.total;
                            idx = Array.isArray(idxRaw) ? Number(idxRaw?.[0]) : Number(idxRaw);
                            total = Array.isArray(totalRaw) ? Number(totalRaw?.[0]) : Number(totalRaw);
                        }

                        if (!Number.isFinite(idx) || !Number.isFinite(total)) {
                            console.warn("[PromptQueue] onExecuted pending but cannot parse idx/total", {
                                runId: ctx?.runId || null,
                                nodeId: node.id,
                                outputType: typeof output,
                                outIsArray: Array.isArray(out),
                                outType: typeof out,
                                outKeys: out && typeof out === "object" && !Array.isArray(out) ? Object.keys(out).slice(0, 30) : null,
                                outSample: out,
                            });
                            return;
                        }

                        console.info("[PromptQueue] onExecuted pending hit", {
                            runId: ctx?.runId || null,
                            nodeId: node.id,
                            idx,
                            total,
                        });
                        if (idx !== 0) return;
                        if (total <= 1) return;

                        _autoEnqueueRemainingAfterFirstRun(node, total);
                    } catch {
                        // ignore
                    }
                }
            );
        }

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try {
                _iai666GlobalSequentialNodeIds.delete(String(this?.id));
                _iai666PendingAutoExpandNodeIds.delete(String(this?.id));
                _clearRunCtx(String(this?.id));
                this._promptQueueUI?.cleanup?.();
            } finally {
                return origOnRemoved?.apply(this, arguments);
            }
        };
    },
});
