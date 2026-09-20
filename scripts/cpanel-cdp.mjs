const endpoint = "http://127.0.0.1:9223/json/list";

const pages = (await (await fetch(endpoint)).json()).filter((tab) => tab.type === "page");
if (pages.length !== 1) {
  throw new Error(`Expected one Chromium page, found ${pages.length}`);
}

const socket = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("Page evaluation failed");
  return result.result.value;
}

const operation = process.argv[2] ?? "summary";
const argumentsList = process.argv.slice(3);
const argument = argumentsList.join(" ");
let output;

function assertServerPath(value) {
  if (!/^\/home2\/hastabaz(?:\/|$)/.test(value) || value.includes("..")) {
    throw new Error("Server path is outside the Hastabazaar account scope");
  }
  return value;
}

async function api2(module, func, parameters) {
  return evaluate(`(async () => {
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    const query = new URLSearchParams(${JSON.stringify({
      cpanel_jsonapi_user: "hastabaz",
      cpanel_jsonapi_apiversion: "2",
    })});
    query.set('cpanel_jsonapi_module', ${JSON.stringify(module)});
    query.set('cpanel_jsonapi_func', ${JSON.stringify(func)});
    for (const [key, value] of Object.entries(${JSON.stringify(parameters)})) query.set(key, value);
    const response = await fetch(prefix + '/json-api/cpanel?' + query, {credentials: 'same-origin'});
    const body = await response.json();
    return {httpStatus: response.status, result: body?.cpanelresult?.event?.result ?? 0, data: body?.cpanelresult?.data ?? [], error: body?.cpanelresult?.error ?? null};
  })()`);
}

if (operation === "summary") {
  output = await evaluate(`(() => ({
    title: document.title,
    headings: [...document.querySelectorAll('h1,h2,h3')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 40),
    controls: [...document.querySelectorAll('a,button,input[type=submit]')].map(e => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim()).filter(Boolean).slice(0, 120)
  }))()`);
} else if (operation === "capacity") {
  output = await evaluate(`(() => {
    const lines = document.body.innerText.split(/\\n+/).map(s => s.trim()).filter(Boolean);
    const terms = ['disk usage', 'file usage', 'bandwidth', 'cpu usage', 'physical memory', 'memory usage', 'entry processes', 'number of processes', 'processes', 'i/o usage', 'iops', 'monthly bandwidth'];
    const selected = [];
    for (let i = 0; i < lines.length; i++) {
      if (terms.some(term => lines[i].toLowerCase().includes(term))) selected.push(lines.slice(i, Math.min(i + 3, lines.length)).join(' | '));
    }
    return [...new Set(selected)].slice(0, 50);
  })()`);
} else if (operation === "file-manager") {
  const directory = assertServerPath(argument || "/home2/hastabaz");
  output = await evaluate(`(async () => {
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    const query = new URLSearchParams({dir: ${JSON.stringify(directory)}});
    location.assign(prefix + '/frontend/jupiter/filemanager/index.html?' + query);
    return {navigating: true};
  })()`);
} else if (operation === "cpanel-home") {
  output = await evaluate(`(() => {
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    location.assign(prefix + '/frontend/jupiter/index.html');
    return {navigating: true};
  })()`);
} else if (operation === "public-home") {
  output = await evaluate(`(() => {
    location.assign('https://hastabazaar.com/');
    return {navigating: true};
  })()`);
} else if (operation === "back") {
  output = await evaluate(`(() => {
    history.back();
    return {navigating: true};
  })()`);
} else if (operation === "find") {
  output = await evaluate(`(() => {
    const needle = ${JSON.stringify(argument)}.toLowerCase();
    return [...document.querySelectorAll('a,button,input,[role=button]')]
      .map((e, index) => ({index, tag: e.tagName, text: (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim()}))
      .filter(x => x.text.toLowerCase().includes(needle)).slice(0, 30);
  })()`);
} else if (operation === "rows") {
  output = await evaluate(`(() => ({
    text: document.body.innerText.split(/\\n+/).map(value => value.trim()).filter(Boolean).slice(-120),
    rows: [...document.querySelectorAll('tr,[role=row]')].map((row, index) => ({index, text: row.innerText.trim()})).filter(row => row.text).slice(0, 120),
    frames: document.querySelectorAll('iframe').length,
  }))()`);
} else if (operation === "forms") {
  output = await evaluate(`(() => [...document.querySelectorAll('input,button')].map((control, index) => ({
    index,
    tag: control.tagName,
    type: control.type || '',
    id: control.id || '',
    name: control.name || '',
    value: control.type === 'password' ? '[redacted]' : control.value || '',
    text: control.innerText?.trim() || '',
    visible: Boolean(control.offsetWidth || control.offsetHeight || control.getClientRects().length),
  })).filter(control => control.visible))()`);
} else if (operation === "select-row") {
  output = await evaluate(`(() => {
    const needle = ${JSON.stringify(argument)}.toLowerCase();
    const rows = [...document.querySelectorAll('tr,[role=row]')];
    const row = rows.find(item => item.innerText.trim().toLowerCase().includes(needle));
    if (!row) return {selected: false};
    const target = row.querySelector('td') || row;
    target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, view: window}));
    target.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, view: window}));
    target.dispatchEvent(new MouseEvent('click', {bubbles: true, view: window}));
    return {selected: true, text: row.innerText.trim(), className: row.className};
  })()`);
} else if (operation === "click") {
  output = await evaluate(`(async () => {
    const needle = ${JSON.stringify(argument)}.toLowerCase();
    const items = [...document.querySelectorAll('a,button,input[type=submit],[role=button]')];
    const exact = items.find(e => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim().toLowerCase() === needle);
    const target = exact || items.find(e => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim().toLowerCase().includes(needle));
    if (!target) return {clicked: false};
    target.click();
    await new Promise(r => setTimeout(r, 2500));
    return {clicked: true, title: document.title};
  })()`);
} else if (operation === "list-files") {
  const directory = assertServerPath(argument);
  output = await evaluate(`(async () => {
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    const query = new URLSearchParams({dir: ${JSON.stringify(directory)}, show_hidden: '1'});
    const response = await fetch(prefix + '/execute/Fileman/list_files?' + query, {credentials: 'same-origin'});
    const body = await response.json();
    return {
      httpStatus: response.status,
      status: body?.status ?? 0,
      errors: body?.errors ?? [],
      files: (body?.data ?? []).map(file => ({
        name: file.file,
        type: file.type,
        size: file.size,
        mtime: file.mtime,
        mode: file.nicemode,
        user: file.user,
        group: file.group,
      })),
    };
  })()`);
} else if (operation === "tree-summary") {
  const directory = assertServerPath(argument);
  output = await evaluate(`(async () => {
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    const query = new URLSearchParams({
      cpanel_jsonapi_user: 'hastabaz',
      cpanel_jsonapi_apiversion: '2',
      cpanel_jsonapi_module: 'Fileman',
      cpanel_jsonapi_func: 'search',
      dir: ${JSON.stringify(directory)},
      recursive: '1',
      mimeinfo: '0',
      attributes: 'size|type|mode|mtime',
    });
    const response = await fetch(prefix + '/json-api/cpanel?' + query, {credentials: 'same-origin'});
    const body = await response.json();
    const data = body?.cpanelresult?.data ?? [];
    const normalized = data.map(item => String(item.file || item.fullpath || '').replaceAll('\\\\', '/'));
    return {
      httpStatus: response.status,
      result: body?.cpanelresult?.event?.result ?? 0,
      error: body?.cpanelresult?.error ?? null,
      files: data.filter(item => item.type === 'file').length,
      directories: data.filter(item => item.type === 'dir').length,
      bytes: data.filter(item => item.type === 'file').reduce((sum, item) => sum + Number(item.size || 0), 0),
      required: {
        app: normalized.some(path => path.endsWith('/app.cjs')),
        server: normalized.some(path => path.endsWith('/server.js')),
        package: normalized.some(path => path.endsWith('/package.json')),
        releaseManifest: normalized.some(path => path.endsWith('/deployment/babal/release-manifest.json')),
        clientManifest: normalized.some(path => path.endsWith('/dist/client/vinext-client-entry-manifest.json')),
      },
    };
  })()`);
} else if (operation === "mkdir") {
  const parent = assertServerPath(argumentsList[0] ?? "");
  const name = argumentsList[1] ?? "";
  if (!/^(?:releases|hastabazaar-release-[a-z0-9._-]+)$/.test(name)) {
    throw new Error("Refusing unapproved release directory name");
  }
  output = await api2("Fileman", "mkdir", {
    path: parent,
    name,
    permissions: "0755",
  });
} else if (operation === "stat") {
  const target = assertServerPath(argument);
  const separator = target.lastIndexOf("/");
  output = await api2("Fileman", "statfiles", {
    dir: target.slice(0, separator),
    files: target.slice(separator + 1),
  });
} else if (operation === "move") {
  const source = assertServerPath(argumentsList[0] ?? "");
  const destination = assertServerPath(argumentsList[1] ?? "");
  output = await api2("Fileman", "fileop", {
    op: "move",
    sourcefiles: source.replace(/^\/home2\/hastabaz\/?/, ""),
    destfiles: destination,
    doubledecode: "1",
  });
} else if (operation === "extract") {
  const source = assertServerPath(argument);
  if (!source.endsWith(".zip")) throw new Error("Only ZIP release extraction is allowed");
  output = await api2("Fileman", "fileop", {
    op: "extract",
    sourcefiles: source.replace(/^\/home2\/hastabaz\/?/, ""),
    doubledecode: "1",
  });
} else if (operation === "upload") {
  const localFile = argumentsList[0] ?? "";
  const directory = assertServerPath(argumentsList[1] ?? "");
  if (!/^hastabazaar-release-[a-z0-9._-]+\.zip$/.test(localFile.split(/[\\/]/).at(-1) ?? "")) {
    throw new Error("Only a versioned Hastabazaar release ZIP can be uploaded");
  }
  await evaluate(`(() => {
    document.getElementById('codex-cpanel-upload')?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'codex-cpanel-upload';
    input.style.display = 'none';
    document.body.appendChild(input);
    return true;
  })()`);
  await send("DOM.enable");
  const documentNode = await send("DOM.getDocument");
  const uploadNode = await send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: "#codex-cpanel-upload",
  });
  await send("DOM.setFileInputFiles", {
    files: [localFile],
    nodeId: uploadNode.nodeId,
  });
  output = await evaluate(`(async () => {
    const input = document.getElementById('codex-cpanel-upload');
    const file = input?.files?.[0];
    if (!file) return {httpStatus: 0, status: 0, errors: ['Local file was not attached']};
    const form = new FormData();
    form.set('dir', ${JSON.stringify(directory)});
    form.set('file-1', file, file.name);
    const prefix = location.pathname.match(/^\\/cpsess\\d+/)?.[0] || '';
    const response = await fetch(prefix + '/execute/Fileman/upload_files', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });
    const body = await response.json();
    input.remove();
    return {httpStatus: response.status, status: body?.status ?? 0, errors: body?.errors ?? [], data: body?.data ?? []};
  })()`);
} else {
  throw new Error(`Unsupported operation: ${operation}`);
}

console.log(JSON.stringify(output, null, 2));
socket.close();
