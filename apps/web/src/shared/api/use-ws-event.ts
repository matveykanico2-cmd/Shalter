import { useEffect, useRef, useSyncExternalStore } from "react";

import { ws, type WsEvents, type WsEventType } from "./ws";

/** Подписка компонента на событие сокета; обработчик — всегда последний из рендера. */
export function useWsEvent<T extends WsEventType>(type: T, handler: (event: WsEvents[T]) => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => ws.on(type, (event) => latest.current(event)), [type]);
}

/** Статус сокета: на связи, давно не на связи, открывался ли уже. */
export function useWsStatus() {
  return useSyncExternalStore(subscribeWsState, ws.status);
}

const subscribeWsState = (onChange: () => void) => ws.on("ws:state", onChange);
