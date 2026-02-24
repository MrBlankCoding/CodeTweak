# Storage APIs

CodeTweak provides a persistent storage system that allows scripts to save data across page reloads and browser restarts.

## Implementation Details

CodeTweak uses a **dual-layer storage system**:

1.  **Local Cache**: For synchronous access, values are cached in the script's execution context.
2.  **Extension Storage**: The source of truth is stored in the extension's background process, ensuring data persists even if the tab is closed.

### Synchronous vs. Asynchronous

- `GM_getValue` (Sync): Returns the cached value immediately. If the value isn't in the cache yet, it returns the default value and triggers an asynchronous fetch to update the cache for the next call.
- `GM.getValue` (Async): Always waits for the background process to return the latest value.

---

## GM_setValue

Stores a value in the script's persistent storage.

```javascript
GM_setValue(name: string, value: any): Promise<void>
```

- **name**: A unique key for the data.
- **value**: Any JSON-serializable object, array, or primitive.

---

## GM_getValue

Retrieves a value from storage.

```javascript
GM_getValue(name: string, defaultValue?: any): any
GM.getValue(name: string, defaultValue?: any): Promise<any>
```

- **name**: The key to retrieve.
- **defaultValue**: Returned if the key does not exist.

---

## GM_deleteValue

Removes a key and its value from storage.

```javascript
GM_deleteValue(name: string): Promise<void>
```

---

## GM_listValues

Returns an array of all keys currently stored by the script.

```javascript
GM_listValues(): string[]
GM.listValues(): Promise<string[]>
```

---

## Value Change Listeners

CodeTweak supports monitoring changes to storage values, which is useful for communicating between multiple instances of the same script running in different tabs.

### GM_addValueChangeListener

Adds a listener that triggers when a specific key is modified.

```javascript
GM_addValueChangeListener(
  name: string,
  callback: (name: string, oldValue: any, newValue: any, remote: boolean) => void
): number
```

- **remote**: `true` if the change originated from a different tab or script instance.

### GM_removeValueChangeListener

Removes a listener using the ID returned by `GM_addValueChangeListener`.

```javascript
GM_removeValueChangeListener(listenerId: number): void
```
