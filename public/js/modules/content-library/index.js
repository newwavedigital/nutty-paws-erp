/* =========================================================================
   CONTENT LIBRARY (Dropbox / Google Drive style)
   ========================================================================= */
let currentFolder = null; // null = root
function libBreadcrumb(folderId) {
  const trail = [];
  let cur = folderId;
  while (cur) {
    const f = state.libraryFolders.find(x => x.id === cur);
    if (!f) break;
    trail.unshift(f);
    cur = f.parentId || null;
  }
  return trail;
}
function libDescendantFolderIds(folderId) {
  const out = new Set([folderId]);
  let added = true;
  while (added) {
    added = false;
    state.libraryFolders.forEach(f => {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id); added = true;
      }
    });
  }
  return out;
}
function renderContentLibrary(el) {
  if (!a10DataRecordState.contentLibrary.loaded && !a10DataRecordState.contentLibrary.loading) {
    refreshA10DataRecordModule('contentLibrary').then(() => { if (currentPage === 'content-library') router('content-library'); }).catch(() => {});
  }
  const folder = currentFolder ? state.libraryFolders.find(f => f.id === currentFolder) : null;
  // show subfolders of currentFolder (or top-level if root)
  const folders = state.libraryFolders.filter(f => (f.parentId || null) === currentFolder);
  const files = state.libraryFiles.filter(f => (f.folderId || null) === currentFolder);
  const trail = libBreadcrumb(currentFolder);
  el.innerHTML = `
    ${renderA10DataRecordBanner('contentLibrary')}
    <div class="card">
      <div class="card-header">
        <h2>${currentFolder ? escapeHtml(folder?.name || 'Folder') : 'Content Library'}</h2>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="newLibraryFolder()">+ New ${currentFolder?'Sub':''}Folder</button>
          <button class="btn" onclick="document.getElementById('libUploadInput').click()">+ Upload File</button>
          <input type="file" id="libUploadInput" multiple style="display:none" onchange="libraryUpload(event)" />
        </div>
      </div>
      <div class="breadcrumb" id="libBreadcrumb"
        ondragover="event.preventDefault()" ondrop="libDropOnRoot(event)">
        <a onclick="openLibraryFolder(null)" ondragover="libDragOverRoot(event)" ondragleave="libDragLeaveRoot(event)" ondrop="libDropOnRoot(event)">&#127968; All Files</a>
        ${trail.map(f => `<span>&rsaquo;</span><a onclick="openLibraryFolder('${f.id}')">${escapeHtml(f.name)}</a>`).join('')}
      </div>
      <div class="help-text" style="margin-bottom:8px">Tip: drag a folder onto another folder to nest it. Drag a file onto a folder to move it in.</div>
      ${folders.length === 0 && files.length === 0
        ? '<div class="empty">This folder is empty. Upload files or create a folder to get started.</div>'
        : `<div class="table-wrap"><table class="lib-table">
            <thead><tr>
              <th style="width:38px"></th>
              <th>Name</th>
              <th style="width:90px">Type</th>
              <th style="width:120px">Size / Items</th>
              <th style="width:130px">Modified</th>
              <th style="width:200px"></th>
            </tr></thead>
            <tbody>
            ${folders.map(f => {
              const fileCount = state.libraryFiles.filter(x => x.folderId === f.id).length;
              const subCount = state.libraryFolders.filter(x => x.parentId === f.id).length;
              return `<tr class="lib-row folder" data-folder-id="${f.id}"
                  draggable="true"
                  ondragstart="libDragStart(event,'folder','${f.id}')"
                  ondragover="libDragOver(event,'${f.id}')"
                  ondragleave="libDragLeave(event)"
                  ondrop="libDrop(event,'${f.id}')"
                  onclick="openLibraryFolder('${f.id}')">
                <td style="text-align:center;font-size:18px;color:var(--brown)">&#128193;</td>
                <td><strong>${escapeHtml(f.name)}</strong></td>
                <td style="font-size:12px;color:var(--brown-light)">Folder</td>
                <td style="font-size:12px">${fileCount} file${fileCount===1?'':'s'}${subCount?', '+subCount+' subfolder'+(subCount===1?'':'s'):''}</td>
                <td style="font-size:12px">${fmtDate(f.createdAt)}</td>
                <td class="row-actions" onclick="event.stopPropagation()">
                  <button class="btn btn-icon btn-sm" onclick="renameFolder('${f.id}')">Rename</button>
                  <button class="btn btn-icon btn-sm" onclick="moveFolder('${f.id}')">Move</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteFolder('${f.id}')">Delete</button>
                </td>
              </tr>`;
            }).join('')}
            ${files.map(f => {
              const ext = (f.name.split('.').pop()||'').toLowerCase();
              const nameButton = backendFileActionHtml(f, {
                style: 'color:var(--brown);font-weight:600;text-decoration:none;background:none;border:none;padding:0;font:inherit;cursor:pointer',
                label: f.name,
                unavailableHtml: `<span style="color:var(--brown);font-weight:600">${escapeHtml(f.name)}</span>`
              });
              const downloadButton = backendFileActionHtml(f, {
                className: 'btn btn-icon btn-sm',
                style: 'text-decoration:none',
                label: 'Download',
                unavailableHtml: '<span class="pill">Unavailable</span>'
              });
              return `<tr class="lib-row" data-file-id="${f.id}"
                  draggable="true"
                  ondragstart="libDragStart(event,'file','${f.id}')">
                <td style="text-align:center;font-size:18px;color:var(--orange)">${fileIcon(f.type, f.name)}</td>
                <td>${nameButton}</td>
                <td style="font-size:12px;color:var(--brown-light);text-transform:uppercase">${escapeHtml(ext||'file')}</td>
                <td style="font-size:12px">${formatBytes(f.size)}</td>
                <td style="font-size:12px">${fmtDate(f.uploadedAt)}</td>
                <td class="row-actions">
                  ${downloadButton}
                  <button class="btn btn-icon btn-sm" onclick="moveFile('${f.id}')">Move</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteLibraryFile('${f.id}')">Delete</button>
                </td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}

/* drag-drop handlers */
let libDragPayload = null;
function libDragStart(e, kind, id) {
  libDragPayload = { kind, id };
  e.dataTransfer.effectAllowed = 'move';
  // required for some browsers
  try { e.dataTransfer.setData('text/plain', kind+':'+id); } catch(err){}
}
function libDragOver(e, targetFolderId) {
  if (!libDragPayload) return;
  // can't drop onto itself or own descendant
  if (libDragPayload.kind === 'folder') {
    const desc = libDescendantFolderIds(libDragPayload.id);
    if (desc.has(targetFolderId)) return;
  }
  e.preventDefault();
  e.currentTarget.style.background = '#fff5e8';
}
function libDragLeave(e) {
  e.currentTarget.style.background = '';
}
function libDragOverRoot(e) {
  if (!libDragPayload) return;
  e.preventDefault();
  e.currentTarget.style.background = 'var(--beige)';
}
function libDragLeaveRoot(e) { e.currentTarget.style.background = ''; }
async function libDrop(e, targetFolderId) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.background = '';
  if (!libDragPayload) return;
  try {
    if (libDragPayload.kind === 'file') {
      const f = state.libraryFiles.find(x => x.id === libDragPayload.id);
      if (f) await saveA10DataRecord('contentLibrary', 'file', { ...f, folderId: targetFolderId }, { recordId: f._backendId || f.id });
      toast('File moved.');
    } else if (libDragPayload.kind === 'folder') {
      if (libDragPayload.id === targetFolderId) return;
      const desc = libDescendantFolderIds(libDragPayload.id);
      if (desc.has(targetFolderId)) { toast("Can't move a folder into itself."); return; }
      const f = state.libraryFolders.find(x => x.id === libDragPayload.id);
      if (f) await saveA10DataRecord('contentLibrary', 'folder', { ...f, parentId: targetFolderId }, { recordId: f._backendId || f.id });
      toast('Folder moved.');
    }
    libDragPayload = null;
    router('content-library');
  } catch (err) {
    toast(err.message || 'Content Library item could not be moved.');
  }
}
async function libDropOnRoot(e) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  if (!libDragPayload) return;
  try {
    if (libDragPayload.kind === 'file') {
      const f = state.libraryFiles.find(x => x.id === libDragPayload.id);
      if (f) await saveA10DataRecord('contentLibrary', 'file', { ...f, folderId: null }, { recordId: f._backendId || f.id });
    } else if (libDragPayload.kind === 'folder') {
      const f = state.libraryFolders.find(x => x.id === libDragPayload.id);
      if (f) await saveA10DataRecord('contentLibrary', 'folder', { ...f, parentId: null }, { recordId: f._backendId || f.id });
    }
    libDragPayload = null;
    router('content-library');
    toast('Moved to root.');
  } catch (err) {
    toast(err.message || 'Content Library item could not be moved.');
  }
}
function fileIcon(type, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (type && type.startsWith('image/')) return '&#127912;';
  if (ext === 'pdf') return '&#128196;';
  if (['doc','docx'].includes(ext)) return '&#128462;';
  if (['xls','xlsx','csv'].includes(ext)) return '&#128202;';
  if (['ppt','pptx'].includes(ext)) return '&#128240;';
  if (['mp3','wav','m4a'].includes(ext)) return '&#127925;';
  if (['mp4','mov','avi'].includes(ext)) return '&#127916;';
  return '&#128196;';
}
function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(2) + ' MB';
}
function openLibraryFolder(id) {
  currentFolder = id;
  router('content-library');
}
async function newLibraryFolder() {
  const name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  try {
    await saveA10DataRecord('contentLibrary', 'folder', { id: uid('f'), kind: 'folder', name: name.trim(), parentId: currentFolder, createdAt: new Date().toISOString().slice(0,10) });
    router('content-library');
    toast('Folder created.');
  } catch (err) {
    toast(err.message || 'Folder could not be saved to the backend.');
  }
}
async function renameFolder(id) {
  const f = state.libraryFolders.find(x => x.id === id);
  if (!f) return;
  const name = prompt('Rename folder:', f.name);
  if (!name || !name.trim()) return;
  try {
    await saveA10DataRecord('contentLibrary', 'folder', { ...f, name: name.trim() }, { recordId: f._backendId || id });
    router('content-library');
  } catch (err) {
    toast(err.message || 'Folder could not be renamed.');
  }
}
async function deleteFolder(id) {
  const desc = libDescendantFolderIds(id);
  const filesIn = state.libraryFiles.filter(f => desc.has(f.folderId)).length;
  const subCount = desc.size - 1;
  let msg = 'Delete this folder';
  if (subCount) msg += ` and its ${subCount} subfolder${subCount===1?'':'s'}`;
  if (filesIn) msg += `${subCount?' plus':' and its'} ${filesIn} file${filesIn===1?'':'s'}`;
  msg += '?';
  const ok = await openConfirmModal({
    title: 'Delete folder',
    record: state.libraryFolders.find(f => f.id === id)?.name || id,
    message: msg,
    risk: 'Nested folders and files in this folder will also be removed from the local content library.',
    confirmLabel: 'Delete Folder',
    tone: 'danger'
  });
  if (!ok) return;
  try {
    const records = [
      ...state.libraryFiles.filter(f => desc.has(f.folderId)).map(f => f._backendId || f.id),
      ...state.libraryFolders.filter(f => desc.has(f.id)).map(f => f._backendId || f.id)
    ];
    for (const recordId of records) await archiveA10DataRecord('contentLibrary', recordId);
    router('content-library');
    toast('Folder deleted.');
  } catch (err) {
    toast(err.message || 'Folder could not be deleted.');
  }
}
async function moveFolder(id) {
  const desc = libDescendantFolderIds(id);
  const opts = [{label:'(Root)', val:''}, ...state.libraryFolders.filter(f => !desc.has(f.id)).map(f => {
    const trail = libBreadcrumb(f.id);
    return { label: trail.map(t=>t.name).join(' / '), val: f.id };
  })];
  const choice = prompt('Move folder to:\n' + opts.map((o,i)=>`${i}. ${o.label}`).join('\n'), '0');
  const idx = parseInt(choice, 10);
  if (isNaN(idx) || !opts[idx]) return;
  const target = opts[idx].val || null;
  const f = state.libraryFolders.find(x => x.id === id);
  if (!f) return;
  try {
    await saveA10DataRecord('contentLibrary', 'folder', { ...f, parentId: target }, { recordId: f._backendId || id });
    router('content-library');
    toast('Folder moved.');
  } catch (err) {
    toast(err.message || 'Folder could not be moved.');
  }
}
async function libraryUpload(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  try {
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        toast(`Skipped "${f.name}" - over 5 MB.`);
        continue;
      }
      const recordPayload = {
        id: uid('lf'),
        kind: 'file',
        folderId: currentFolder,
        name: f.name,
        type: f.type,
        size: f.size,
        uploadedAt: new Date().toISOString().slice(0,10),
        fileIds: []
      };
      let saved = null;
      try {
        saved = await saveA10DataRecord('contentLibrary', 'file', recordPayload);
        const uploaded = await uploadA10FileReference('content_library', saved.id, 'content_library_file', f);
        await saveA10DataRecord('contentLibrary', 'file', { ...recordPayload, fileId: uploaded.id, fileIds: [uploaded.id] }, { recordId: saved.id });
      } catch (err) {
        if (saved?.id) {
          try { await archiveA10DataRecord('contentLibrary', saved.id); } catch (cleanupErr) {}
        }
        throw err;
      }
    }
    e.target.value = '';
    router('content-library');
    toast('Files uploaded.');
  } catch(err) {
    toast(err.message || 'File could not be uploaded to R2.');
  }
}
async function deleteLibraryFile(id) {
  const file = state.libraryFiles.find(f => f.id === id);
  const ok = await openConfirmModal({
    title: 'Delete file',
    record: file?.name || id,
    message: 'Delete this file from the content library?',
    risk: 'This removes the local file record.',
    confirmLabel: 'Delete File',
    tone: 'danger'
  });
  if (!ok) return;
  try {
    await archiveA10DataRecord('contentLibrary', file?._backendId || id);
    router('content-library');
  } catch (err) {
    toast(err.message || 'File could not be deleted from the backend.');
  }
}
async function moveFile(id) {
  const f = state.libraryFiles.find(x => x.id === id);
  if (!f) return;
  const opts = [{label:'(Root)', val:''}, ...state.libraryFolders.map(fo => {
    const trail = libBreadcrumb(fo.id);
    return { label: trail.map(t=>t.name).join(' / '), val: fo.id };
  })];
  const choice = prompt('Move to which folder?\n' + opts.map((o,i)=>`${i}. ${o.label}`).join('\n'), '0');
  const idx = parseInt(choice, 10);
  if (isNaN(idx) || !opts[idx]) return;
  try {
    await saveA10DataRecord('contentLibrary', 'file', { ...f, folderId: opts[idx].val || null }, { recordId: f._backendId || id });
    router('content-library');
    toast('File moved.');
  } catch (err) {
    toast(err.message || 'File could not be moved.');
  }
}

