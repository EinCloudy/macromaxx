import React, { useEffect, useRef } from 'react';
import { Icon } from '../../icons.jsx';
import { Switch } from '../../components/ui.jsx';
import {
  SCREENSAVERS,
  SCREENSAVER_GRAPHICS_PRESETS,
  screensaverSettings,
  screensaverFrame,
  screensaverBudget,
} from '../../../shared/screensaver.js';

export function ScreensaverSettings({ state, status, change }) {
  const settings = screensaverSettings(state.settings);
  const canvas = useRef(null);
  const columns = status.device?.columns || 5;
  const rows = status.device?.rows || 3;
  const budget = screensaverBudget(state.settings, columns * rows);
  const preset = SCREENSAVER_GRAPHICS_PRESETS.find(({ id }) => id === settings.performance);
  const update = (patch) =>
    change((next) => {
      next.settings.screensaver = { ...screensaverSettings(next.settings), ...patch };
    });
  useEffect(() => {
    const context = canvas.current.getContext('2d');
    const { tile } = screensaverBudget(state.settings, columns * rows);
    const width = columns * tile,
      height = rows * tile;
    const image = context.createImageData(width, height);
    const pixels = new Uint8Array(width * height * 3);
    const budget = screensaverBudget(state.settings, columns * rows);
    const start = performance.now();
    let timer;
    let visible = typeof IntersectionObserver === 'undefined';
    const draw = () => {
      const frame = screensaverFrame(
        settings.effect,
        width,
        height,
        (performance.now() - start) / 1000,
        pixels,
      );
      for (let i = 0, j = 0; i < frame.length; i += 3, j += 4) {
        image.data[j] = frame[i];
        image.data[j + 1] = frame[i + 1];
        image.data[j + 2] = frame[i + 2];
        image.data[j + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      context.fillStyle = '#101114';
      const gap = Math.max(2, Math.round(tile / 12));
      for (let col = 1; col < columns; col++)
        context.fillRect(col * tile - gap / 2, 0, gap, height);
      for (let row = 1; row < rows; row++) context.fillRect(0, row * tile - gap / 2, width, gap);
    };
    const sync = () => {
      clearInterval(timer);
      if (document.hidden || !visible) return;
      draw();
      timer = setInterval(draw, 1000 / budget.fps);
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
          });
    observer?.observe(canvas.current);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      clearInterval(timer);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [settings.effect, settings.performance, columns, rows]);

  return (
    <section className="settings-card">
      <div className="settings-title">
        <span className="action-icon">
          <Icon name="Monitor" />
        </span>
        <div>
          <h3>Screensaver</h3>
          <p>Animated scenes across your Stream Deck.</p>
        </div>
      </div>
      <canvas
        ref={canvas}
        width={columns * budget.tile}
        height={rows * budget.tile}
        className="screensaver-preview"
        role="img"
        aria-label={`${SCREENSAVERS.find((item) => item.id === settings.effect)?.name} screensaver preview`}
      />
      <div className="setting-line">
        <div>
          <strong>Enable screensaver</strong>
          <small>Start automatically when you are away.</small>
        </div>
        <Switch
          label="Enable screensaver"
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </div>
      <div className="setting-line">
        <div>
          <strong>Graphics preset</strong>
          <small>{preset?.description}</small>
        </div>
        <select
          aria-label="Screensaver graphics preset"
          value={settings.performance}
          onChange={(event) => update({ performance: event.target.value })}
        >
          {SCREENSAVER_GRAPHICS_PRESETS.map(({ id, name, fps }) => (
            <option key={id} value={id}>
              {name} (up to {fps} FPS)
            </option>
          ))}
        </select>
      </div>
      <p className="muted-text">
        {budget.tile} × {budget.tile} scene pixels per key · up to {Number(budget.fps.toFixed(1))}{' '}
        FPS on this layout. Larger decks adapt automatically. Actual frame rate depends on USB speed
        and system load. The preview uses the selected quality.
      </p>
      <div className="setting-line">
        <div>
          <strong>Effect</strong>
          <small>Preview updates immediately.</small>
        </div>
        <select
          aria-label="Screensaver effect"
          value={settings.effect}
          onChange={(event) => update({ effect: event.target.value })}
        >
          {SCREENSAVERS.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-line">
        <div>
          <strong>Start after</strong>
          <small>Seconds without computer or deck input (10–86,400).</small>
        </div>
        <input
          type="number"
          aria-label="Screensaver idle seconds"
          min="10"
          max="86400"
          step="1"
          className="screensaver-timeout"
          defaultValue={settings.timeout}
          key={settings.timeout}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 10 && value <= 86400)
              update({ timeout: value });
            else event.target.value = settings.timeout;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      <p className="muted-text">
        The first deck press only wakes the keys; it does not run an action. Mouse or keyboard
        activity also restores your keys. Runs even with the app in the tray.
      </p>
    </section>
  );
}
