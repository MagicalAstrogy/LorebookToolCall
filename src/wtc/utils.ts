export function stoppableEventOn<T extends EventType>(event_type: T, listener: ListenerType[T]) {
  eventOn(event_type, listener);
  return () => eventRemoveListener(event_type, listener);
}
