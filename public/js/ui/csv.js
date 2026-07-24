/* =========================================================================
   CSV EXPORT
   ========================================================================= */
function exportCsv(filename, rows) {
  if (!rows.length) { toast('Nothing to export.'); return; }
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(','),
    ...rows.map(r => cols.map(c => {
      let v = r[c] == null ? '' : String(r[c]);
      if (/^[\s\uFEFF]*[=+\-@]/.test(v)) v = "'" + v;
      v = v.replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

