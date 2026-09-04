import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

function getImageListWidget(node) {
    return node?.widgets?.find((w) => w.name === "image_list");
}

function clampInt(v, min, max) {
    v = Math.floor(Number(v));
    if (Number.isNaN(v)) v = min;
    if (v < min) v = min;
    if (v > max) v = max;
    return v;
}

function buildVNCCSPrompt(data) {
    const azimuth = clampInt(data?.azimuth ?? 0, 0, 360) % 360;
    const elevation = clampInt(data?.elevation ?? 0, -30, 60);
    const distance = data?.distance ?? "medium shot";
    const include_trigger = data?.include_trigger !== false;

    const azimuthMap = {
        0: "front view",
        45: "front-right quarter view",
        90: "right side view",
        135: "back-right quarter view",
        180: "back view",
        225: "back-left quarter view",
        270: "left side view",
        315: "front-left quarter view",
    };

    const closestAzimuth = azimuth > 337.5 ? 0 : Object.keys(azimuthMap).map((k) => Number(k)).reduce((best, k) => {
        return Math.abs(k - azimuth) < Math.abs(best - azimuth) ? k : best;
    }, 0);

    const elevationMap = {
        "-30": "low-angle shot",
        "0": "eye-level shot",
        "30": "elevated shot",
        "60": "high-angle shot",
    };

    const closestElevation = Object.keys(elevationMap).map((k) => Number(k)).reduce((best, k) => {
        return Math.abs(k - elevation) < Math.abs(best - elevation) ? k : best;
    }, 0);

    const parts = [];
    if (include_trigger) parts.push("<sks>");
    parts.push(azimuthMap[closestAzimuth]);
    parts.push(elevationMap[String(closestElevation)]);
    parts.push(distance);
    return parts.join(" ");
}

function createVNCCSVisualUI(node) {
    const w = getCameraDataWidget(node);
    if (!w) return null;

    w.type = "hidden";
    w.computeSize = () => [0, -4];

    const container = document.createElement("div");
    container.style.cssText =
        "width:100%;padding:8px;background:var(--comfy-menu-bg);border:1px solid var(--border-color);border-radius:6px;margin:5px 0;pointer-events:auto;";

    const row = document.createElement("div");
    row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";

    const mkField = (labelText) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
        const label = document.createElement("div");
        label.textContent = labelText;
        label.style.cssText = "font-size:12px;opacity:0.9;";
        wrap.appendChild(label);
        return { wrap };
    };

    const azF = mkField("水平角度(azimuth)");
    const elF = mkField("垂直角度(elevation)");
    const distF = mkField("远近(distance)");
    const trigF = mkField("触发词");

    const az = document.createElement("input");
    az.type = "range";
    az.min = "0";
    az.max = "360";
    az.step = "45";

    const el = document.createElement("input");
    el.type = "range";
    el.min = "-30";
    el.max = "60";
    el.step = "30";

    const dist = document.createElement("select");
    for (const v of ["close-up", "medium shot", "wide shot"]) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        dist.appendChild(opt);
    }

    const trig = document.createElement("input");
    trig.type = "checkbox";

    const azVal = document.createElement("div");
    azVal.style.cssText = "font-size:12px;opacity:0.8;";
    const elVal = document.createElement("div");
    elVal.style.cssText = "font-size:12px;opacity:0.8;";

    const promptOut = document.createElement("input");
    promptOut.type = "text";
    promptOut.readOnly = true;
    promptOut.style.cssText =
        "width:100%;padding:8px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;";

    azF.wrap.appendChild(az);
    azF.wrap.appendChild(azVal);
    elF.wrap.appendChild(el);
    elF.wrap.appendChild(elVal);
    distF.wrap.appendChild(dist);
    trigF.wrap.appendChild(trig);

    row.appendChild(azF.wrap);
    row.appendChild(elF.wrap);
    row.appendChild(distF.wrap);
    row.appendChild(trigF.wrap);

    const write = () => {
        const data = {
            azimuth: clampInt(az.value, 0, 360),
            elevation: clampInt(el.value, -30, 60),
            distance: dist.value,
            include_trigger: !!trig.checked,
        };
        w.value = JSON.stringify(data);
        w.callback?.(w.value);
        azVal.textContent = String(data.azimuth);
        elVal.textContent = String(data.elevation);
        promptOut.value = buildVNCCSPrompt(data);
    };

    const read = () => {
        let data;
        try {
            data = JSON.parse(w.value || "{}");
        } catch {
            data = {};
        }
        az.value = String(clampInt(data?.azimuth ?? 0, 0, 360));
        el.value = String(clampInt(data?.elevation ?? 0, -30, 60));
        dist.value = data?.distance ?? "medium shot";
        trig.checked = data?.include_trigger !== false;
        write();
    };

    az.addEventListener("input", write);
    el.addEventListener("input", write);
    dist.addEventListener("change", write);
    trig.addEventListener("change", write);

    container.appendChild(row);
    container.appendChild(promptOut);

    return { container, read };
}

function parseImageList(text) {
    return (text || "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => !!s);
}

function setImageList(node, names) {
    const w = getImageListWidget(node);
    if (!w) return;
    w.value = (names || []).join("\n");
    w.callback?.(w.value);
}

function getImageMoveTarget(length, fromIndex, insertIndex) {
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= length) return fromIndex;
    let target = Math.max(0, Math.min(Number(insertIndex) || 0, length));
    if (fromIndex < target) target -= 1;
    return Math.max(0, Math.min(target, length - 1));
}

function moveImage(names, fromIndex, insertIndex) {
    const next = Array.from(names || []);
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= next.length) return next;

    const target = getImageMoveTarget(next.length, fromIndex, insertIndex);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(target, 0, moved);
    return next;
}

function getIndexAfterImageMove(index, fromIndex, targetIndex) {
    if (!Number.isInteger(index)) return index;
    if (index === fromIndex) return targetIndex;
    if (fromIndex < index && index <= targetIndex) return index - 1;
    if (targetIndex <= index && index < fromIndex) return index + 1;
    return index;
}

function getMaxImagesValue(node) {
    const w = node?.widgets?.find((x) => x.name === "max_images");
    const v = w?.value;
    return typeof v === "number" ? v : 0;
}

function deepClone(obj) {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

function getWidgetByName(node, name) {
    return node?.widgets?.find((w) => w.name === name);
}

function getCameraDataWidget(node) {
    return getWidgetByName(node, "camera_data");
}

async function queueCurrent(node) {
    const prompt = await app.graphToPrompt();
    await api.queuePrompt(-1, prompt);
}

async function queueAllSequential(node) {
    const names0 = parseImageList(getImageListWidget(node)?.value);
    if (!names0 || names0.length === 0) return;

    const maxImages = getMaxImagesValue(node);
    const names = maxImages && maxImages > 0 ? names0.slice(0, maxImages) : names0;
    if (names.length === 0) return;

    const wMode = getWidgetByName(node, "mode");
    const wIndex = getWidgetByName(node, "index");
    if (!wMode || !wIndex) {
        // Fallback: modify prompt JSON directly.
        const basePrompt = await app.graphToPrompt();
        const nodeId = String(node.id);
        for (let i = 0; i < names.length; i++) {
            const prompt = deepClone(basePrompt);
            const apiNode = prompt.output?.[nodeId];
            if (!apiNode) continue;
            apiNode.inputs = apiNode.inputs || {};
            apiNode.inputs.mode = "single";
            apiNode.inputs.index = i;
            await api.queuePrompt(-1, prompt);
        }
        return;
    }

    const prevMode = wMode.value;
    const prevIndex = wIndex.value;
    try {
        wMode.value = "single";
        wMode.callback?.(wMode.value);
        for (let i = 0; i < names.length; i++) {
            wIndex.value = i;
            wIndex.callback?.(wIndex.value);
            await queueCurrent(node);
        }
    } finally {
        wMode.value = prevMode;
        wMode.callback?.(wMode.value);
        wIndex.value = prevIndex;
        wIndex.callback?.(wIndex.value);
    }
}

function getViewUrl(filename) {
    const previewParam = app.getPreviewFormatParam?.() || "";
    const randParam = app.getRandParam?.() || "";
    return api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input${previewParam}${randParam}`);
}

function isFilesDragEvent(e) {
    const dt = e?.dataTransfer;
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    // Some browsers only set types during dragover
    return Array.from(dt.types || []).includes("Files");
}

const _batchLoadImagesDomUIs = new Set();

function _isPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function _getUIUnderPointer(e) {
    const x = e?.clientX;
    const y = e?.clientY;
    if (typeof x !== "number" || typeof y !== "number") return null;

    for (const entry of _batchLoadImagesDomUIs) {
        const rect = entry?.container?.getBoundingClientRect?.();
        if (!rect) continue;
        if (_isPointInRect(x, y, rect)) return entry;
    }
    return null;
}

function _setDraggingUI(activeEntry) {
    for (const entry of _batchLoadImagesDomUIs) {
        entry?.setDragging?.(entry === activeEntry);
    }
}

// Prevent the browser from navigating away when dropping files.
// We only do this for file drags.
let _globalDragDropInstalled = false;
function ensureGlobalDragDropPrevention() {
    if (_globalDragDropInstalled) return;
    _globalDragDropInstalled = true;

    window.addEventListener(
        "dragover",
        (e) => {
            if (!isFilesDragEvent(e)) return;
            e.preventDefault();
            _setDraggingUI(_getUIUnderPointer(e));
        },
        { capture: true }
    );

    window.addEventListener(
        "drop",
        async (e) => {
            if (!isFilesDragEvent(e)) return;
            e.preventDefault();

            const hit = _getUIUnderPointer(e);
            _setDraggingUI(null);
            if (!hit) return;

            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length === 0) return;
            await uploadFilesSequential(hit.node, files, { replace: false });
        },
        { capture: true }
    );

    window.addEventListener(
        "dragleave",
        (e) => {
            if (!isFilesDragEvent(e)) return;
            _setDraggingUI(null);
        },
        { capture: true }
    );
}

async function uploadOneImage(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");

    const resp = await api.fetchApi("/upload/image", {
        method: "POST",
        body,
    });

    if (!resp.ok) {
        throw new Error(await resp.text());
    }

    const json = await resp.json();
    return json?.name;
}

async function uploadFilesSequential(node, files, { replace = false } = {}) {
    const w = getImageListWidget(node);
    if (!w) return [];

    const existing = replace ? [] : parseImageList(w.value);
    const uploaded = [];

    for (const file of files) {
        if (!file) continue;
        // skip non-images
        if (file?.type && !file.type.startsWith("image/")) continue;
        const name = await uploadOneImage(file);
        if (name) uploaded.push(name);
    }

    const merged = existing.concat(uploaded);
    setImageList(node, merged);
    return uploaded;
}

function openMultiSelect(node, { replace = false } = {}) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e) => {
        try {
            const files = Array.from(e.target.files || []);
            await uploadFilesSequential(node, files, { replace });
        } finally {
            document.body.removeChild(input);
        }
    };

    input.click();
}

function openFolderSelect(node, { replace = false } = {}) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.multiple = true;
    input.webkitdirectory = true;
    input.directory = true;
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e) => {
        try {
            let files = Array.from(e.target.files || []);
            const allowExt = new Set([".png", ".jpg", ".jpeg"]);
            files = files.filter((f) => {
                const name = (f?.name || "").toLowerCase();
                for (const ext of allowExt) {
                    if (name.endsWith(ext)) return true;
                }
                return false;
            });
            // keep stable ordering
            files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
            await uploadFilesSequential(node, files, { replace });
        } finally {
            document.body.removeChild(input);
        }
    };

    input.click();
}

function createBrowserUI(node) {
    const imageReorderMime = "application/x-iai666-image-index";
    let draggedCell = null;
    let dragFromIndex = null;
    let dropIndicator = null;

    const container = document.createElement("div");
    container.style.cssText =
        "width:100%;height:100%;min-height:220px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:8px;background:var(--comfy-menu-bg);border:1px solid var(--border-color);border-radius:6px;margin:5px 0;pointer-events:auto;";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex:0 0 auto;flex-wrap:wrap;gap:6px;margin-bottom:8px;";

    const mkBtn = (label) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText =
            "flex:1;padding:8px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;font-size:13px;";
        return b;
    };

    const uploadBtn = mkBtn("上传");
    const folderBtn = mkBtn("选择文件夹");
    const pasteBtn = mkBtn("粘贴");
    const queueOneBtn = mkBtn("单张入队");
    const queueBtn = mkBtn("逐张入队");

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "清空";
    clearBtn.style.cssText =
        "padding:8px;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;font-size:13px;";

    btnRow.appendChild(uploadBtn);
    btnRow.appendChild(folderBtn);
    btnRow.appendChild(pasteBtn);
    btnRow.appendChild(queueOneBtn);
    btnRow.appendChild(queueBtn);
    btnRow.appendChild(clearBtn);

    const info = document.createElement("div");
    info.style.cssText = "flex:0 0 auto;font-size:12px;opacity:0.85;margin-bottom:6px;";

    const grid = document.createElement("div");
    grid.style.cssText =
        "display:grid;flex:1 1 auto;min-height:0;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));grid-auto-rows:minmax(110px,1fr);align-content:stretch;gap:6px;overflow-y:auto;background:var(--comfy-input-bg);padding:6px;border-radius:4px;";

    const updateInfo = () => {
        const names = parseImageList(getImageListWidget(node)?.value);
        info.textContent = `已选择 ${names.length} 张（拖拽缩略图可排序）`;
    };

    const updateSelectedCell = () => {
        const selectedIndex = Number(getWidgetByName(node, "index")?.value);
        for (const cell of grid.children) {
            const isSelected = Number(cell.dataset.imageIndex) === selectedIndex;
            cell.style.outline = isSelected ? "2px solid #4caf7a" : "";
            cell.style.outlineOffset = isSelected ? "-2px" : "";
            cell.setAttribute("aria-selected", String(isSelected));
        }
    };

    const clearDropIndicator = () => {
        if (dropIndicator?.cell) dropIndicator.cell.style.boxShadow = "";
        dropIndicator = null;
        grid.style.outline = "";
    };

    const showDropIndicator = (cell, side) => {
        if (dropIndicator?.cell === cell && dropIndicator?.side === side) return;
        clearDropIndicator();
        cell.style.boxShadow = side === "after" ? "inset -4px 0 #4caf7a" : "inset 4px 0 #4caf7a";
        dropIndicator = { cell, side };
    };

    const finishReorderDrag = () => {
        clearDropIndicator();
        if (draggedCell) draggedCell.style.opacity = "";
        draggedCell = null;
        dragFromIndex = null;
    };

    const commitReorder = (fromIndex, insertIndex) => {
        const names = parseImageList(getImageListWidget(node)?.value);
        const next = moveImage(names, fromIndex, insertIndex);
        const changed = next.some((name, idx) => name !== names[idx]);
        finishReorderDrag();
        if (!changed) return;

        const indexWidget = getWidgetByName(node, "index");
        if (indexWidget) {
            const targetIndex = getImageMoveTarget(names.length, fromIndex, insertIndex);
            const selectedIndex = Number(indexWidget.value);
            indexWidget.value = getIndexAfterImageMove(selectedIndex, fromIndex, targetIndex);
            indexWidget.callback?.(indexWidget.value);
        }
        setImageList(node, next);
    };

    const redraw = () => {
        const names = parseImageList(getImageListWidget(node)?.value);
        grid.innerHTML = "";

        const frag = document.createDocumentFragment();
        names.forEach((name, idx) => {
            const cell = document.createElement("div");
            cell.style.cssText =
                "display:flex;min-width:0;min-height:0;flex-direction:column;gap:3px;cursor:grab;user-select:none;transition:opacity .12s ease,box-shadow .12s ease;";
            cell.draggable = true;
            cell.dataset.imageIndex = String(idx);
            cell.title = `拖拽调整顺序：${name}`;
            cell.setAttribute("role", "option");

            cell.addEventListener("click", (e) => {
                if (e.target?.closest?.("button")) return;
                const indexWidget = getWidgetByName(node, "index");
                if (!indexWidget) return;
                indexWidget.value = idx;
                indexWidget.callback?.(idx);
                updateSelectedCell();
                app.graph.setDirtyCanvas(true);
            });

            cell.addEventListener("dragstart", (e) => {
                if (e.target?.closest?.("button")) {
                    e.preventDefault();
                    return;
                }
                dragFromIndex = idx;
                draggedCell = cell;
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(imageReorderMime, String(idx));
                    e.dataTransfer.setData("text/plain", name);
                }
                requestAnimationFrame(() => {
                    if (draggedCell === cell) cell.style.opacity = "0.45";
                });
            });

            cell.addEventListener("dragover", (e) => {
                if (dragFromIndex === null || isFilesDragEvent(e)) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                const rect = cell.getBoundingClientRect();
                const side = e.clientX >= rect.left + rect.width / 2 ? "after" : "before";
                showDropIndicator(cell, side);
            });

            cell.addEventListener("drop", (e) => {
                if (dragFromIndex === null || isFilesDragEvent(e)) return;
                e.preventDefault();
                e.stopPropagation();
                const encodedIndex = e.dataTransfer?.getData(imageReorderMime);
                const fromIndex = encodedIndex === "" ? dragFromIndex : Number(encodedIndex);
                const rect = cell.getBoundingClientRect();
                const insertAfter = e.clientX >= rect.left + rect.width / 2;
                commitReorder(fromIndex, idx + (insertAfter ? 1 : 0));
            });

            cell.addEventListener("dragend", finishReorderDrag);

            const thumb = document.createElement("div");
            thumb.style.cssText =
                "position:relative;flex:1 1 auto;min-height:72px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color);background:#000;";

            const img = document.createElement("img");
            img.src = getViewUrl(name);
            img.draggable = false;
            img.loading = "lazy";
            img.decoding = "async";
            img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;";

            const del = document.createElement("button");
            del.textContent = "×";
            del.title = "删除";
            del.draggable = false;
            del.style.cssText =
                "position:absolute;top:2px;right:2px;width:20px;height:20px;background:rgba(255,0,0,0.75);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:16px;line-height:1;";
            del.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const next = names.slice(0, idx).concat(names.slice(idx + 1));
                const indexWidget = getWidgetByName(node, "index");
                if (indexWidget) {
                    const selectedIndex = Number(indexWidget.value);
                    const nextIndex = selectedIndex > idx ? selectedIndex - 1 : Math.min(selectedIndex, next.length - 1);
                    indexWidget.value = Math.max(0, nextIndex);
                    indexWidget.callback?.(indexWidget.value);
                }
                setImageList(node, next);
            };

            const label = document.createElement("div");
            label.textContent = name;
            label.title = name;
            label.style.cssText =
                "font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9;";

            thumb.appendChild(img);
            thumb.appendChild(del);
            cell.appendChild(thumb);
            cell.appendChild(label);
            frag.appendChild(cell);
        });

        grid.appendChild(frag);
        updateSelectedCell();
        updateInfo();
        app.graph.setDirtyCanvas(true);
    };

    const isAfterLastCard = (e) => {
        const lastCell = grid.lastElementChild;
        if (!lastCell) return false;
        const rect = lastCell.getBoundingClientRect();
        return e.clientY > rect.bottom || (e.clientY >= rect.top && e.clientX > rect.right);
    };

    // Dropping in the free area after the last card moves the image to the end.
    grid.addEventListener("dragover", (e) => {
        if (dragFromIndex === null || isFilesDragEvent(e) || e.target !== grid) return;
        if (!isAfterLastCard(e)) {
            clearDropIndicator();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearDropIndicator();
        grid.style.outline = "2px dashed #4caf7a";
    });

    grid.addEventListener("drop", (e) => {
        if (dragFromIndex === null || isFilesDragEvent(e) || e.target !== grid || !isAfterLastCard(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const encodedIndex = e.dataTransfer?.getData(imageReorderMime);
        const fromIndex = encodedIndex === "" ? dragFromIndex : Number(encodedIndex);
        const names = parseImageList(getImageListWidget(node)?.value);
        commitReorder(fromIndex, names.length);
    });

    const handleDropFiles = async (files, { replace = false } = {}) => {
        if (!files || files.length === 0) return;
        await uploadFilesSequential(node, files, { replace });
    };

    // Most reliable: handle drop on our DOM panel.
    container.addEventListener("dragover", (e) => {
        if (!isFilesDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
    });

    container.addEventListener("drop", async (e) => {
        if (!isFilesDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files || []);
        await handleDropFiles(files, { replace: false });
    });

    // 支持 Ctrl+V 粘贴图片（需要先点击节点获得焦点）
    container.addEventListener("paste", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const items = Array.from(e.clipboardData?.items || []);
        const imageFiles = [];
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    const ext = file.type.split("/")[1] || "png";
                    const timestamp = Date.now();
                    const newFile = new File([file], `paste_${timestamp}.${ext}`, { type: file.type });
                    imageFiles.push(newFile);
                }
            }
        }
        if (imageFiles.length > 0) {
            await uploadFilesSequential(node, imageFiles, { replace: false });
        }
    }, true);

    const setDragging = (on) => {
        container.style.border = on ? "2px dashed #4a6" : "1px solid var(--border-color)";
    };

    uploadBtn.onclick = async () => {
        openMultiSelect(node, { replace: false });
    };

    // 粘贴图片功能
    pasteBtn.onclick = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            const imageFiles = [];
            for (const item of clipboardItems) {
                for (const type of item.types) {
                    if (type.startsWith("image/")) {
                        const blob = await item.getType(type);
                        const ext = type.split("/")[1] || "png";
                        const timestamp = Date.now();
                        const file = new File([blob], `paste_${timestamp}.${ext}`, { type });
                        imageFiles.push(file);
                    }
                }
            }
            if (imageFiles.length > 0) {
                await uploadFilesSequential(node, imageFiles, { replace: false });
            } else {
                alert("剪贴板中没有图片，请先复制图片");
            }
        } catch (err) {
            alert("无法读取剪贴板，请确保已复制图片并授予剪贴板权限");
        }
    };

    folderBtn.onclick = async () => {
        openFolderSelect(node, { replace: false });
    };
    queueBtn.onclick = async () => {
        await queueAllSequential(node);
    };
    queueOneBtn.onclick = async () => {
        const wMode = getWidgetByName(node, "mode");
        if (wMode) {
            wMode.value = "single";
            wMode.callback?.(wMode.value);
        }
        await queueCurrent(node);
    };
    clearBtn.onclick = () => {
        const indexWidget = getWidgetByName(node, "index");
        if (indexWidget) {
            indexWidget.value = 0;
            indexWidget.callback?.(0);
        }
        setImageList(node, []);
    };

    container.appendChild(btnRow);
    container.appendChild(info);
    container.appendChild(grid);

    return { container, redraw, setDragging, updateSelectedCell };
}

app.registerExtension({
    name: "BatchLoadImages.Extension",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "BatchLoadImages") return;

        ensureGlobalDragDropPrevention();

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            const imageListWidget = getImageListWidget(this);
            if (imageListWidget) {
                // Hide the giant textbox; we manage it through the DOM UI.
                imageListWidget.type = "hidden";
                imageListWidget.computeSize = () => [0, -4];
            }

            // Create file-browser like UI
            const ui = createBrowserUI(this);
            this._batchLoadImagesUI = ui;
            this.addDOMWidget("batch_load_images", "customwidget", ui.container);
            this.setSize([420, 320]);

            _batchLoadImagesDomUIs.add({ node: this, container: ui.container, redraw: ui.redraw, setDragging: ui.setDragging });

            const prevOnRemoved = this.onRemoved;
            this.onRemoved = function () {
                for (const entry of _batchLoadImagesDomUIs) {
                    if (entry?.node === this) {
                        _batchLoadImagesDomUIs.delete(entry);
                        break;
                    }
                }
                return prevOnRemoved?.apply(this, arguments);
            };

            // Keep the DOM gallery in sync if something else changes the widget.
            if (imageListWidget) {
                const origCallback = imageListWidget.callback;
                imageListWidget.callback = function (value) {
                    origCallback?.call(this, value);
                    ui.redraw();
                };
            }

            const indexWidget = getWidgetByName(this, "index");
            if (indexWidget) {
                const origIndexCallback = indexWidget.callback;
                indexWidget.callback = function (value) {
                    origIndexCallback?.call(this, value);
                    ui.updateSelectedCell();
                };
            }

            ui.redraw();

            return r;
        };

        const origOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            origOnExecuted?.apply(this, arguments);
            this._batchLoadImagesUI?.updateSelectedCell?.();
        };
    },
});

app.registerExtension({
    name: "VNCCS.VisualPositionControl.Extension",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VNCCS_VisualPositionControl") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            const ui = createVNCCSVisualUI(this);
            if (ui) {
                this.addDOMWidget("vnccs_visual", "customwidget", ui.container);
                this.setSize([420, 220]);
                ui.read();
            }

            return r;
        };
    },
});
