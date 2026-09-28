  const dayMs = 24*60*60*1000;
  const grid = document.getElementById('grid');
  const vgrid = document.getElementById('vgrid');
  const links = document.getElementById('links');
  const canvas = document.getElementById('canvas');
  const jsonOut = document.getElementById('jsonOut');
  const projectNameIn = document.getElementById('projectName');
  const projectStartIn = document.getElementById('projectStart');
  const startIn = document.getElementById('startDate');
  const taskNameIn = document.getElementById('taskName');
  const durationIn = document.getElementById('duration');
  const finishIn = document.getElementById('finishDate');
  const progressIn = document.getElementById('progress');
  const colorIn = document.getElementById('color');
  const addBtn = document.getElementById('addBtn');
  const fileInput = document.getElementById('fileInput');
  const newFile = document.getElementById('newFile');
  const openFile = document.getElementById('openFile');
  const saveFile = document.getElementById('saveFile');
  const fileNameSpan = document.getElementById('fileName');
  const pngPageDays = document.getElementById('pngPageDays');
  const exportPng = document.getElementById('exportPng');
  const exportPdf = document.getElementById('exportPdf');
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');

  // modal elements
  const editModal = document.getElementById('editModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalName = document.getElementById('modalName');
  const modalStart = document.getElementById('modalStart');
  const modalDuration = document.getElementById('modalDuration');
  const modalFinish = document.getElementById('modalFinish');
  const modalProgress = document.getElementById('modalProgress');
  const modalDeps = document.getElementById('modalDeps');
  const modalColor = document.getElementById('modalColor');
  const modalCancel = document.getElementById('modalCancel');
  const modalSave = document.getElementById('modalSave');

  const leftWidth = 300;
  const monthHeaderHeight = 22;
  const dayHeaderHeight = 30;
  const headerHeight = monthHeaderHeight + dayHeaderHeight;
  const footerHeight = 30;
  const barHeight = 30;

  let tasks = [];
  let editingIdx = null;
  let linkDragState = null;
  let linkHoverTargetIdx = null;
  let linkPreviewEl = null;
  let reorderDragState = null;
  let reorderIndicatorEl = null;
  let projectName = 'Untitled Project';
  let projectStart = localDateString(new Date());
  let viewStart = new Date(); viewStart.setHours(0,0,0,0); viewStart = new Date(viewStart.getTime() - 3*dayMs);
  let daysVisible = 40;
  let colWidth = 40;
  const rowHeight = 68;
  const todayISO = localDateString(new Date());
  projectNameIn.value = projectName;
  projectStartIn.value = projectStart;
  startIn.value = todayISO;

  // File System Access API handle
  let fileHandle = null;
  let fileWritable = false;
  let lastLoadRepaired = false;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function localDateString(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function addDaysLocal(date, days) {
    const out = new Date(date);
    out.setHours(0, 0, 0, 0);
    out.setDate(out.getDate() + days);
    return out;
  }

  function formatWeekdayShort(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function dayDiffLocal(start, finish) {
    return Math.round((finish.getTime() - start.getTime()) / dayMs);
  }

  function clampProgress(value) {
    const progress = Number(value);
    if (!Number.isFinite(progress)) return 0;
    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  function progressLabel(value) {
    return `${clampProgress(value)}%`;
  }

  function durationFromStartFinish(start, finish) {
    if (!start || !finish) return null;
    if (finish < start) return null;
    return dayDiffLocal(start, finish) + 1;
  }

  function syncTaskDates(task) {
    const start = parseLocalDate(task.start) || new Date();
    const finish = parseLocalDate(task.finish);
    let duration = parseInt(task.duration, 10);
    if (finish) {
      const derived = durationFromStartFinish(start, finish);
      if (Number.isFinite(derived) && derived > 0) duration = derived;
    }
    if (!Number.isFinite(duration) || duration < 1) duration = 1;
    task.start = localDateString(start);
    task.duration = duration;
    if (finish && finish >= start) {
      task.finish = localDateString(finish);
    } else {
      task.finish = localDateString(addDaysLocal(start, duration - 1));
    }
    return task;
  }

  function syncProjectFields() {
    projectName = (projectNameIn.value || '').trim() || 'Untitled Project';
    projectStart = projectStartIn.value || localDateString(new Date());
    projectStartIn.value = projectStart;
    projectNameIn.value = projectName;
  }

  function computeViewStart() {
    syncProjectFields();
    let earliest = null;
    tasks.forEach((task) => {
      const start = parseLocalDate(task.start);
      if (start && (!earliest || start < earliest)) earliest = start;
    });
    if (!earliest) earliest = parseLocalDate(projectStart) || new Date();
    viewStart = new Date(earliest.getTime() - 3 * dayMs);
  }

  function createTask(raw = {}) {
    const task = {
      id: raw.id ?? (Date.now() + Math.random()),
      name: raw.name || 'Task',
      start: raw.start || todayISO,
      duration: Number(raw.duration) || 1,
      progress: clampProgress(raw.progress ?? 0),
      color: raw.color || '#1f77b4',
      deps: Array.isArray(raw.deps) ? raw.deps.slice() : [],
      finish: raw.finish || null,
    };
    const parsedStart = parseLocalDate(task.start) || parseLocalDate(task.finish) || new Date();
    const parsedFinish = parseLocalDate(task.finish);
    if (parsedFinish) task.duration = Math.max(1, durationFromStartFinish(parsedStart, parsedFinish) || 1);
    task.start = localDateString(parsedStart);
    return syncTaskDates(task);
  }

  function taskDepsToNumbers(task) {
    const idToNumber = new Map(tasks.map((t, idx) => [String(t.id), idx + 1]));
    return (task.deps || [])
      .map((depId) => idToNumber.get(String(depId)))
      .filter((num) => Number.isFinite(num))
      .join(', ');
  }

  function parseDepsInput(value) {
    const tokens = String(value || '')
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const ids = [];
    tokens.forEach((token) => {
      const number = Number(token.replace(/^#/, ''));
      if (!Number.isInteger(number) || number < 1 || number > tasks.length) return;
      const dep = tasks[number - 1];
      if (dep && !ids.includes(dep.id)) ids.push(dep.id);
    });
    return ids;
  }

  function addDependency(sourceIdx, targetIdx) {
    if (sourceIdx === targetIdx) return false;
    const source = tasks[sourceIdx];
    const target = tasks[targetIdx];
    if (!source || !target) return false;
    target.deps = Array.isArray(target.deps) ? target.deps.slice() : [];
    const sourceId = source.id;
    if (target.deps.some((dep) => String(dep) === String(sourceId))) return false;
    target.deps.push(sourceId);
    syncTaskDates(target);
    return true;
  }

  function ensureLinkPreviewElement() {
    if (linkPreviewEl && linkPreviewEl.isConnected) return linkPreviewEl;
    linkPreviewEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linkPreviewEl.setAttribute('fill', 'none');
    linkPreviewEl.setAttribute('stroke', '#0f766e');
    linkPreviewEl.setAttribute('stroke-width', '1.8');
    linkPreviewEl.setAttribute('stroke-dasharray', '4 4');
    linkPreviewEl.setAttribute('stroke-linecap', 'round');
    linkPreviewEl.setAttribute('stroke-linejoin', 'round');
    links.appendChild(linkPreviewEl);
    return linkPreviewEl;
  }

  function removeLinkPreviewElement() {
    if (linkPreviewEl && linkPreviewEl.parentNode) linkPreviewEl.parentNode.removeChild(linkPreviewEl);
    linkPreviewEl = null;
  }

  function ensureReorderIndicatorElement() {
    if (reorderIndicatorEl && reorderIndicatorEl.isConnected) return reorderIndicatorEl;
    reorderIndicatorEl = document.createElement('div');
    reorderIndicatorEl.className = 'reorder-indicator';
    grid.appendChild(reorderIndicatorEl);
    return reorderIndicatorEl;
  }

  function removeReorderIndicatorElement() {
    if (reorderIndicatorEl && reorderIndicatorEl.parentNode) reorderIndicatorEl.parentNode.removeChild(reorderIndicatorEl);
    reorderIndicatorEl = null;
  }

  function moveTask(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= tasks.length || toIdx >= tasks.length) return false;
    const [task] = tasks.splice(fromIdx, 1);
    tasks.splice(toIdx, 0, task);
    return true;
  }

  function updateReorderIndicator(clientX, clientY) {
    if (!reorderDragState) return;
    const element = document.elementFromPoint(clientX, clientY);
    const row = element?.closest('.row');
    const indicator = ensureReorderIndicatorElement();
    if (!row) {
      indicator.style.display = 'none';
      reorderDragState.dropIdx = null;
      return;
    }
    const rowIdx = Number(row.dataset.idx);
    const rect = row.getBoundingClientRect();
    const after = clientY > rect.top + rect.height / 2;
    const dropIdx = after ? rowIdx + 1 : rowIdx;
    reorderDragState.dropIdx = dropIdx;
    indicator.style.display = 'block';
    const top = after ? rect.bottom - grid.getBoundingClientRect().top : rect.top - grid.getBoundingClientRect().top;
    indicator.style.top = `${Math.max(0, top)}px`;
    indicator.style.left = '0';
    indicator.style.right = '0';
  }

  function commitReorderDrag() {
    if (!reorderDragState) return;
    const { sourceIdx, dropIdx } = reorderDragState;
    reorderDragState = null;
    removeReorderIndicatorElement();
    if (!Number.isInteger(dropIdx) || dropIdx === sourceIdx || dropIdx === sourceIdx + 1) {
      renderGrid();
      return;
    }
    const targetIdx = dropIdx > sourceIdx ? dropIdx - 1 : dropIdx;
    if (moveTask(sourceIdx, targetIdx)) {
      renderGrid();
      updateJSON();
    } else {
      renderGrid();
    }
  }

  function updateLinkHoverTarget(targetIdx) {
    if (linkHoverTargetIdx === targetIdx) return;
    const prev = grid.querySelector('.task-bar.link-hover');
    if (prev) prev.classList.remove('link-hover');
    linkHoverTargetIdx = targetIdx;
    if (Number.isFinite(targetIdx)) {
      const bar = grid.querySelector(`.task-bar[data-idx="${targetIdx}"]`);
      if (bar) bar.classList.add('link-hover');
    }
  }

  function updateLinkPreview(clientX, clientY) {
    if (!linkDragState) return;
    const source = tasks[linkDragState.sourceIdx];
    const metrics = taskBarMetrics(source, linkDragState.sourceIdx);
    if (!metrics) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left + canvas.scrollLeft;
    const y = clientY - rect.top + canvas.scrollTop;
    const preview = ensureLinkPreviewElement();
    const bendX = Math.min(metrics.barStartX, x) - 18;
    preview.setAttribute('d', `M ${metrics.barStartX} ${metrics.barCenterY} H ${bendX} V ${y} H ${x}`);
    const target = document.elementFromPoint(clientX, clientY)?.closest('.task-bar');
    const targetIdx = target ? Number(target.dataset.idx) : null;
    updateLinkHoverTarget(Number.isFinite(targetIdx) && targetIdx !== linkDragState.sourceIdx ? targetIdx : null);
  }

  function commitLinkDrag(targetIdx) {
    if (!linkDragState) return;
    const sourceIdx = linkDragState.sourceIdx;
    linkDragState = null;
    updateLinkHoverTarget(null);
    removeLinkPreviewElement();
    if (sourceIdx === targetIdx || targetIdx === null || targetIdx === undefined) {
      renderGrid();
      return;
    }
    if (addDependency(sourceIdx, targetIdx)) {
      updateJSON();
    }
    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    vgrid.innerHTML = '';
    links.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'header';
    const monthRow = document.createElement('div');
    monthRow.className = 'month-row';
    const dayRow = document.createElement('div');
    dayRow.className = 'day-row';

    let monthRunLabel = null;
    let monthRunCount = 0;
    const flushMonthRun = () => {
      if (!monthRunLabel || monthRunCount < 1) return;
      const monthCell = document.createElement('div');
      monthCell.className = 'month-cell';
      monthCell.style.width = (monthRunCount * colWidth) + 'px';
      monthCell.textContent = monthRunLabel;
      monthRow.appendChild(monthCell);
      monthRunLabel = null;
      monthRunCount = 0;
    };

    for (let d = 0; d < daysVisible; d++) {
      const date = new Date(viewStart.getTime() + d * dayMs);
      const monthLabel = formatMonthLabel(date);
      if (monthRunLabel === null) {
        monthRunLabel = monthLabel;
        monthRunCount = 1;
      } else if (monthRunLabel === monthLabel) {
        monthRunCount += 1;
      } else {
        flushMonthRun();
        monthRunLabel = monthLabel;
        monthRunCount = 1;
      }

      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';
      dayCell.style.width = colWidth + 'px';
      dayCell.textContent = `${date.getDate()}\n${formatWeekdayShort(date)}`;
      dayRow.appendChild(dayCell);

      const line = document.createElement('div');
      line.className = 'v';
      line.style.left = (d * colWidth) + 'px';
      vgrid.appendChild(line);
      if (date.getDay() === 1) line.style.background = 'rgba(0,0,0,0.12)';
    }
    flushMonthRun();
    header.appendChild(monthRow);
    header.appendChild(dayRow);
    grid.appendChild(header);

    tasks.forEach((t, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.height = rowHeight + 'px';
      row.dataset.idx = idx;

      const label = document.createElement('div');
      label.className = 'row-label';
      const badge = document.createElement('div');
      badge.className = 'task-number';
      badge.textContent = String(idx + 1);
      label.appendChild(badge);

      const meta = document.createElement('div');
      meta.className = 'task-meta';

      const title = document.createElement('div');
      title.className = 'task-title';
      title.textContent = t.name || `Task ${idx+1}`;
      meta.appendChild(title);

      const details = document.createElement('div');
      details.className = 'task-details';
      details.textContent = `Start: ${t.start}  Finish: ${t.finish || t.start}  Duration: ${t.duration} day${t.duration === 1 ? '' : 's'}`;
      meta.appendChild(details);

      const progressText = document.createElement('div');
      progressText.className = 'task-details';
      progressText.textContent = `Progress: ${progressLabel(t.progress)}`;
      meta.appendChild(progressText);

      const depsText = document.createElement('div');
      depsText.className = 'task-deps';
      depsText.textContent = t.deps && t.deps.length ? `Depends on: ${taskDepsToNumbers(t)}` : 'Depends on: none';
      meta.appendChild(depsText);

      label.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'task-actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'small';
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(idx); });
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'small';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete task?')) return;
        const removedId = tasks[idx].id;
        tasks.splice(idx,1);
        tasks.forEach((task) => {
          task.deps = (task.deps || []).filter((dep) => String(dep) !== String(removedId));
        });
        renderGrid();
        updateJSON();
      });
      actions.appendChild(delBtn);

      label.appendChild(actions);

      const reorderHandle = document.createElement('div');
      reorderHandle.className = 'reorder-handle';
      reorderHandle.title = 'Drag to reorder task';
      reorderHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        reorderDragState = { sourceIdx: idx, dropIdx: idx };
        ensureReorderIndicatorElement();
        updateReorderIndicator(e.clientX, e.clientY);
        document.body.style.userSelect = 'none';
      });
      label.insertBefore(reorderHandle, label.firstChild);

      row.appendChild(label);

      const rowArea = document.createElement('div');
      rowArea.style.position = 'relative';
      rowArea.style.flex = '1';
      rowArea.style.minWidth = (daysVisible*colWidth)+'px';
      rowArea.style.height = rowHeight+'px';
      row.appendChild(rowArea);

      const bar = document.createElement('div');
      bar.className = 'task-bar';
      bar.style.background = '#eef2f7';
      bar.style.color = '#111827';
      const startOffset = Math.round((parseLocalDate(t.start) - viewStart)/dayMs);
      bar.style.left = (startOffset * colWidth + 4) + 'px';
      bar.style.width = (t.duration * colWidth - 8) + 'px';
      bar.style.top = '18px';
      bar.dataset.idx = idx;
      if (linkDragState && linkDragState.sourceIdx === idx) {
        bar.classList.add('drag-link-source');
      }

      const fill = document.createElement('div');
      fill.className = 'task-bar-fill';
      fill.style.background = t.color || '#1f77b4';
      fill.style.width = `${clampProgress(t.progress)}%`;
      bar.appendChild(fill);

      const barLabel = document.createElement('span');
      barLabel.className = 'task-bar-label';
      barLabel.textContent = t.name;
      bar.appendChild(barLabel);

      const pct = document.createElement('span');
      pct.className = 'task-bar-progress';
      pct.textContent = progressLabel(t.progress);
      bar.appendChild(pct);

      const linkHandle = document.createElement('div');
      linkHandle.className = 'link-handle';
      linkHandle.title = 'Drag to another task to create a dependency';
      linkHandle.dataset.idx = idx;
      linkHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        linkDragState = { sourceIdx: idx, currentX: e.clientX, currentY: e.clientY };
        const sourceBar = grid.querySelector(`.task-bar[data-idx="${idx}"]`);
        if (sourceBar) sourceBar.classList.add('drag-link-source');
        ensureLinkPreviewElement();
        updateLinkPreview(e.clientX, e.clientY);
        document.body.style.userSelect = 'none';
      });
      bar.appendChild(linkHandle);

      const res = document.createElement('div');
      res.className = 'resizer';
      bar.appendChild(res);
      rowArea.appendChild(bar);

      grid.appendChild(row);
    });

    renderDependencyLinks();
    if (linkDragState) {
      ensureLinkPreviewElement();
      updateLinkPreview(linkDragState.currentX, linkDragState.currentY);
    } else {
      removeLinkPreviewElement();
    }

    if (reorderDragState) {
      ensureReorderIndicatorElement();
      if (Number.isInteger(reorderDragState.dropIdx)) {
        const rows = [...grid.querySelectorAll('.row')];
        const targetRow = rows[Math.max(0, Math.min(rows.length - 1, reorderDragState.dropIdx > reorderDragState.sourceIdx ? reorderDragState.dropIdx - 1 : reorderDragState.dropIdx))];
        if (targetRow) {
          const rect = targetRow.getBoundingClientRect();
          const gridRect = grid.getBoundingClientRect();
          const top = reorderDragState.dropIdx > reorderDragState.sourceIdx ? rect.bottom - gridRect.top : rect.top - gridRect.top;
          reorderIndicatorEl.style.display = 'block';
          reorderIndicatorEl.style.top = `${Math.max(0, top)}px`;
          reorderIndicatorEl.style.left = '0';
          reorderIndicatorEl.style.right = '0';
        }
      }
    } else {
      removeReorderIndicatorElement();
    }

    grid.style.minWidth = (daysVisible*colWidth + leftWidth) + 'px';
    vgrid.style.left = leftWidth + 'px';
    vgrid.style.width = (daysVisible*colWidth) + 'px';
    links.setAttribute('width', daysVisible*colWidth + leftWidth);
    links.setAttribute('height', headerHeight + tasks.length*rowHeight + footerHeight);
  }

  function taskBarMetrics(task, idx, dayStart = 0, dayEnd = daysVisible, bodyTop = headerHeight) {
    const startDate = parseLocalDate(task.start);
    if (!startDate) return null;
    const duration = Math.max(1, Number(task.duration) || 1);
    const startOffset = Math.round((startDate - viewStart) / dayMs);
    const endOffset = startOffset + duration - 1;
    const visibleStart = Math.max(startOffset, dayStart);
    const visibleEnd = Math.min(endOffset, dayEnd - 1);
    const rowTop = bodyTop + idx * rowHeight;
    const barY = rowTop + 18;
    const barCenterY = barY + barHeight / 2;
    const barStartX = leftWidth + visibleStart * colWidth + 4;
    const barEndX = leftWidth + (visibleEnd + 1) * colWidth - 4;
    return {
      startOffset,
      endOffset,
      visibleStart,
      visibleEnd,
      rowTop,
      barY,
      barCenterY,
      barStartX,
      barEndX,
    };
  }

  function renderDependencyLinks() {
    const totalWidth = leftWidth + daysVisible * colWidth;
    const totalHeight = headerHeight + tasks.length * rowHeight + footerHeight;
    links.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    links.setAttribute('width', totalWidth);
    links.setAttribute('height', totalHeight);
    links.innerHTML = `
      <defs>
        <marker id="depArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 z" fill="#6b7280"></path>
        </marker>
      </defs>
    `;

    const idToIndex = new Map(tasks.map((task, idx) => [String(task.id), idx]));
    tasks.forEach((task, targetIdx) => {
      const target = taskBarMetrics(task, targetIdx);
      if (!target) return;
      (task.deps || []).forEach((depId) => {
        const sourceIdx = idToIndex.get(String(depId));
        if (sourceIdx === undefined || sourceIdx === targetIdx) return;
        const sourceTask = tasks[sourceIdx];
        const source = taskBarMetrics(sourceTask, sourceIdx);
        if (!source) return;

        const sx = source.barStartX;
        const sy = source.barCenterY;
        const tx = target.barStartX;
        const ty = target.barCenterY;
        const bendX = Math.min(sx, tx) - 18;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${sx} ${sy} H ${bendX} V ${ty} H ${tx}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#6b7280');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('marker-end', 'url(#depArrow)');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        links.appendChild(path);
      });
    });
  }

  function drawDependencyArrows(ctx, tile) {
    const idToIndex = new Map(tasks.map((task, idx) => [String(task.id), idx]));
    ctx.save();
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.lineWidth = 1.6;
    tasks.forEach((task, targetIdx) => {
      if (targetIdx < tile.rowStart || targetIdx >= tile.rowEnd) return;
      const target = taskBarMetrics(task, targetIdx, tile.dayStart, tile.dayEnd, headerHeight + tile.metaHeight);
      if (!target) return;
      (task.deps || []).forEach((depId) => {
        const sourceIdx = idToIndex.get(String(depId));
        if (sourceIdx === undefined || sourceIdx === targetIdx) return;
        if (sourceIdx < tile.rowStart || sourceIdx >= tile.rowEnd) return;
        const sourceTask = tasks[sourceIdx];
        const source = taskBarMetrics(sourceTask, sourceIdx, tile.dayStart, tile.dayEnd, headerHeight + tile.metaHeight);
        if (!source) return;
        const sx = source.barStartX;
        const sy = source.barCenterY;
        const tx = target.barStartX;
        const ty = target.barCenterY;
        const bendX = Math.min(sx, tx) - 18;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(bendX, sy);
        ctx.lineTo(bendX, ty);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        const arrowSize = 6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - arrowSize, ty - arrowSize / 2);
        ctx.lineTo(tx - arrowSize, ty + arrowSize / 2);
        ctx.closePath();
        ctx.fill();
      });
    });
    ctx.restore();
  }

  function addTask(name, startDateStr, finishDateStr, color, progress) {
    const t = createTask({ name, start: startDateStr, finish: finishDateStr, color, progress });
    tasks.push(t);
    normalizeViewToInclude(t);
    renderGrid();
  }

  function openEditModal(idx) {
    editingIdx = idx;
    const t = tasks[idx];
    modalName.value = t.name;
    modalStart.value = t.start;
    modalFinish.value = t.finish || t.start;
    modalDuration.value = t.duration;
    modalProgress.value = clampProgress(t.progress);
    modalDeps.value = taskDepsToNumbers(t);
    modalColor.value = t.color;
    editModal.style.display = 'block';
    refreshModalDuration();
    modalBackdrop.focus();
  }

  function closeEditModal() { editingIdx = null; editModal.style.display = 'none'; }

  modalCancel.addEventListener('click', () => closeEditModal());
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeEditModal(); });

  function refreshModalDuration() {
    const start = parseLocalDate(modalStart.value);
    const finish = parseLocalDate(modalFinish.value);
    const duration = durationFromStartFinish(start, finish);
    if (!Number.isFinite(duration) || duration < 1) {
      modalDuration.value = '';
      return;
    }
    modalDuration.value = String(duration);
  }

  function refreshModalFinishFromDuration() {
    const start = parseLocalDate(modalStart.value);
    const duration = parseInt(modalDuration.value, 10);
    if (!start || !Number.isFinite(duration) || duration < 1) {
      modalFinish.value = '';
      return;
    }
    modalFinish.value = localDateString(addDaysLocal(start, duration - 1));
  }

  modalStart.addEventListener('input', () => {
    const start = parseLocalDate(modalStart.value);
    const duration = parseInt(modalDuration.value, 10);
    const finish = parseLocalDate(modalFinish.value);
    if (start && Number.isFinite(duration) && duration > 0) {
      modalFinish.value = localDateString(addDaysLocal(start, duration - 1));
    } else if (start && finish) {
      modalDuration.value = String(durationFromStartFinish(start, finish) || '');
    }
    refreshModalDuration();
  });
  modalFinish.addEventListener('input', refreshModalDuration);
  modalDuration.addEventListener('input', () => {
    refreshModalFinishFromDuration();
    refreshModalDuration();
  });

  modalSave.addEventListener('click', () => {
    if (editingIdx === null) return closeEditModal();
    const name = modalName.value.trim() || 'Task';
    const start = modalStart.value;
    const finish = modalFinish.value;
    const duration = parseInt(modalDuration.value, 10);
    const progress = clampProgress(modalProgress.value);
    const deps = parseDepsInput(modalDeps.value);
    const color = modalColor.value || '#1f77b4';
    if (!start || !parseLocalDate(start)) { alert('Invalid start date'); return; }
    if (!finish || !parseLocalDate(finish)) { alert('Invalid finish date'); return; }
    if (parseLocalDate(finish) < parseLocalDate(start)) { alert('Finish must be on or after start'); return; }
    if (!Number.isFinite(duration) || duration < 1) { alert('Duration must be >= 1'); return; }
    const t = tasks[editingIdx];
    t.name = name;
    t.start = start;
    t.finish = finish;
    t.color = color;
    t.progress = progress;
    t.deps = deps;
    syncTaskDates(t);
    normalizeViewToInclude(t);
    closeEditModal();
    renderGrid();
    updateJSON();
  });

  function normalizeViewToInclude(t) {
    const s = parseLocalDate(t.start);
    if (!s) return;
    const e = addDaysLocal(s, Math.max(1, Number(t.duration) || 1) - 1);
    if (s < viewStart) viewStart = new Date(s.getTime() - 3*dayMs);
    const endVisible = new Date(viewStart.getTime() + (daysVisible-1)*dayMs);
    if (e > endVisible) {
      const extraDays = Math.ceil((e - endVisible)/dayMs) + 3;
      daysVisible += extraDays;
    }
  }

  function extractBalancedArray(text, key) {
    const keyIndex = text.indexOf(`"${key}"`);
    if (keyIndex < 0) return '';
    const start = text.indexOf('[', keyIndex);
    if (start < 0) return '';
    let inString = false;
    let escaped = false;
    let depth = 0;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '[') depth += 1;
      if (ch === ']') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return '';
  }

  function extractObjectBlocks(arrayText) {
    const blocks = [];
    let inString = false;
    let escaped = false;
    let depth = 0;
    let blockStart = -1;
    for (let i = 0; i < arrayText.length; i += 1) {
      const ch = arrayText[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) blockStart = i;
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0 && blockStart >= 0) {
          blocks.push(arrayText.slice(blockStart, i + 1));
          blockStart = -1;
        }
      }
    }
    return blocks;
  }

  function readLooseString(block, key) {
    const match = block.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!match) return null;
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1];
    }
  }

  function readLooseValue(block, key) {
    const match = block.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\n\\r]+)`));
    if (!match) return null;
    const value = match[1].trim();
    if (!value || value === 'null') return null;
    return value;
  }

  function parseLooseDeps(block) {
    const depsMatch = block.match(/"deps"\s*:\s*\[([\s\S]*?)\]/);
    if (!depsMatch) return [];
    return depsMatch[1]
      .split(/[,\s]+/)
      .map((token) => token.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }

  function repairBrokenProjectJson(text) {
    const project = {
      name: 'Untitled Project',
      start: localDateString(new Date()),
    };
    const projectNameMatch = text.match(/"project"\s*:\s*\{[\s\S]*?"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const projectStartMatch = text.match(/"project"\s*:\s*\{[\s\S]*?"start"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const projectName = projectNameMatch ? JSON.parse(`"${projectNameMatch[1]}"`) : null;
    const projectStart = projectStartMatch ? JSON.parse(`"${projectStartMatch[1]}"`) : null;
    if (projectName) project.name = projectName;
    if (projectStart) project.start = projectStart;

    const arrayText = extractBalancedArray(text, 'tasks');
    const rawBlocks = arrayText ? extractObjectBlocks(arrayText) : [];
    const tasksData = rawBlocks.map((block) => {
      const raw = {
        id: null,
        name: readLooseString(block, 'name') || 'Task',
        start: readLooseString(block, 'start') || project.start,
        finish: readLooseString(block, 'finish') || null,
        duration: null,
        progress: 0,
        color: readLooseString(block, 'color') || '#1f77b4',
        deps: parseLooseDeps(block),
      };
      const idValue = readLooseValue(block, 'id');
      if (idValue != null) {
        const parsedId = Number(idValue);
        raw.id = Number.isFinite(parsedId) ? parsedId : idValue;
      }
      const durationValue = readLooseValue(block, 'duration');
      if (durationValue != null) {
        const parsedDuration = Number(durationValue);
        if (Number.isFinite(parsedDuration) && parsedDuration > 0) raw.duration = parsedDuration;
      }
      const progressValue = readLooseValue(block, 'progress');
      if (progressValue != null) {
        const parsedProgress = Number(progressValue);
        if (Number.isFinite(parsedProgress)) raw.progress = parsedProgress;
      }
      return createTask(raw);
    });

    const idLookup = new Map(tasksData.map((task) => [String(task.id), task.id]));
    tasksData.forEach((task) => {
      task.deps = (Array.isArray(task.deps) ? task.deps : [])
        .map((dep) => {
          if (idLookup.has(String(dep))) return idLookup.get(String(dep));
          const number = Number(dep);
          if (Number.isInteger(number) && number >= 1 && number <= tasksData.length) return tasksData[number - 1].id;
          return null;
        })
        .filter((dep) => dep != null && dep !== task.id);
    });

    return { project, tasks: tasksData };
  }

  async function rewriteOpenFileFromCurrentState() {
    if (!fileHandle || !fileHandle.createWritable) return;
    const payload = serializeJSON();
    if (fileHandle.requestPermission) {
      const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return;
    }
    const writable = await fileHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    fileWritable = true;
    fileNameSpan.textContent = fileHandle.name || 'Saved file';
  }

  function resetProject() {
    tasks = [];
    editingIdx = null;
    linkDragState = null;
    linkHoverTargetIdx = null;
    reorderDragState = null;
    projectName = 'Untitled Project';
    projectStart = localDateString(new Date());
    viewStart = new Date(`${projectStart}T00:00:00`);
    viewStart = new Date(viewStart.getTime() - 3 * dayMs);
    daysVisible = 40;
    colWidth = 40;
    projectNameIn.value = projectName;
    projectStartIn.value = projectStart;
    taskNameIn.value = '';
    finishIn.value = projectStart;
    durationIn.value = '1';
    colorIn.value = '#1f77b4';
    progressIn.value = '0';
    startIn.value = projectStart;
    fileHandle = null;
    fileWritable = false;
    fileNameSpan.textContent = 'No file';
    removeLinkPreviewElement();
    removeReorderIndicatorElement();
    renderGrid();
    updateJSON();
  }

  // drag & resize
  let dragState = null;
  canvas.addEventListener('mousedown', (ev) => {
    if (linkDragState || reorderDragState) return;
    if (ev.target.closest('.reorder-handle')) return;
    const bar = ev.target.closest('.task-bar');
    const res = ev.target.closest('.resizer');
    if (!bar) return;
    ev.preventDefault();
    const idx = Number(bar.dataset.idx);
    const startX = ev.clientX;
    const origLeft = parseFloat(bar.style.left);
    const origWidth = parseFloat(bar.style.width);
    if (res && ev.button === 0) {
      dragState = { type: 'resize', idx, startX, origWidth };
    } else if (ev.button === 0) {
      dragState = { type: 'move', idx, startX, origLeft };
    }
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (ev) => {
    if (reorderDragState) {
      updateReorderIndicator(ev.clientX, ev.clientY);
      return;
    }
    if (linkDragState) {
      linkDragState.currentX = ev.clientX;
      linkDragState.currentY = ev.clientY;
      updateLinkPreview(ev.clientX, ev.clientY);
      return;
    }
    if (!dragState) return;
    const bar = grid.querySelector('.task-bar[data-idx="'+dragState.idx+'"]');
    if (!bar) return;
    const deltaPx = ev.clientX - dragState.startX;
    if (dragState.type === 'move') {
      let newLeft = dragState.origLeft + deltaPx;
      newLeft = Math.round(newLeft / colWidth) * colWidth;
      if (newLeft < 4) newLeft = 4;
      bar.style.left = newLeft + 'px';
    } else if (dragState.type === 'resize') {
      let newWidth = dragState.origWidth + deltaPx;
      newWidth = Math.round(newWidth / colWidth) * colWidth;
      if (newWidth < colWidth - 8) newWidth = colWidth - 8;
      bar.style.width = newWidth + 'px';
    }
  });

  window.addEventListener('mouseup', (ev) => {
    if (reorderDragState) {
      document.body.style.userSelect = '';
      commitReorderDrag();
      return;
    }
    if (linkDragState) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.task-bar');
      const targetIdx = target ? Number(target.dataset.idx) : null;
      document.body.style.userSelect = '';
      commitLinkDrag(Number.isFinite(targetIdx) ? targetIdx : null);
      return;
    }
    if (!dragState) return;
    const bar = grid.querySelector('.task-bar[data-idx="'+dragState.idx+'"]');
    if (!bar) { dragState = null; document.body.style.userSelect = ''; return; }
    const idx = dragState.idx;
    if (dragState.type === 'move') {
      const left = parseFloat(bar.style.left);
      const dayOffset = Math.round((left - 4) / colWidth);
      const newStart = new Date(viewStart.getTime() + dayOffset*dayMs);
      tasks[idx].start = localDateString(newStart);
    } else if (dragState.type === 'resize') {
      const width = parseFloat(bar.style.width);
      const newDuration = Math.round((width + 8) / colWidth);
      tasks[idx].duration = Math.max(1, newDuration);
    }
    syncTaskDates(tasks[idx]);
    dragState = null;
    document.body.style.userSelect = '';
    renderGrid();
    updateJSON();
  });

  function updateJSON() {
    syncProjectFields();
    jsonOut.value = serializeJSON();
  }

  function serializeJSON() {
    syncProjectFields();
    const out = {
      project: {
        name: projectName,
        start: projectStart,
      },
      tasks: tasks.map((task) => {
        const normalized = syncTaskDates(task);
        return {
          id: normalized.id,
          name: normalized.name,
          start: normalized.start,
          finish: normalized.finish,
          duration: normalized.duration,
          progress: clampProgress(normalized.progress),
          color: normalized.color,
          deps: Array.isArray(normalized.deps) ? normalized.deps : [],
        };
      }),
    };
    return JSON.stringify(out, null, 2);
  }

  addBtn.addEventListener('click', () => {
    const name = taskNameIn.value || 'Task';
    const start = startIn.value || todayISO;
    const finish = finishIn.value || start;
    const progress = clampProgress(progressIn.value);
    const color = colorIn.value || '#1f77b4';
    addTask(name, start, finish, color, progress);
    updateJSON();
    taskNameIn.value = '';
  });

  function refreshNewTaskDuration() {
    const start = parseLocalDate(startIn.value);
    const finish = parseLocalDate(finishIn.value);
    const duration = durationFromStartFinish(start, finish);
    durationIn.value = Number.isFinite(duration) && duration > 0 ? String(duration) : '';
  }

  startIn.addEventListener('input', refreshNewTaskDuration);
  finishIn.addEventListener('input', refreshNewTaskDuration);

  // start with a blank project
  resetProject();
  refreshNewTaskDuration();

  newFile.addEventListener('click', () => {
    if (tasks.length || (jsonOut.value || '').trim()) {
      const ok = confirm('Create a new blank project? Unsaved changes will be cleared.');
      if (!ok) return;
    }
    resetProject();
  });

  // Zoom
  zoomIn.addEventListener('click', () => { colWidth = Math.min(80, colWidth + 8); renderGrid(); });
  zoomOut.addEventListener('click', () => { colWidth = Math.max(20, colWidth - 8); renderGrid(); });

  // PNG export.
  function getPngPageDays() {
    const parsed = parseInt(pngPageDays.value, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 30;
  }

  exportPng.addEventListener('click', async () => {
    updateJSON();
    try {
      await window.GanttExport.exportPng({
        canvas,
        tasks,
        viewStart,
        daysVisible,
        colWidth,
        rowHeight,
        projectName,
        projectStart,
        leftWidth,
        monthHeaderHeight,
        dayHeaderHeight,
        headerHeight,
        footerHeight,
        metaHeight: 34,
        barHeight,
        dayMs,
        pageDayLimit: getPngPageDays(),
      });
    } catch (err) {
      console.error(err);
      alert(`PNG export failed: ${err?.message || err}`);
    }
  });

  exportPdf.addEventListener('click', async () => {
    updateJSON();
    try {
      await window.GanttExport.exportPdf({
        canvas,
        tasks,
        viewStart,
        daysVisible,
        colWidth,
        rowHeight,
        projectName,
        projectStart,
        leftWidth,
        monthHeaderHeight,
        dayHeaderHeight,
        headerHeight,
        footerHeight,
        metaHeight: 34,
        barHeight,
        dayMs,
        pageDayLimit: getPngPageDays(),
      });
    } catch (err) {
      console.error(err);
      alert(`PDF export failed: ${err?.message || err}`);
    }
  });
  
  // --- File System Access API helpers ---
  const supportsFS = 'showOpenFilePicker' in window || 'showSaveFilePicker' in window || window.chooseFileSystemEntries;
  async function openFileWithFS() {
    try {
      // modern API
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: {'application/json':['.json']} }], multiple: false });
        if (!handle) return;
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        loadFromText(text);
        if (lastLoadRepaired) await rewriteOpenFileFromCurrentState();
        fileNameSpan.textContent = handle.name || 'Opened file';
        fileWritable = true;
      } else if (window.chooseFileSystemEntries) {
        // older origin trial API
        const handle = await window.chooseFileSystemEntries({ type: 'open-file', accepts: [{ description: 'JSON', extensions: ['json'], mimeTypes: ['application/json'] }] });
        if (!handle) return;
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        loadFromText(text);
        if (lastLoadRepaired) await rewriteOpenFileFromCurrentState();
        fileNameSpan.textContent = handle.name || 'Opened file';
        fileWritable = true;
      } else {
        // fallback to input element
        fileInput.click();
      }
    } catch (err) {
      console.error(err);
      alert('Could not open file.');
    }
  }

  async function saveToFileHandle() {
    try {
      const payload = serializeJSON();
      jsonOut.value = payload;
      if (!fileHandle) {
        if (window.showSaveFilePicker) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: 'gantt.json',
            types: [{ description: 'JSON', accept: {'application/json': ['.json']} }]
          });
        } else if (window.chooseFileSystemEntries) {
          fileHandle = await window.chooseFileSystemEntries({ type: 'save-file', accepts: [{ description: 'JSON', extensions: ['json'], mimeTypes: ['application/json'] }], suggestedName: 'gantt.json' });
        } else {
          downloadJSON();
          return;
        }
      }
      if (fileHandle.requestPermission) {
        const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          throw new Error('Permission to save was denied.');
        }
      }
      // write
      if (fileHandle.createWritable) {
        const writable = await fileHandle.createWritable();
        await writable.write(payload);
        await writable.close();
      } else if (fileHandle.createWriter) {
        const writer = await fileHandle.createWriter();
        await writer.truncate(0);
        await writer.write(0, payload);
        await writer.close();
      } else {
        // fallback download
        downloadJSON();
        return;
      }
      fileNameSpan.textContent = fileHandle.name || 'Saved file';
      fileWritable = true;
      alert('Saved.');
    } catch (err) {
      console.error(err);
      try {
        downloadJSON();
      } catch (downloadErr) {
        console.error(downloadErr);
        alert(`Save failed: ${err?.message || err}`);
      }
    }
  }

  function downloadJSON() {
    const payload = serializeJSON();
    jsonOut.value = payload;
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gantt.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadFromText(text) {
    lastLoadRepaired = false;
    try {
      const data = JSON.parse(text);
      const source = Array.isArray(data) ? { tasks: data } : (data || {});
      projectName = (source.project && source.project.name) ? String(source.project.name) : projectName;
      projectStart = (source.project && source.project.start) ? String(source.project.start) : projectStart;
      projectNameIn.value = projectName;
      projectStartIn.value = projectStart;
      tasks = (Array.isArray(source.tasks) ? source.tasks : []).map((d) => createTask(d));
      const idLookup = new Map(tasks.map((task) => [String(task.id), task.id]));
      tasks.forEach((task) => {
        task.deps = (Array.isArray(task.deps) ? task.deps : [])
          .map((dep) => {
            if (idLookup.has(String(dep))) return idLookup.get(String(dep));
            const number = Number(dep);
            if (Number.isInteger(number) && number >= 1 && number <= tasks.length) return tasks[number - 1].id;
            return null;
          })
          .filter((dep) => dep != null && dep !== task.id);
      });
      tasks.forEach((task) => syncTaskDates(task));
      if (tasks.length) {
        computeViewStart();
        const minVisible = tasks.reduce((m, t) => Math.max(m, parseLocalDate(t.finish).getTime() - viewStart.getTime()), 0);
        daysVisible = Math.max(30, Math.ceil(minVisible / dayMs) + 5);
      } else {
        computeViewStart();
      }
      renderGrid(); updateJSON();
      lastLoadRepaired = false;
    } catch (err) {
      try {
        const repaired = repairBrokenProjectJson(text);
        projectName = repaired.project.name;
        projectStart = repaired.project.start;
        projectNameIn.value = projectName;
        projectStartIn.value = projectStart;
        tasks = repaired.tasks;
        tasks.forEach((task) => syncTaskDates(task));
        if (tasks.length) {
          computeViewStart();
          const minVisible = tasks.reduce((m, t) => {
            const finish = parseLocalDate(t.finish) || parseLocalDate(t.start);
            if (!finish) return m;
            return Math.max(m, finish.getTime() - viewStart.getTime());
          }, 0);
          daysVisible = Math.max(30, Math.ceil(minVisible / dayMs) + 5);
        } else {
          computeViewStart();
        }
        lastLoadRepaired = true;
        renderGrid();
        updateJSON();
        alert('The JSON file was malformed, so it was repaired automatically.');
      } catch (repairErr) {
        console.error(repairErr);
        alert('Invalid JSON file.');
      }
    }
  }

  openFile.addEventListener('click', openFileWithFS);
  saveFile.addEventListener('click', async () => {
    updateJSON();
    await saveToFileHandle();
  });

  projectNameIn.addEventListener('input', () => {
    syncProjectFields();
    updateJSON();
    if (tasks.length) renderGrid();
  });
  projectStartIn.addEventListener('input', () => {
    syncProjectFields();
    computeViewStart();
    updateJSON();
    if (tasks.length) renderGrid();
  });

  // If user loads via fallback file input, clear stored handle
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadFromText(reader.result);
      fileHandle = null;
      fileNameSpan.textContent = 'Loaded from upload';
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  // keyboard/listeners and other interactions kept the same as previous version
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && linkDragState) {
      linkDragState = null;
      updateLinkHoverTarget(null);
      removeLinkPreviewElement();
      document.body.style.userSelect = '';
      renderGrid();
      return;
    }
    if (e.key === 'ArrowLeft') { viewStart = new Date(viewStart.getTime() - 5*dayMs); renderGrid(); }
    if (e.key === 'ArrowRight') { viewStart = new Date(viewStart.getTime() + 5*dayMs); renderGrid(); }
  });
