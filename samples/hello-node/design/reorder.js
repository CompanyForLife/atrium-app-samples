/* COHO reorder script for Atrium apps. Version 0.5.1. Paste into its own <script> block unchanged, or link it: design.md section 11, Reorderable list.

   Makes every card__detail--step-list on the page reorderable by the card__detail--step-drag handle of its rows, the way
   COHO's workflow checklist is: a press on the handle and a few pixels of movement lift a translucent copy of the row that
   follows the pointer, the rows it passes slide out of its way, and on release the copy snaps into the gap. Mouse, touch
   and keyboard: focus a handle, Space or Enter picks the row up, the arrow keys move it, Space or Enter drops it, Escape
   puts it back. A list with one row cannot be reordered and its handle cell is kept empty, as COHO's is. A handle cell
   authored empty, as COHO renders a row that cannot be moved, is left alone: that row is neither focusable nor pickable,
   though the rows that can move still pass over it. Rows added or removed later need no further wiring.

   It adds the runtime classes Angular's CDK drag-drop adds: cdk-drop-list, cdk-drag and cdk-drag-handle when it wires a
   list, cdk-drag-preview, cdk-drag-placeholder and cdk-drag-animating while a row is dragged. So COHO's own drag rules in
   coho.css apply as they are. It writes no colour,
   border or shadow: only the geometry CDK writes (transforms, the preview's fixed position and size, the handle's touch
   and selection locks) and a visually hidden live region for the keyboard announcements.

   On drop the list dispatches a bubbling "coho:reorder" event. event.detail has ids (each row's data-id, in the new
   order), id (the moved row), from and to (its old and new index), and save(promise). Pass save the promise of your
   request: while it is pending the list cannot be reordered, and if it rejects the rows go back to their previous order.
   The step numbers (card__detail--step-index) are renumbered after every move. Set aria-busy="true" on the list yourself
   to stop reordering for a while, for example while a form of your own is open. */
(function () {
  'use strict';

  var LIST = '.card__detail--step-list';
  var ROW = '.card__detail--step-holder';
  var HANDLE = '.card__detail--step-drag';
  var INDEX = '.card__detail--step-index';
  var NAME = '.card__detail--step-description p';
  var DRAG_THRESHOLD = 5;        // CDK dragStartThreshold: pixels of movement before a press becomes a drag
  var DIRECTION_THRESHOLD = 5;   // CDK pointerDirectionChangeThreshold
  var EDGE = 0.05;               // CDK DROP_PROXIMITY_THRESHOLD and SCROLL_PROXIMITY_THRESHOLD
  var SCROLL_STEP = 2;           // CDK AUTO_SCROLL_STEP, pixels per frame

  var pending = null;   // a press on a handle, before and during a pointer drag
  var drag = null;      // the pointer drag in progress, until its drop animation ends
  var grab = null;      // the row picked up from the keyboard
  var moving = false;   // a keyboard move is re-inserting the row, so its handle's blur is not a cancel
  var stash = typeof WeakMap === 'function' ? new WeakMap() : null;   // handle -> its children while the list has one row
  var live = null;

  function rowsOf(list) {
    var rows = [];
    for (var child = list.firstElementChild; child; child = child.nextElementSibling) {
      if (child.matches(ROW)) rows.push(child);
    }
    return rows;
  }

  function listOf(row) {
    var list = row.parentElement;
    return list && list.matches(LIST) ? list : null;
  }

  function nameOf(row) {
    var p = row.querySelector(NAME);
    var text = p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
    return text || 'row';
  }

  function idOf(row) {
    return row.getAttribute('data-id') || row.id || null;
  }

  function isBusy(list) {
    return list.getAttribute('aria-busy') === 'true';
  }

  function setBusy(list, on) {
    if (on) list.setAttribute('aria-busy', 'true');
    else list.removeAttribute('aria-busy');
  }

  // The locks CDK puts on a handle (toggleNativeDragInteractions).
  function lock(el) {
    var s = el.style;
    s.touchAction = 'none';
    s.webkitUserDrag = 'none';
    s.webkitTapHighlightColor = 'transparent';
    s.userSelect = 'none';
    s.webkitUserSelect = 'none';
  }

  function unlock(el) {
    var s = el.style;
    s.touchAction = '';
    s.webkitUserDrag = '';
    s.webkitTapHighlightColor = '';
    s.userSelect = '';
    s.webkitUserSelect = '';
  }

  function renumber(list) {
    rowsOf(list).forEach(function (row, i) {
      var index = row.querySelector(INDEX);
      if (index) index.textContent = String(i + 1);
    });
  }

  // A handle cell that is not a handle: no runtime class, not focusable, no lock. The one-row rule and a cell authored
  // empty (COHO's row that cannot be moved) both end here.
  function disarm(handle) {
    handle.classList.remove('cdk-drag-handle');
    handle.removeAttribute('tabindex');
    handle.removeAttribute('role');
    handle.removeAttribute('aria-label');
    unlock(handle);
  }

  // Bring a list up to date: the runtime classes, the handles' state, the one-row rule.
  function refresh(list) {
    list.classList.add('cdk-drop-list');
    var rows = rowsOf(list);
    var canReorder = rows.length > 1;
    rows.forEach(function (row) {
      row.classList.add('cdk-drag');
      var handle = row.querySelector(HANDLE);
      if (!handle) return;
      if (canReorder) {
        if (stash && stash.has(handle)) {
          stash.get(handle).forEach(function (node) { handle.appendChild(node); });
          stash.delete(handle);
        }
        if (!handle.firstElementChild) { disarm(handle); return; }   // authored empty: COHO's row that cannot be moved
        handle.classList.add('cdk-drag-handle');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('role', 'button');
        handle.setAttribute('aria-label', 'Reorder ' + nameOf(row));
        lock(handle);
      } else {
        if (stash && handle.firstChild && !stash.has(handle)) {
          var nodes = [];
          while (handle.firstChild) nodes.push(handle.removeChild(handle.firstChild));
          stash.set(handle, nodes);
        }
        disarm(handle);
      }
    });
  }

  var scanQueued = false;
  function scan() {
    scanQueued = false;
    if (drag) return;
    var lists = document.querySelectorAll(LIST);
    for (var i = 0; i < lists.length; i++) refresh(lists[i]);
  }

  function queueScan() {
    if (scanQueued || drag) return;
    scanQueued = true;
    Promise.resolve().then(scan);
  }

  // Tell the page, and give it the hooks for disabling the list while it saves and putting the rows back if it fails.
  function dispatch(list, row, from, to, previous) {
    renumber(list);
    var detail = {
      ids: rowsOf(list).map(idOf),
      id: idOf(row),
      from: from,
      to: to,
      save: function (promise) {
        setBusy(list, true);
        Promise.resolve(promise).then(function () {
          setBusy(list, false);
        }, function () {
          restore(list, previous);
          setBusy(list, false);
        });
      }
    };
    list.dispatchEvent(new CustomEvent('coho:reorder', { bubbles: true, detail: detail }));
  }

  function restore(list, previous) {
    previous.forEach(function (row) {
      if (row.parentElement === list) list.appendChild(row);
    });
    renumber(list);
  }

  // Announcements for the keyboard sequence, in a live region nothing shows on screen.
  function announce(text) {
    if (!live) {
      live = document.createElement('div');
      live.setAttribute('aria-live', 'assertive');
      live.setAttribute('aria-atomic', 'true');
      var s = live.style;
      s.position = 'absolute';
      s.width = '1px';
      s.height = '1px';
      s.margin = '-1px';
      s.overflow = 'hidden';
      s.clip = 'rect(0 0 0 0)';
      s.whiteSpace = 'nowrap';
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 100);
  }

  // ---- Pointer drag -------------------------------------------------------------------------------------------------

  function mutable(rect) {
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
  }

  function shift(rect, top, left) {
    rect.top += top;
    rect.bottom += top;
    rect.left += left;
    rect.right += left;
  }

  function nearRect(rect, threshold, x, y) {
    var xThreshold = rect.width * threshold;
    var yThreshold = rect.height * threshold;
    return y > rect.top - yThreshold && y < rect.bottom + yThreshold && x > rect.left - xThreshold && x < rect.right + xThreshold;
  }

  function insideRect(rect, x, y) {
    return y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right;
  }

  function setTransform(el, x, y) {
    el.style.transform = 'translate3d(' + Math.round(x) + 'px, ' + Math.round(y) + 'px, 0)';
  }

  function combine(transform, initial) {
    return initial && initial !== 'none' ? transform + ' ' + initial : transform;
  }

  // A clone the way CDK makes one: ids dropped, form control state carried over.
  function cloneRow(row) {
    var clone = row.cloneNode(true);
    clone.removeAttribute('id');
    var withId = clone.querySelectorAll('[id]');
    for (var i = 0; i < withId.length; i++) withId[i].removeAttribute('id');
    var from = row.querySelectorAll('input, select, textarea');
    var to = clone.querySelectorAll('input, select, textarea');
    for (var k = 0; k < from.length && k < to.length; k++) {
      if (from[k].type === 'checkbox' || from[k].type === 'radio') to[k].checked = from[k].checked;
      else if (from[k].type !== 'file') to[k].value = from[k].value;
    }
    return clone;
  }

  function scrollParents(list) {
    var parents = [];
    for (var el = list.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      var style = getComputedStyle(el);
      if (/auto|scroll/.test(style.overflowY)) parents.push(el);
    }
    return parents;
  }

  function moveItem(items, from, to) {
    var item = items.splice(from, 1)[0];
    items.splice(to, 0, item);
  }

  function start(p) {
    var row = p.row;
    var list = p.list;
    var rect = row.getBoundingClientRect();
    p.started = true;
    drag = p;
    p.pickup = { x: p.x - rect.left, y: p.y - rect.top };
    p.rows = rowsOf(list);
    p.from = p.rows.indexOf(row);
    p.delta = { x: 0, y: 0 };
    p.directionPoint = { x: p.x, y: p.y };
    p.swap = { el: null, delta: 0, overlaps: false };
    p.last = { x: p.x, y: p.y };

    var placeholder = cloneRow(row);
    placeholder.classList.add('cdk-drag-placeholder');
    placeholder.style.pointerEvents = 'none';
    p.placeholder = placeholder;

    var preview = cloneRow(row);
    preview.classList.add('cdk-drag-preview');
    var s = preview.style;
    s.pointerEvents = 'none';
    s.margin = '0';
    s.position = 'fixed';
    s.top = '0';
    s.left = '0';
    s.zIndex = '1000';
    s.width = rect.width + 'px';
    s.height = rect.height + 'px';
    lock(preview);
    setTransform(preview, rect.left, rect.top);
    p.preview = preview;

    // The row leaves the list hidden and the placeholder stands in its place (CDK toggleVisibility + replaceChild).
    row.classList.add('cdk-drag-dragging');
    var r = row.style;
    r.position = 'fixed';
    r.top = '0';
    r.left = '0';
    r.opacity = '0';
    r.pointerEvents = 'none';
    list.replaceChild(placeholder, row);
    document.body.appendChild(row);
    document.body.appendChild(preview);
    list.classList.add('cdk-drop-list-dragging');

    // Positions, cached once and shifted as things scroll (CDK ParentPositionTracker and the sort strategy's cache).
    p.positions = new Map();
    p.positions.set(document, { scroll: { top: window.pageYOffset, left: window.pageXOffset } });
    p.parents = scrollParents(list);
    [list].concat(p.parents).forEach(function (el) {
      p.positions.set(el, { scroll: { top: el.scrollTop, left: el.scrollLeft }, rect: mutable(el.getBoundingClientRect()) });
    });
    p.listRect = p.positions.get(list).rect;
    p.items = rowsOf(list).map(function (el) {
      return { el: el, offset: 0, initialTransform: el.style.transform || '', rect: mutable(el.getBoundingClientRect()) };
    });
    p.scrollNode = null;
    p.scrollDirection = 0;
    p.scrollFrame = 0;
    document.addEventListener('scroll', onScroll, true);
  }

  function updateDirection(p, x, y) {
    if (Math.abs(x - p.directionPoint.x) > DIRECTION_THRESHOLD) {
      p.delta.x = x > p.directionPoint.x ? 1 : -1;
      p.directionPoint.x = x;
    }
    if (Math.abs(y - p.directionPoint.y) > DIRECTION_THRESHOLD) {
      p.delta.y = y > p.directionPoint.y ? 1 : -1;
      p.directionPoint.y = y;
    }
  }

  function indexFromPointer(p, y) {
    var fy = Math.floor(y);
    for (var i = 0; i < p.items.length; i++) {
      var item = p.items[i];
      if (item.el === p.placeholder) continue;
      if (item.el === p.swap.el && p.swap.overlaps && p.delta.y === p.swap.delta) continue;
      if (fy >= Math.floor(item.rect.top) && fy < Math.floor(item.rect.bottom)) return i;
    }
    return -1;
  }

  // CDK's single-axis sort: the rows the pointer has passed shift by a transform, the placeholder takes their place.
  function sort(p, x, y) {
    if (!nearRect(p.listRect, EDGE, x, y)) return;
    var items = p.items;
    var newIndex = indexFromPointer(p, y);
    if (newIndex === -1) return;
    var currentIndex = -1;
    for (var i = 0; i < items.length; i++) if (items[i].el === p.placeholder) currentIndex = i;
    var target = items[newIndex];
    var currentRect = items[currentIndex].rect;
    var newRect = target.rect;
    var delta = currentIndex > newIndex ? 1 : -1;

    var itemOffset = newRect.top - currentRect.top;
    if (delta === -1) itemOffset += newRect.height - currentRect.height;
    var siblingOffset = currentRect.height * delta;
    var immediate = items[currentIndex - delta];
    if (immediate) {
      if (delta === -1) siblingOffset -= immediate.rect.top - currentRect.bottom;
      else siblingOffset += currentRect.top - immediate.rect.bottom;
    }

    var oldOrder = items.slice();
    moveItem(items, currentIndex, newIndex);
    items.forEach(function (item, index) {
      if (oldOrder[index] === item) return;
      var offset = item.el === p.placeholder ? itemOffset : siblingOffset;
      item.offset += offset;
      item.el.style.transform = combine('translate3d(0, ' + Math.round(item.offset) + 'px, 0)', item.initialTransform);
      shift(item.rect, offset, 0);
    });
    p.swap.overlaps = insideRect(newRect, x, y);
    p.swap.el = target.el;
    p.swap.delta = p.delta.y;
  }

  function verticalDirection(rect, y) {
    var threshold = rect.height * EDGE;
    if (y >= rect.top - threshold && y <= rect.top + threshold) return -1;
    if (y >= rect.bottom - threshold && y <= rect.bottom + threshold) return 1;
    return 0;
  }

  // Scroll the nearest scrolling parent, or the window, while the pointer is near its edge.
  function autoScroll(p, x, y) {
    var node = null;
    var direction = 0;
    for (var i = 0; i < p.parents.length && !node; i++) {
      var el = p.parents[i];
      var rect = p.positions.get(el).rect;
      if (!nearRect(rect, EDGE, x, y)) continue;
      var d = verticalDirection(rect, y);
      if (d === -1 && el.scrollTop > 0) { node = el; direction = -1; }
      else if (d === 1 && el.scrollHeight - el.scrollTop > el.clientHeight) { node = el; direction = 1; }
    }
    if (!node) {
      var viewport = { top: 0, bottom: window.innerHeight, height: window.innerHeight };
      direction = verticalDirection(viewport, y);
      if (direction) node = window;
    }
    if (node !== p.scrollNode || direction !== p.scrollDirection) {
      p.scrollNode = node;
      p.scrollDirection = direction;
      stopScrolling(p);
      if (node && direction) {
        var frame = function () {
          p.scrollFrame = requestAnimationFrame(frame);
          p.scrollNode.scrollBy(0, SCROLL_STEP * p.scrollDirection);
        };
        p.scrollFrame = requestAnimationFrame(frame);
      }
    }
  }

  function stopScrolling(p) {
    if (p.scrollFrame) cancelAnimationFrame(p.scrollFrame);
    p.scrollFrame = 0;
  }

  function onScroll(event) {
    var p = drag;
    if (!p || !p.positions) return;
    var target = event.target === document || event.target === window ? document : event.target;
    var cached = p.positions.get(target);
    if (!cached) return;
    var newTop = target === document ? window.pageYOffset : target.scrollTop;
    var newLeft = target === document ? window.pageXOffset : target.scrollLeft;
    var top = cached.scroll.top - newTop;
    var left = cached.scroll.left - newLeft;
    p.positions.forEach(function (position, node) {
      if (position.rect && node !== target && target.contains(node)) shift(position.rect, top, left);
    });
    cached.scroll.top = newTop;
    cached.scroll.left = newLeft;
    p.items.forEach(function (item) { shift(item.rect, top, left); });
    sort(p, p.last.x, p.last.y);
  }

  function onPointerDown(event) {
    if (pending || drag || grab || event.button !== 0) return;
    var target = event.target;
    var handle = target.closest ? target.closest(HANDLE) : null;
    if (!handle || !handle.classList.contains('cdk-drag-handle')) return;
    var row = handle.closest(ROW);
    var list = row && listOf(row);
    if (!list || isBusy(list) || rowsOf(list).length < 2) return;
    pending = { handle: handle, row: row, list: list, x: event.clientX, y: event.clientY, pointerId: event.pointerId, started: false };
    // Capture keeps the moves and the release coming when the pointer leaves the quick view's frame.
    if (handle.setPointerCapture) { try { handle.setPointerCapture(event.pointerId); } catch (e) { } }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onPointerMove(event) {
    var p = pending;
    if (!p || event.pointerId !== p.pointerId) return;
    var x = event.clientX;
    var y = event.clientY;
    if (!p.started) {
      if (Math.abs(x - p.x) + Math.abs(y - p.y) < DRAG_THRESHOLD) return;
      if (event.cancelable) event.preventDefault();
      start(p);
    }
    if (event.cancelable) event.preventDefault();
    p.last.x = x;
    p.last.y = y;
    updateDirection(p, x, y);
    setTransform(p.preview, x - p.pickup.x, y - p.pickup.y);
    sort(p, x, y);
    autoScroll(p, x, y);
  }

  // The page must not scroll while a row is held.
  function onTouchMove(event) {
    if (pending && pending.started && event.cancelable) event.preventDefault();
  }

  function onPointerUp(event) {
    var p = pending;
    if (!p || event.pointerId !== p.pointerId) return;
    pending = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('touchmove', onTouchMove);
    if (p.started) finish(p);
  }

  function transitionMs(el) {
    var style = getComputedStyle(el);
    var trim = function (s) { return s.trim(); };
    var properties = style.transitionProperty.split(',').map(trim);
    var index = -1;
    for (var i = 0; i < properties.length; i++) {
      if (properties[i] === 'transform' || properties[i] === 'all') { index = i; break; }
    }
    if (index === -1) return 0;
    var toMs = function (value) {
      var n = parseFloat(value) || 0;
      return /ms$/.test(value) ? n : n * 1000;
    };
    var durations = style.transitionDuration.split(',').map(trim);
    var delays = style.transitionDelay.split(',').map(trim);
    return toMs(durations[index % durations.length]) + toMs(delays[index % delays.length]);
  }

  // Release: the preview animates to the placeholder, then the row takes the placeholder's place and every inline style goes.
  function finish(p) {
    stopScrolling(p);
    document.removeEventListener('scroll', onScroll, true);
    var preview = p.preview;
    var placeholderRect = p.placeholder.getBoundingClientRect();
    preview.classList.add('cdk-drag-animating');
    setTransform(preview, placeholderRect.left, placeholderRect.top);
    var duration = transitionMs(preview);
    var done = false;
    var timer = 0;
    var complete = function (event) {
      if (done) return;
      if (event && (event.target !== preview || event.propertyName !== 'transform')) return;
      done = true;
      clearTimeout(timer);
      preview.removeEventListener('transitionend', complete);
      settle(p);
    };
    if (duration === 0) {
      complete();
    } else {
      timer = setTimeout(complete, duration * 1.5);
      preview.addEventListener('transitionend', complete);
    }
  }

  function settle(p) {
    var list = p.list;
    var row = p.row;
    if (p.preview.parentNode) p.preview.parentNode.removeChild(p.preview);
    if (p.placeholder.parentNode === list) list.replaceChild(row, p.placeholder);
    else list.appendChild(row);
    var r = row.style;
    r.position = '';
    r.top = '';
    r.left = '';
    r.opacity = '';
    r.pointerEvents = '';
    row.classList.remove('cdk-drag-dragging');
    // The DOM takes the order the sort arrived at (CDK leaves that to the app; here the script owns the list), and the
    // transforms that showed it go.
    p.items.forEach(function (item) {
      var el = item.el === p.placeholder ? row : item.el;
      el.style.transform = item.initialTransform;
      list.appendChild(el);
    });
    list.classList.remove('cdk-drop-list-dragging');
    drag = null;
    var to = rowsOf(list).indexOf(row);
    if (to !== p.from) dispatch(list, row, p.from, to, p.rows);
    queueScan();
  }

  // ---- Keyboard -----------------------------------------------------------------------------------------------------

  function focusHandle(handle) {
    moving = true;
    try { handle.focus({ preventScroll: false }); } finally { moving = false; }
  }

  function onKeyDown(event) {
    var handle = event.target;
    if (!handle.matches || !handle.matches(HANDLE) || !handle.classList.contains('cdk-drag-handle')) return;
    var row = handle.closest(ROW);
    var list = row && listOf(row);
    if (!list || drag || pending) return;
    var key = event.key;
    var isPick = key === ' ' || key === 'Spacebar' || key === 'Enter';

    if (!grab) {
      if (!isPick || isBusy(list) || rowsOf(list).length < 2) return;
      event.preventDefault();
      var rows = rowsOf(list);
      grab = { handle: handle, row: row, list: list, rows: rows, from: rows.indexOf(row) };
      announce(nameOf(row) + ' picked up, position ' + (grab.from + 1) + ' of ' + rows.length + '. Arrow keys move it, Space drops it, Escape cancels.');
      return;
    }
    if (grab.handle !== handle) return;

    if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      var current = rowsOf(list);
      var at = current.indexOf(row);
      var next = key === 'ArrowUp' ? at - 1 : at + 1;
      if (next < 0 || next >= current.length) return;
      moving = true;
      if (key === 'ArrowUp') list.insertBefore(row, current[next]);
      else list.insertBefore(row, current[next].nextElementSibling);
      moving = false;
      renumber(list);
      focusHandle(handle);
      announce(nameOf(row) + ', position ' + (next + 1) + ' of ' + current.length + '.');
    } else if (isPick) {
      event.preventDefault();
      var g = grab;
      grab = null;
      var to = rowsOf(list).indexOf(row);
      announce(nameOf(row) + ' dropped, position ' + (to + 1) + ' of ' + rowsOf(list).length + '.');
      if (to !== g.from) dispatch(list, row, g.from, to, g.rows);
    } else if (key === 'Escape' || key === 'Esc') {
      event.preventDefault();
      cancelGrab();
      focusHandle(handle);
    }
  }

  function cancelGrab() {
    if (!grab) return;
    var g = grab;
    grab = null;
    moving = true;
    restore(g.list, g.rows);
    moving = false;
    announce(nameOf(g.row) + ' back at position ' + (g.from + 1) + '. Reorder cancelled.');
  }

  function onFocusOut(event) {
    if (grab && event.target === grab.handle && !moving) cancelGrab();
  }

  // ---- Wiring -------------------------------------------------------------------------------------------------------

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('dragstart', function (event) { if (pending) event.preventDefault(); });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
