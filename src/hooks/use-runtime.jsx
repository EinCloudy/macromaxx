import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { missingWorkspaceCredentials } from '../../shared/workspace-credentials.js';

export function useRuntime({ replace, flush, notify }) {
  const [status, setStatus] = useState({});
  const [path, setPath] = useState([]);
  const [selected, setSelected] = useState(0);
  const [logs, setLogs] = useState([]);
  const [pressed, setPressed] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [credentialsRequired, setCredentialsRequired] = useState(false);

  useEffect(() => {
    let disposed = false;
    api
      .init()
      .then((data) => {
        if (disposed) return;
        replace(data.state);
        setCredentialsRequired(missingWorkspaceCredentials(data.state).length > 0);
        setStatus(data.status);
        setPath(data.folderPath);
        setLogs(data.logs);
      })
      .catch((error) => {
        if (!disposed) notify(error.message, true);
      });
    api
      .plugins()
      .then((items) => {
        if (!disposed) setPlugins(items);
      })
      .catch((error) => {
        if (!disposed) notify(error.message, true);
      });

    const unsubscribe = api.subscribe((event) => {
      switch (event.type) {
        case 'credentialsRequired':
          setCredentialsRequired(true);
          break;
        case 'flush':
          flush()
            .catch(() => {})
            .finally(() => api.flushComplete(event.id));
          break;
        case 'status':
          setStatus(event.status);
          break;
        case 'state':
          replace(event.state);
          setPath(event.folderPath);
          setSelected(0);
          break;
        case 'log':
          setLogs((items) => [event.item, ...items].slice(0, 200));
          break;
        case 'press':
          setPressed((items) =>
            event.down
              ? [...new Set([...items, event.index])]
              : items.filter((index) => index !== event.index),
          );
          break;
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [replace, flush, notify]);

  const refreshPlugins = async () => setPlugins(await api.plugins());
  return {
    status,
    path,
    setPath,
    selected,
    setSelected,
    logs,
    clearLogs: () => setLogs([]),
    pressed,
    plugins,
    refreshPlugins,
    credentialsRequired,
    setCredentialsRequired,
  };
}
