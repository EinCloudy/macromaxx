import React from 'react';
import { Icon } from '../../icons.jsx';
import { Button } from '../../components/ui.jsx';

export function Activity({ logs, onClear, onStop }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Activity</h1>
          <p>Action results and errors.</p>
        </div>
        <Button icon="Square" onClick={onStop}>
          Stop all
        </Button>
      </section>
      <section className="activity-panel">
        <div className="panel-top">
          <strong>Activity log</strong>
          <Button className="small" icon="Trash2" onClick={onClear}>
            Clear
          </Button>
        </div>
        {logs.length ? (
          logs.map((item) => (
            <div className={`log-row ${item.level}`} key={item.id}>
              <span className="log-icon">
                <Icon
                  name={
                    item.level === 'error'
                      ? 'CircleAlert'
                      : item.level === 'success'
                        ? 'Check'
                        : 'Info'
                  }
                  size={18}
                />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
              </div>
              <time>{new Date(item.time).toLocaleTimeString('en-GB')}</time>
            </div>
          ))
        ) : (
          <div className="large-empty">
            <Icon name="Activity" size={32} />
            <h3>No activity yet</h3>
            <p>Run a key to see its result here.</p>
          </div>
        )}
      </section>
    </>
  );
}
