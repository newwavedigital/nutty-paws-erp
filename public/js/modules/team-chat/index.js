/* =========================================================================
   TEAM CHAT (Slack-like)
   ========================================================================= */
let activeChannel = null;
function renderSlack(el) {
  if (!a10DataRecordState.teamChat.loaded && !a10DataRecordState.teamChat.loading) {
    refreshA10DataRecordModule('teamChat').then(() => { if (currentPage === 'team-chat') router('team-chat'); }).catch(() => {});
  }
  if (!activeChannel || !state.channels.find(c => c.id === activeChannel)) {
    activeChannel = state.channels[0]?.id || null;
  }
  const ch = state.channels.find(c => c.id === activeChannel);
  const msgs = state.messages
    .filter(m => m.channelId === activeChannel)
    .sort((a,b) => a.timestamp.localeCompare(b.timestamp));

  el.innerHTML = `
    ${renderA10DataRecordBanner('teamChat')}
    <div class="chat-layout">
      <div class="channel-list">
        <div class="channel-list-header">
          <span>Channels</span>
          <button onclick="newChannel()">+</button>
        </div>
        ${state.channels.map(c => `
          <div class="channel-item ${c.id===activeChannel?'active':''}" onclick="setChannel('${c.id}')">
            <span># ${escapeHtml(c.name)}</span>
            <span class="ch-actions">
              <button class="ch-del" title="Rename channel" onclick="event.stopPropagation();renameChannel('${c.id}')">&#9998;</button>
              <button class="ch-del" title="Delete channel" onclick="event.stopPropagation();deleteChannel('${c.id}')">&times;</button>
            </span>
          </div>
        `).join('')}
      </div>
      <div class="chat-main">
        ${ch ? `
          <div class="chat-header">
            <h2># ${escapeHtml(ch.name)}</h2>
            <div class="desc">${escapeHtml(ch.description || '')}</div>
          </div>
          <div class="chat-messages" id="chatMsgs">
            ${msgs.length === 0 ? '<div class="empty">No messages yet. Be the first to say hi.</div>' :
              msgs.map(m => `
                <div class="chat-msg">
                  <div class="chat-avatar">${escapeHtml((m.author||'?').slice(0,1).toUpperCase())}</div>
                  <div class="chat-body">
                    <div class="chat-meta"><strong>${escapeHtml(m.author||'')}</strong> ${formatChatTime(m.timestamp)}</div>
                    ${m.text ? `<div class="chat-text">${escapeHtml(m.text)}</div>` : ''}
                    ${m.attachment ? `<a href="${m.attachment.fileId ? '/api/files/'+encodeURIComponent(m.attachment.fileId)+'/download' : (m.attachment.dataUrl || '#')}" download="${escapeHtml(m.attachment.name)}" class="chat-attach">${attachIcon(m.attachment)} <span>${escapeHtml(m.attachment.name)}</span> <span style="color:var(--brown-light);font-size:11px">${formatBytes(m.attachment.size)}</span></a>` : ''}
                  </div>
                </div>
              `).join('')
            }
          </div>
          <div class="chat-input-wrap">
            <div id="chatAttachInfo" class="chat-attach-preview" style="display:none"></div>
            <div class="chat-input">
              <input type="file" id="chatFileInput" style="display:none" onchange="chatFileSelected(event)" />
              <button class="btn btn-icon" title="Attach file" onclick="chatFilePick()" style="height:40px">&#128206;</button>
              <textarea id="chatInput" placeholder="Message # ${escapeHtml(ch.name)}..." onkeydown="chatKey(event)"></textarea>
              <button class="btn" onclick="sendMessage()">Send</button>
            </div>
          </div>
        ` : '<div class="empty">No channels. Create one to start chatting.</div>'}
      </div>
    </div>
  `;
  // scroll to bottom
  setTimeout(() => {
    const mc = document.getElementById('chatMsgs');
    if (mc) mc.scrollTop = mc.scrollHeight;
  }, 10);
}
function formatChatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}
function setChannel(id) {
  activeChannel = id;
  renderSlack(document.getElementById('content'));
}
async function newChannel() {
  const name = prompt('Channel name (no spaces):');
  if (!name || !name.trim()) return;
  const desc = prompt('Channel description (optional):') || '';
  const id = uid('ch');
  try {
    const saved = await saveA10DataRecord('teamChat', 'channel', { id, kind: 'channel', name: name.trim().toLowerCase().replace(/\s+/g,'-'), description: desc, createdAt: new Date().toISOString().slice(0,10) });
    activeChannel = saved.id;
    renderSlack(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Channel could not be saved to the backend.');
  }
}
async function deleteChannel(id) {
  const channel = state.channels.find(c => c.id === id);
  const ok = await openConfirmModal({
    title: 'Delete chat channel',
    record: channel?.name || id,
    message: 'Delete this channel and all of its messages?',
    risk: 'This removes local chat history for the channel.',
    confirmLabel: 'Delete Channel',
    tone: 'danger'
  });
  if (!ok) return;
  try {
    const messages = state.messages.filter(m => m.channelId === id).map(m => m._backendId || m.id);
    for (const messageId of messages) await archiveA10DataRecord('teamChat', messageId);
    await archiveA10DataRecord('teamChat', channel?._backendId || id);
    if (activeChannel === id) activeChannel = state.channels[0]?.id || null;
    renderSlack(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Channel could not be deleted from the backend.');
  }
}
async function renameChannel(id) {
  const ch = state.channels.find(c => c.id === id);
  if (!ch) return;
  const name = prompt('Rename channel:', ch.name);
  if (!name || !name.trim()) return;
  const desc = prompt('Channel description (optional):', ch.description || '');
  try {
    await saveA10DataRecord('teamChat', 'channel', { ...ch, name: name.trim().toLowerCase().replace(/\s+/g, '-'), description: desc !== null ? desc : ch.description }, { recordId: ch._backendId || id });
    renderSlack(document.getElementById('content'));
    toast('Channel updated.');
  } catch (err) {
    toast(err.message || 'Channel could not be updated.');
  }
}

let pendingChatAttachment = null;
function chatFilePick() {
  document.getElementById('chatFileInput').click();
}
function chatFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  pendingChatAttachment = { name: f.name, type: f.type, size: f.size, file: f };
  const info = document.getElementById('chatAttachInfo');
  if (info) {
    info.style.display = 'flex';
    info.innerHTML = `<span>&#128206; ${escapeHtml(f.name)} (${formatBytes(f.size)})</span><button onclick="clearChatAttachment()" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:14px">&times;</button>`;
  }
}
function clearChatAttachment() {
  pendingChatAttachment = null;
  const fi = document.getElementById('chatFileInput');
  if (fi) fi.value = '';
  const info = document.getElementById('chatAttachInfo');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
}
async function sendMessage() {
  const ta = document.getElementById('chatInput');
  const txt = ta.value.trim();
  if (!txt && !pendingChatAttachment) return;
  const msg = {
    id: uid('m'),
    channelId: activeChannel,
    author: 'Henry',
    text: txt,
    timestamp: new Date().toISOString()
  };
  try {
    let saved = await saveA10DataRecord('teamChat', 'message', { ...msg, kind: 'message' });
    if (pendingChatAttachment?.file) {
      const uploaded = await uploadA10FileReference('team_chat', saved.id, 'chat_attachment', pendingChatAttachment.file);
      saved = await saveA10DataRecord('teamChat', 'message', {
        ...msg,
        kind: 'message',
        attachment: { name: pendingChatAttachment.name, type: pendingChatAttachment.type, size: pendingChatAttachment.size, fileId: uploaded.id },
        fileIds: [uploaded.id]
      }, { recordId: saved.id });
    }
    ta.value = '';
    pendingChatAttachment = null;
    renderSlack(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Message could not be saved to the backend.');
  }
}
function attachIcon(att) {
  if (att && att.type && att.type.startsWith('image/')) return '&#127912;';
  return '&#128206;';
}
function chatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

