(() => {
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fitText(ctx, text, maxWidth) {
    const str = String(text ?? '');
    if (ctx.measureText(str).width <= maxWidth) return str;
    const ellipsis = '...';
    if (ctx.measureText(ellipsis).width >= maxWidth) return ellipsis;
    let end = str.length;
    while (end > 0) {
      const candidate = `${str.slice(0, end)}${ellipsis}`;
      if (ctx.measureText(candidate).width <= maxWidth) return candidate;
      end -= 1;
    }
    return ellipsis;
  }

  function drawCenteredText(ctx, text, x, y, width) {
    const str = String(text ?? '');
    ctx.fillText(str, x + width / 2, y);
  }

  function formatWeekdayShort(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function getHeaderHeights(state) {
    const monthHeaderHeight = state.monthHeaderHeight ?? 22;
    const dayHeaderHeight = state.dayHeaderHeight ?? Math.max(18, (state.headerHeight ?? 52) - monthHeaderHeight);
    return {
      monthHeaderHeight,
      dayHeaderHeight,
      headerHeight: monthHeaderHeight + dayHeaderHeight,
    };
  }

  function getPageDayLimit(state) {
    const parsed = Number(state.pageDayLimit);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 30;
  }

  function buildPageTiles(state) {
    const pageDayLimit = getPageDayLimit(state);
    const totalPages = Math.max(1, Math.ceil(state.daysVisible / pageDayLimit));
    const tiles = [];
    for (let page = 0; page < totalPages; page += 1) {
      const dayStart = page * pageDayLimit;
      const dayEnd = Math.min(dayStart + pageDayLimit, state.daysVisible);
      tiles.push({
        index: page,
        total: totalPages,
        dayStart,
        dayEnd,
        dayCount: Math.max(0, dayEnd - dayStart),
        pageDayCount: pageDayLimit,
      });
    }
    return tiles;
  }

  function taskBarMetrics(task, idx, state, dayStart = 0, dayEnd = state.daysVisible, bodyTop = 0) {
    const startDate = parseLocalDate(task.start);
    if (!startDate) return null;
    const duration = Math.max(1, Number(task.duration) || 1);
    const startOffset = Math.round((startDate - state.viewStart) / state.dayMs);
    const endOffset = startOffset + duration - 1;
    const visibleStart = Math.max(startOffset, dayStart);
    const visibleEnd = Math.min(endOffset, dayEnd - 1);
    const rowTop = bodyTop + idx * state.rowHeight;
    const barY = rowTop + 18;
    const barCenterY = barY + state.barHeight / 2;
    const barStartX = state.leftWidth + visibleStart * state.colWidth + 4;
    const barEndX = state.leftWidth + (visibleEnd + 1) * state.colWidth - 4;
    const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0)));
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
      progress,
    };
  }

  function drawDependencyArrows(ctx, state, dayStart = 0, dayEnd = state.daysVisible, bodyTop = 0) {
    const idToIndex = new Map(state.tasks.map((task, idx) => [String(task.id), idx]));
    ctx.save();
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.fillStyle = 'rgba(107, 114, 128, 0.85)';
    ctx.lineWidth = 1.6;
    state.tasks.forEach((task, targetIdx) => {
      const target = taskBarMetrics(task, targetIdx, state, dayStart, dayEnd, bodyTop);
      if (!target) return;
      (task.deps || []).forEach((depId) => {
        const sourceIdx = idToIndex.get(String(depId));
        if (sourceIdx === undefined || sourceIdx === targetIdx) return;
        const sourceTask = state.tasks[sourceIdx];
        const source = taskBarMetrics(sourceTask, sourceIdx, state, dayStart, dayEnd, bodyTop);
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

  function drawHeader(ctx, state, totalWidth, tile) {
    const { monthHeaderHeight, dayHeaderHeight, headerHeight } = getHeaderHeights(state);
    const bodyX = state.leftWidth;

    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, state.metaHeight, state.leftWidth, headerHeight);
    ctx.fillRect(0, state.metaHeight, totalWidth, monthHeaderHeight);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, state.metaHeight + monthHeaderHeight, totalWidth, dayHeaderHeight);

    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.leftWidth + 0.5, state.metaHeight);
    ctx.lineTo(state.leftWidth + 0.5, state.metaHeight + headerHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, state.metaHeight + monthHeaderHeight + 0.5);
    ctx.lineTo(totalWidth, state.metaHeight + monthHeaderHeight + 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, state.metaHeight + headerHeight + 0.5);
    ctx.lineTo(totalWidth, state.metaHeight + headerHeight + 0.5);
    ctx.stroke();

    ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Project Start: ${state.projectStart}`, 10, state.metaHeight / 2 - 6);
    ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(`Project: ${state.projectName}`, 10, state.metaHeight / 2 + 8);

    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let monthRunLabel = null;
    let monthRunCount = 0;
    const flushMonthRun = (slotIndex) => {
      if (!monthRunLabel || monthRunCount < 1) return;
      const startSlot = slotIndex - monthRunCount;
      const x = bodyX + startSlot * state.colWidth;
      const width = monthRunCount * state.colWidth;
      ctx.fillStyle = '#444';
      drawCenteredText(ctx, monthRunLabel, x, state.metaHeight + monthHeaderHeight / 2, width);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(x + 0.5, state.metaHeight + 0.5, width, monthHeaderHeight);
      monthRunLabel = null;
      monthRunCount = 0;
    };

    for (let slot = 0; slot < tile.pageDayCount; slot += 1) {
      const globalDay = tile.dayStart + slot;
      const hasDate = globalDay < state.daysVisible;
      const x = bodyX + slot * state.colWidth;
      const date = hasDate ? new Date(state.viewStart.getTime() + globalDay * state.dayMs) : null;
      const monthLabel = hasDate ? formatMonthLabel(date) : null;

      if (!hasDate) {
        flushMonthRun(slot);
      } else if (monthRunLabel === null) {
        monthRunLabel = monthLabel;
        monthRunCount = 1;
      } else if (monthRunLabel === monthLabel) {
        monthRunCount += 1;
      } else {
        flushMonthRun(slot);
        monthRunLabel = monthLabel;
        monthRunCount = 1;
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(x + 0.5, state.metaHeight + monthHeaderHeight + 0.5, state.colWidth, dayHeaderHeight);
      if (hasDate) {
        ctx.fillStyle = '#444';
        ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(String(date.getDate()), x + state.colWidth / 2, state.metaHeight + monthHeaderHeight + 11);
        ctx.fillStyle = '#666';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(formatWeekdayShort(date), x + state.colWidth / 2, state.metaHeight + monthHeaderHeight + 23);
      }

      ctx.strokeStyle = globalDay % 7 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, state.metaHeight);
      ctx.lineTo(x + 0.5, state.metaHeight + headerHeight);
      ctx.stroke();
    }
    flushMonthRun(tile.pageDayCount);
  }

  function drawTaskLabel(ctx, state, task, idx) {
    const y = idx * state.rowHeight;
    const even = idx % 2 === 1;
    ctx.fillStyle = even ? '#fbfbfb' : '#ffffff';
    ctx.fillRect(0, y, state.leftWidth, state.rowHeight);
    ctx.strokeStyle = '#e6e6e6';
    ctx.strokeRect(0.5, y + 0.5, state.leftWidth, state.rowHeight);

    const badgeX = 10;
    const badgeY = y + 12;
    const badgeW = 24;
    const badgeH = 24;
    ctx.fillStyle = '#111827';
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx + 1), badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

    const textX = 42;
    const textWidth = state.leftWidth - textX - 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111';
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(fitText(ctx, task.name || `Task ${idx + 1}`, textWidth), textX, y + 16);

    ctx.fillStyle = '#555';
    ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(fitText(ctx, `Start: ${task.start}`, textWidth), textX, y + 32);
    ctx.fillText(fitText(ctx, `Finish: ${task.finish || task.start}`, textWidth), textX, y + 46);

    ctx.fillStyle = '#6b7280';
    const depCount = task.deps && task.deps.length ? `${task.deps.length} dep${task.deps.length === 1 ? '' : 's'}` : 'no deps';
    const summary = `Duration: ${task.duration} day${Number(task.duration) === 1 ? '' : 's'}  Progress: ${Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0)))}%  ${depCount}`;
    ctx.fillText(fitText(ctx, summary, textWidth), textX, y + 60);
  }

  function renderMasterBodyCanvas(state) {
    const totalWidth = state.leftWidth + state.daysVisible * state.colWidth;
    const totalHeight = Math.max(1, state.tasks.length * state.rowHeight);
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, totalWidth, totalHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    for (let d = 0; d <= state.daysVisible; d += 1) {
      const x = state.leftWidth + d * state.colWidth;
      ctx.strokeStyle = d % 7 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, totalHeight);
      ctx.stroke();
    }

    ctx.strokeStyle = '#e6e6e6';
    for (let r = 0; r <= state.tasks.length; r += 1) {
      const y = r * state.rowHeight;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(totalWidth, y + 0.5);
      ctx.stroke();
    }

    if (!state.tasks.length) {
      ctx.fillStyle = '#666';
      ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No tasks loaded', totalWidth / 2, totalHeight / 2);
      return canvas;
    }

    ctx.save();
    state.tasks.forEach((task, idx) => drawTaskLabel(ctx, state, task, idx));
    ctx.restore();

    state.tasks.forEach((task, idx) => {
      const taskStartDate = parseLocalDate(task.start);
      if (!taskStartDate) return;
      const taskStartOffset = Math.round((taskStartDate - state.viewStart) / state.dayMs);
      const taskEndOffset = taskStartOffset + Math.max(1, Number(task.duration) || 1) - 1;
      const visibleStart = clamp(taskStartOffset, 0, state.daysVisible - 1);
      const visibleEnd = clamp(taskEndOffset, 0, state.daysVisible - 1);
      if (visibleStart > visibleEnd) return;

      const barX = state.leftWidth + visibleStart * state.colWidth + 4;
      const barWidth = (visibleEnd - visibleStart + 1) * state.colWidth - 8;
      const barY = idx * state.rowHeight + 18;
      const progressWidth = Math.max(0, Math.min(barWidth, Math.round(barWidth * (Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0))) / 100))));
      ctx.save();
      ctx.fillStyle = '#eef2f7';
      drawRoundedRect(ctx, barX, barY, barWidth, state.barHeight, 4);
      ctx.fill();
      ctx.beginPath();
      drawRoundedRect(ctx, barX, barY, barWidth, state.barHeight, 4);
      ctx.clip();
      ctx.fillStyle = task.color || '#1f77b4';
      ctx.fillRect(barX, barY, progressWidth, state.barHeight);
      ctx.restore();

      if (barWidth > 54) {
        ctx.fillStyle = '#111827';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(fitText(ctx, task.name || '', barWidth - 12), barX + 8, barY + state.barHeight / 2 + 0.5);
        ctx.textAlign = 'right';
        ctx.fillText(fitText(ctx, `${Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0)))}%`, 34), barX + barWidth - 8, barY + state.barHeight / 2 + 0.5);
      }
    });

    drawDependencyArrows(ctx, state);
    return canvas;
  }

  function renderPageCanvas(state, bodyCanvas, tile) {
    const { headerHeight } = getHeaderHeights(state);
    const pageWidth = state.leftWidth + tile.pageDayCount * state.colWidth;
    const bodyHeight = Math.max(1, state.tasks.length * state.rowHeight);
    const bodyY = state.metaHeight + headerHeight;
    const totalHeight = state.metaHeight + headerHeight + bodyHeight + state.footerHeight;
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, pageWidth, totalHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidth, totalHeight);

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, pageWidth, state.metaHeight);
    drawHeader(ctx, state, pageWidth, tile);

    if (bodyHeight > 0) {
      ctx.drawImage(bodyCanvas, 0, 0, state.leftWidth, bodyHeight, 0, bodyY, state.leftWidth, bodyHeight);
      const timelineWidth = tile.dayCount * state.colWidth;
      if (timelineWidth > 0) {
        ctx.drawImage(
          bodyCanvas,
          state.leftWidth + tile.dayStart * state.colWidth,
          0,
          timelineWidth,
          bodyHeight,
          state.leftWidth,
          bodyY,
          timelineWidth,
          bodyHeight,
        );
      }
    }

    if (tile.dayCount < tile.pageDayCount) {
      const blankX = state.leftWidth + tile.dayCount * state.colWidth;
      const blankWidth = (tile.pageDayCount - tile.dayCount) * state.colWidth;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(blankX, bodyY, blankWidth, bodyHeight);
    }

    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, totalHeight - state.footerHeight, pageWidth, state.footerHeight);
    ctx.strokeStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.moveTo(0, totalHeight - state.footerHeight + 0.5);
    ctx.lineTo(pageWidth, totalHeight - state.footerHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(`Project: ${state.projectName}`, 10, totalHeight - state.footerHeight / 2);
    ctx.textAlign = 'right';
    const dayStart = tile.dayStart + 1;
    const dayEnd = tile.dayEnd;
    const pageLabel = state.tasks.length
      ? `Days ${dayStart}-${dayEnd} of ${state.daysVisible} | Page ${tile.index + 1}/${tile.total}`
      : 'No tasks';
    ctx.fillText(pageLabel, pageWidth - 10, totalHeight - state.footerHeight / 2);
    return canvas;
  }

  function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
  }

  function encodeAscii(str) {
    return new TextEncoder().encode(str);
  }

  function concatBytes(chunks) {
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  function dataUrlToBytes(dataUrl) {
    const [, meta, payload] = String(dataUrl).match(/^data:([^,]+),(.+)$/) || [];
    if (!payload) throw new Error('Invalid data URL');
    if (meta && meta.endsWith(';base64')) {
      const bin = atob(payload);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }
    return encodeAscii(decodeURIComponent(payload));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async function saveBlobWithDialog(blob, suggestedName, acceptMime, acceptExt) {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: acceptMime, accept: { [acceptMime]: [acceptExt] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function savePageCanvasesAsPngs(pageCanvases, baseName) {
    const blobs = [];
    for (const pageCanvas of pageCanvases) {
      const blob = await canvasToBlob(pageCanvas, 'image/png');
      if (!blob) throw new Error('Failed to render PNG');
      blobs.push(blob);
    }

    if (pageCanvases.length === 1) {
      await saveBlobWithDialog(blobs[0], `${baseName}.png`, 'PNG image', '.png');
      return;
    }

    if (window.showDirectoryPicker) {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (let i = 0; i < blobs.length; i += 1) {
        const name = `${baseName}-${pad2(i + 1)}.png`;
        const fileHandle = await dirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blobs[i]);
        await writable.close();
      }
      return;
    }

    for (let i = 0; i < blobs.length; i += 1) {
      const url = URL.createObjectURL(blobs[i]);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-${pad2(i + 1)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function buildPdfBytesFromJpegs(images) {
    if (!images.length) throw new Error('No images to encode');
    const pageWidth = images[0].width;
    const pageHeight = images[0].height;
    const objects = [];
    const addObject = (bytes) => {
      objects.push(bytes);
      return objects.length;
    };

    const pageObjectNumbers = [];
    for (let i = 0; i < images.length; i += 1) {
      const imageObjNum = 3 + i * 3;
      const contentObjNum = imageObjNum + 1;
      const pageObjNum = imageObjNum + 2;
      pageObjectNumbers.push(pageObjNum);

      const image = images[i];
      const imageHeader = encodeAscii(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      );
      addObject(concatBytes([imageHeader, image.bytes, encodeAscii('\nendstream\nendobj\n')]));

      const contentStream = encodeAscii(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
      const contentHeader = encodeAscii(`<< /Length ${contentStream.length} >>\nstream\n`);
      addObject(concatBytes([contentHeader, contentStream, encodeAscii('endstream\nendobj\n')]));

      const pageDict = encodeAscii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`,
      );
      addObject(pageDict);
    }

    const kids = pageObjectNumbers.map((num) => `${num} 0 R`).join(' ');
    const pagesObj = encodeAscii(`<< /Type /Pages /Count ${images.length} /Kids [ ${kids} ] >>\nendobj\n`);
    const catalogObj = encodeAscii('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    const finalizedObjects = [catalogObj, pagesObj, ...objects];
    const header = encodeAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const chunks = [header];
    const offsets = [0];
    let offset = header.length;
    finalizedObjects.forEach((obj) => {
      offsets.push(offset);
      chunks.push(obj);
      offset += obj.length;
    });

    const xrefOffset = offset;
    const xrefLines = [`xref\n0 ${finalizedObjects.length + 1}\n`, '0000000000 65535 f \n'];
    for (let i = 1; i < offsets.length; i += 1) {
      xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    const xref = encodeAscii(xrefLines.join(''));
    const trailer = encodeAscii(
      `trailer\n<< /Size ${finalizedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );
    chunks.push(xref, trailer);
    return concatBytes(chunks);
  }

  async function exportPng(state) {
    const origScrollLeft = state.canvas.scrollLeft;
    state.canvas.scrollLeft = 0;
    try {
      const tiles = buildPageTiles(state);
      const bodyCanvas = renderMasterBodyCanvas(state);
      const pageCanvases = tiles.map((tile) => renderPageCanvas(state, bodyCanvas, tile));
      await savePageCanvasesAsPngs(pageCanvases, 'gantt');
    } catch (err) {
      console.error(err);
      alert(`PNG export failed: ${err?.message || err}`);
    } finally {
      state.canvas.scrollLeft = origScrollLeft;
    }
  }

  async function exportPdf(state) {
    const origScrollLeft = state.canvas.scrollLeft;
    state.canvas.scrollLeft = 0;
    try {
      const tiles = buildPageTiles(state);
      const bodyCanvas = renderMasterBodyCanvas(state);
      const pageCanvases = tiles.map((tile) => renderPageCanvas(state, bodyCanvas, tile));
      const images = [];
      for (const pageCanvas of pageCanvases) {
        const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
        images.push({
          bytes: dataUrlToBytes(dataUrl),
          width: pageCanvas.width,
          height: pageCanvas.height,
        });
      }
      const pdfBytes = buildPdfBytesFromJpegs(images);
      await saveBlobWithDialog(new Blob([pdfBytes], { type: 'application/pdf' }), 'gantt.pdf', 'PDF document', '.pdf');
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      state.canvas.scrollLeft = origScrollLeft;
    }
  }

  window.GanttExport = { exportPng, exportPdf };
})();
