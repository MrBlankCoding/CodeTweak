# Writing Userscripts

This guide explains how to write userscripts for CodeTweak, assuming you are already familiar with JavaScript.

## The Metadata Block

Every userscript starts with a metadata block (also known as the userscript header). This block tells CodeTweak when and where to run your script.

```javascript
// ==UserScript==
// @name        My Awesome Script
// @namespace   https://mrblankcoding.github.io/CodeTweak/
// @version     1.0
// @description Does something amazing
// @author      You
// @match       https://example.com/*
// @grant       GM_setValue
// @grant       GM_getValue
// @run-at      document-end
// ==/UserScript==
```

### Key Metadata Tags

- **@name**: The name of your script.
- **@match**: Defines the URLs where your script should run. You can use wildcards (e.g., `*`).
- **@run-at**: Controls when the script executes:
  - `document-start`: Runs before any DOM is loaded.
  - `document-end`: Runs when the DOM is fully loaded.
  - `document-idle`: Runs after the page and all resources are loaded.
- **@grant**: Requests access to specific `GM_*` APIs. Use `none` if you don't need any.
- **@require**: Includes external libraries (e.g., jQuery).

## Structuring Your Script

It is best practice to wrap your script in an Immediately Invoked Function Expression (IIFE) to avoid polluting the global scope and to prevent conflicts with the website's own scripts.

```javascript
(function() {
    'use strict';

    // Your code here
    console.log('Script loaded on ' + window.location.href);

    const button = document.createElement('button');
    button.textContent = 'Click Me';
    button.style.position = 'fixed';
    button.style.top = '10px';
    button.style.right = '10px';
    button.onclick = () => alert('Hello from CodeTweak!');
    
    document.body.appendChild(button);
})();
```

## Using GM APIs

CodeTweak provides several APIs to perform tasks that standard web scripts cannot, such as cross-origin requests or persistent storage.

### Persistent Storage

Use `GM_setValue` and `GM_getValue` to store data that persists across page reloads and even browser restarts.

```javascript
// Store a value
GM_setValue('username', 'Alice');

// Retrieve a value
const name = GM_getValue('username', 'Guest');
console.log('Hello, ' + name);
```

### Cross-Origin Requests

Use `GM_xmlhttpRequest` to fetch data from domains other than the one the script is running on.

```javascript
GM_xmlhttpRequest({
    method: "GET",
    url: "https://api.example.com/data",
    onload: function(response) {
        console.log(JSON.parse(response.responseText));
    }
});
```

## Best Practices

1. **Be Specific with @match**: Only run your script on the pages it is needed for to improve performance and security.
2. **Check for Element Existence**: When manipulating the DOM, always ensure the elements you are looking for exist, especially if using `document-start`.
3. **Use 'use strict'**: Helps catch common coding mistakes.
4. **Minimal @grant**: Only request the permissions you actually use.
